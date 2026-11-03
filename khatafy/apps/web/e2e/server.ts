// E2E mock backend: static server for the built app + fake GoTrue/Storage + PostgREST-style RPC,
// where every RPC call runs the REAL migrations on a real PostgreSQL database as role "authenticated".
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../../supabase/tests/harness';
import { sq } from '../../../supabase/tests/harness';

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const ARRAY_PARAMS = new Set(['p_ids']);

interface User { id: string; email: string; password: string; confirmed: boolean; name: string }

export interface Mock {
  server: Server; url: string; users: Map<string, User>; sent: Array<{ kind: string; email: string }>;
  confirmEmail: boolean; signupMeta: Map<string, Record<string, unknown>>; close(): Promise<void>;
  /** simulate the user clicking the confirmation link */
  confirm(email: string): void;
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const unb64 = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

function literal(name: string, v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return sq(v);
  if (Array.isArray(v) && ARRAY_PARAMS.has(name)) return sq(`{${v.join(',')}}`);
  return sq(JSON.stringify(v));
}

export async function startMock(opts: { db: Db; distDir: string; port?: number; confirmEmail?: boolean }): Promise<Mock> {
  const { db, distDir } = opts;
  const users = new Map<string, User>();
  const files = new Map<string, { type: string; buf: Buffer }>();
  const sent: Mock['sent'] = [];
  const mock: Partial<Mock> = { users, sent, signupMeta: new Map(), confirmEmail: opts.confirmEmail ?? true };

  const sessionFor = (u: User) => ({
    access_token: b64({ sub: u.id, email: u.email, exp: Math.floor(Date.now() / 1000) + 3600 }), refresh_token: 'e2e', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u.id, email: u.email, user_metadata: { full_name: u.name }, identities: [{ id: u.id }] },
  });
  const userFromToken = (req: IncomingMessage): User | 'expired' | null => {
    const h = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!h) return null;
    try {
      const p = unb64(h);
      if (p.exp < Date.now() / 1000) return 'expired';
      return [...users.values()].find((u) => u.id === p.sub) ?? null;
    } catch { return null; }
  };
  const body = (req: IncomingMessage) => new Promise<any>((res) => { const c: Buffer[] = []; req.on('data', (d) => c.push(d)); req.on('end', () => { try { res(JSON.parse(Buffer.concat(c).toString() || '{}')); } catch { res({}); } }); });
  const send = (res: ServerResponse, status: number, data: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname;
    try {
      if (p.startsWith('/__mock/')) {
        const route = p.slice('/__mock/'.length);
        if (req.method === 'GET' && route.startsWith('file/')) {
          const f = files.get(decodeURIComponent(route.slice(5)));
          if (!f) { res.writeHead(404); return res.end(); }
          res.writeHead(200, { 'content-type': f.type }); return res.end(f.buf);
        }
        const b = await body(req);
        if (route === 'auth/signup') {
          const email = String(b.email).trim().toLowerCase();
          if (users.has(email)) return send(res, 200, { user: { id: randomUUID(), email, identities: [] }, session: null });
          if (String(b.password).length < 8) return send(res, 200, { error: 'Password should be at least 8 characters.', code: 'weak_password' });
          const name = b.data?.full_name ?? email.split('@')[0];
          mock.signupMeta!.set(email, b.data ?? {});
          const id = db.user(email, name);
          const u: User = { id, email, password: b.password, confirmed: !mock.confirmEmail, name };
          users.set(email, u);
          if (mock.confirmEmail) sent.push({ kind: 'confirm', email });
          return send(res, 200, { user: { id, email, identities: [{ id }] }, session: u.confirmed ? sessionFor(u) : null });
        }
        if (route === 'auth/signin') {
          const u = users.get(String(b.email).trim().toLowerCase());
          if (!u || u.password !== b.password) return send(res, 200, { error: 'Invalid login credentials', code: 'invalid_credentials' });
          if (!u.confirmed) return send(res, 200, { error: 'Email not confirmed', code: 'email_not_confirmed' });
          return send(res, 200, { session: sessionFor(u) });
        }
        if (route === 'auth/reset') { sent.push({ kind: 'reset', email: String(b.email).toLowerCase() }); return send(res, 200, {}); }
        if (route === 'auth/update') {
          const u = userFromToken(req);
          if (!u || u === 'expired') return send(res, 401, { error: 'Auth session missing!' });
          u.password = b.password; return send(res, 200, {});
        }
        if (route === 'storage/upload') {
          const u = userFromToken(req);
          if (!u || u === 'expired') return send(res, 401, { error: 'unauthorized' });
          files.set(`${b.bucket}/${b.path}`, { type: b.type, buf: Buffer.from(b.b64, 'base64') });
          return send(res, 200, {});
        }
        if (route.startsWith('rpc/')) {
          const fn = route.slice(4);
          if (!/^[a-z_]+$/.test(fn)) return send(res, 404, { error: { message: 'not found' } });
          const u = userFromToken(req);
          if (u === 'expired') return send(res, 401, { error: { message: 'JWT expired' } });
          const args = Object.entries(b).map(([k, v]) => `${k} => ${literal(k, v)}`).join(', ');
          const r = await db.runAsync(`select public.${fn}(${args})`, u ? u.id : 'anon');
          if (!r.ok) return send(res, 400, { error: { message: r.err } });
          const lines = r.out.split('\n').filter(Boolean);
          const last = lines[lines.length - 1];
          let data: unknown = null;
          if (last !== undefined) { try { data = JSON.parse(last); } catch { data = last; } }
          return send(res, 200, { data });
        }
        return send(res, 404, { error: 'unknown mock route' });
      }
      // static files with SPA fallback
      let file = join(distDir, p === '/' ? 'index.html' : p);
      if (!existsSync(file) || !extname(file)) file = join(distDir, 'index.html');
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch (e) { send(res, 500, { error: { message: String(e) } }); }
  });
  await new Promise<void>((r) => server.listen(opts.port ?? 0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  mock.server = server; mock.url = `http://127.0.0.1:${port}`;
  mock.confirm = (email) => { const u = users.get(email.toLowerCase()); if (u) u.confirmed = true; };
  mock.close = () => new Promise<void>((r) => server.close(() => r()));
  return mock as Mock;
}
