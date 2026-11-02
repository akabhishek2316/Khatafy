// E2E-only stand-in for @supabase/supabase-js. It talks to e2e/server.ts, which runs the REAL SQL
// migrations on a real PostgreSQL server. It implements only the surface the app uses.
type Listener = (event: string, session: any) => void;
const SKEY = 'kh-e2e-session';
const listeners = new Set<Listener>();
let session: any = (() => { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { return null; } })();
const emit = (event: string) => listeners.forEach((l) => l(event, session));
const setSession = (s: any, event: string) => {
  session = s;
  try { s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); } catch { /* ignore */ }
  emit(event);
};
const err = (message: string, status = 400, code?: string) => ({ message, status, code });

async function post(path: string, body: unknown, token?: string) {
  const r = await fetch(`/__mock/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

export function createClient(_url: string, _key: string, _opts?: unknown) {
  const auth = {
    async getSession() { return { data: { session }, error: null }; },
    onAuthStateChange(cb: Listener) {
      listeners.add(cb);
      setTimeout(() => cb('INITIAL_SESSION', session), 0);
      return { data: { subscription: { unsubscribe: () => void listeners.delete(cb) } } };
    },
    async signUp({ email, password, options }: any) {
      const { json } = await post('auth/signup', { email, password, data: options?.data });
      if (json.error) return { data: { user: null, session: null }, error: err(json.error) };
      if (json.session) setSession(json.session, 'SIGNED_IN');
      return { data: { user: json.user, session: json.session ?? null }, error: null };
    },
    async signInWithPassword({ email, password }: any) {
      const { json } = await post('auth/signin', { email, password });
      if (json.error) return { data: { user: null, session: null }, error: err(json.error, 400, json.code) };
      setSession(json.session, 'SIGNED_IN');
      return { data: { user: json.session.user, session: json.session }, error: null };
    },
    async signOut() { setSession(null, 'SIGNED_OUT'); return { error: null }; },
    async resetPasswordForEmail(email: string) { await post('auth/reset', { email }); return { data: {}, error: null }; },
    async updateUser({ password }: any) {
      if (!session) return { data: null, error: err('Auth session missing!', 401) };
      const { json } = await post('auth/update', { password }, session.access_token);
      return json.error ? { data: null, error: err(json.error, 422, json.code) } : { data: {}, error: null };
    },
    async resend() { return { data: {}, error: null }; },
    async signInWithOAuth() { return { data: {}, error: err('OAuth not available in E2E') }; },
  };
  const storage = {
    from(bucket: string) {
      return {
        async upload(path: string, file: File) {
          const buf = new Uint8Array(await file.arrayBuffer());
          let bin = ''; buf.forEach((b) => (bin += String.fromCharCode(b)));
          const { json } = await post('storage/upload', { bucket, path, type: file.type, b64: btoa(bin) }, session?.access_token);
          return json.error ? { data: null, error: err(json.error) } : { data: { path }, error: null };
        },
        async createSignedUrl(path: string) { return { data: { signedUrl: `/__mock/file/${bucket}/${path}` }, error: null }; },
        getPublicUrl(path: string) { return { data: { publicUrl: `/__mock/file/${bucket}/${path}` } }; },
      };
    },
  };
  const channel = () => { const ch: any = { on: () => ch, subscribe: () => ch }; return ch; };
  return {
    auth, storage, channel, removeChannel: async () => 'ok',
    rpc(name: string, args: Record<string, unknown> = {}) {
      return (async () => {
        let r: { status: number; json: any };
        try { r = await post(`rpc/${name}`, args, session?.access_token); } catch { return { data: null, error: { message: 'Failed to fetch' } }; }
        if (r.status === 401) return { data: null, error: { message: 'JWT expired', code: 'PGRST301' } };
        return r.json.error ? { data: null, error: r.json.error } : { data: r.json.data ?? null, error: null };
      })() as PromiseLike<{ data: any; error: any }>;
    },
  };
}
