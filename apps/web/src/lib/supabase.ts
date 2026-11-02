import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApi } from '@khatafy/core';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False until the .env file contains real Supabase values - the UI then shows a setup screen. */
export const isConfigured = Boolean(url && key && /^https?:\/\//.test(url));

export const supabase: SupabaseClient = isConfigured
  ? createClient(url as string, key as string, {
      auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : (null as unknown as SupabaseClient);

export const api = createApi(supabase ?? { rpc: async () => ({ data: null, error: { message: 'NOT_CONFIGURED' } }) });

export const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || '';
/** Google button is shown unless VITE_ENABLE_GOOGLE=false (enable the provider in Supabase first). */
export const GOOGLE_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE !== 'false';
/** Legal operator details shown in the Terms / Privacy pages (set in .env before launch). */
export const OPERATOR = {
  name: (import.meta.env.VITE_COMPANY_NAME as string | undefined) || 'Khatafy',
  address: (import.meta.env.VITE_COMPANY_ADDRESS as string | undefined) || '',
  grievance: (import.meta.env.VITE_GRIEVANCE_OFFICER as string | undefined) || '',
  jurisdiction: (import.meta.env.VITE_JURISDICTION_CITY as string | undefined) || '',
};
