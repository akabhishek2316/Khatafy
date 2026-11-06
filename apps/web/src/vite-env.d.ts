/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ENABLE_GOOGLE?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_SENTRY_DSN?: string;
}
