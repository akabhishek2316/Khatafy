// Test harness: runs the REAL migrations on a real PostgreSQL server (psql CLI) and
// lets tests act as different Supabase users (role "authenticated" + JWT claims).
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(here, '..', 'migrations');

const BASE_ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? 'localhost',
  PGPORT: process.env.PGPORT ?? '54329',
  PGUSER: process.env.PGUSER ?? 'postgres',
  PGOPTIONS: '-c client_min_messages=warning',
};

export type Actor = string | 'anon' | null; // user id, 'anon', or null = superuser

export class Db {
  constructor(public name: string) {}

  private sqlFor(sql: string, actor: Actor): string {
    if (actor === null) return sql;
    if (actor === 'anon') return `begin;\nset local role anon;\n${sql};\ncommit;`;
    const claims = JSON.stringify({ sub: actor, role: 'authenticated' }).replace(/'/g, "''");
    return `begin;\nset local role authenticated;\n\\o /dev/null\nselect set_config('request.jwt.claims', '${claims}', true);\n\\o\n${sql};\ncommit;`;
  }

  /** Run SQL, returns stdout (tuples only). Throws Error(message) with the SQL error text. */
  run(sql: string, actor: Actor = null): string {
    const r = spawnSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', this.name], {
      input: this.sqlFor(sql, actor), env: BASE_ENV, encoding: 'utf8',
    });
    if (r.status !== 0) {
      const m = /ERROR:\s+(.*)/.exec(r.stderr);
      throw new Error(m ? m[1]!.trim() : r.stderr.trim());
    }
    return r.stdout.trim();
  }

  /** Same as run() but returns a promise (for true concurrency tests). */
  runAsync(sql: string, actor: Actor = null): Promise<{ ok: boolean; out: string; err: string }> {
    return new Promise((resolve) => {
      const p = spawn('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', this.name], { env: BASE_ENV });
      let out = '', err = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (err += d));
      p.on('close', (code) => {
        const m = /ERROR:\s+(.*)/.exec(err);
        resolve({ ok: code === 0, out: out.trim(), err: m ? m[1]!.trim() : err.trim() });
      });
      p.stdin.end(this.sqlFor(sql, actor));
    });
  }

  json<T = any>(sql: string, actor: Actor = null): T {
    const out = this.run(sql, actor);
    const lines = out.split('\n').filter(Boolean);
    return JSON.parse(lines[lines.length - 1] ?? 'null') as T;
  }
  scalar(sql: string, actor: Actor = null): string {
    const lines = this.run(sql, actor).split('\n').filter(Boolean);
    return lines[lines.length - 1] ?? '';
  }
  /** Returns the error message, or throws if the SQL unexpectedly succeeds. */
  fails(sql: string, actor: Actor = null): string {
    try {
      this.run(sql, actor);
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error('Expected SQL to fail but it succeeded: ' + sql.slice(0, 200));
  }
  /** rpc helper: select public.fn(args) as jsonb/text. */
  rpc<T = any>(actor: Actor, fn: string, args: string = ''): T {
    const out = this.run(`select public.${fn}(${args})`, actor).split('\n').filter(Boolean);
    const last = out[out.length - 1];
    if (last === undefined || last === '') return null as T;
    try { return JSON.parse(last) as T; } catch { return last as unknown as T; }
  }
  rpcFails(actor: Actor, fn: string, args: string = ''): string {
    return this.fails(`select public.${fn}(${args})`, actor);
  }
  user(email: string, name?: string, id: string = randomUUID()): string {
    this.run(
      `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{"full_name":"${name ?? email.split('@')[0]}"}')`,
    );
    return id;
  }
  drop() {
    spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `drop database if exists ${this.name} with (force)`], { env: BASE_ENV });
  }
}

export function createDb(): Db {
  const name = 'kh_' + randomUUID().replace(/-/g, '').slice(0, 12);
  const mk = spawnSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `create database ${name}`], { env: BASE_ENV, encoding: 'utf8' });
  if (mk.status !== 0) throw new Error('Cannot create test database. Is PostgreSQL running? ' + mk.stderr);
  const db = new Db(name);
  const files = [join(here, '00_supabase_stub.sql'), ...readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort().map((f) => join(MIGRATIONS_DIR, f))];
  for (const f of files) {
    const r = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', name, '-f', f], { env: BASE_ENV, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`Migration failed: ${f}\n${r.stderr}`);
  }
  return db;
}

export const sq = (s: string | null) => (s === null ? 'null' : `'${s.replace(/'/g, "''")}'`);
export const uid = () => randomUUID();
export function participants(list: Array<string | [string, number]>, key: 'amount_paise' | 'percent_bps' | null = null): string {
  const arr = list.map((p) => (typeof p === 'string' ? { user_id: p } : { user_id: p[0], [key!]: p[1] }));
  return sq(JSON.stringify(arr)) + '::jsonb';
}
export const readFile = (p: string) => readFileSync(p, 'utf8');
