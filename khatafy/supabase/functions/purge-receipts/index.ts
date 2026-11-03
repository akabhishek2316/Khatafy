// Supabase Edge Function: removes receipt FILES queued by the retention job.
// Deploy:  supabase functions deploy purge-receipts --no-verify-jwt
// Secret:  supabase secrets set CRON_SECRET=<long random string>
// Schedule (Dashboard -> Integrations -> Cron -> New job -> Edge Function), daily, header: Authorization: Bearer <CRON_SECRET>
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions automatically. Never put the service key in Vercel.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) return new Response('forbidden', { status: 403 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: rows, error } = await db.from('storage_cleanup_queue').select('id,bucket,storage_path').is('done_at', null).limit(200);
  if (error) return new Response(error.message, { status: 500 });
  let removed = 0;
  for (const r of rows ?? []) {
    const { error: e } = await db.storage.from(r.bucket).remove([r.storage_path]);
    if (!e) { await db.from('storage_cleanup_queue').update({ done_at: new Date().toISOString() }).eq('id', r.id); removed++; }
  }
  return new Response(JSON.stringify({ removed, pending: (rows?.length ?? 0) - removed }), { headers: { 'Content-Type': 'application/json' } });
});
