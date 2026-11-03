-- 0012: security hardening.
-- The "export my data" button was removed from the app (it exposed internal IDs). Close the server side too,
-- so nobody can call it directly with the public anon key + a stolen session. Re-enable only with a reviewed,
-- ID-free export design.
revoke execute on function public.export_my_data() from authenticated;
