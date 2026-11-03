# Security checklist

Built in (covered by `npm run test:db`):
- [x] RLS on every table; anon has no table access; functions `revoke ... from public, anon`, explicit `grant ... to authenticated`.
- [x] SECURITY DEFINER functions use `set search_path = ''` and fully-qualified names.
- [x] Non-members cannot read or write group data; plain members cannot use admin RPCs; admin-only actions enforced (admins cannot demote/remove each other; last admin protected).
- [x] Phone numbers hidden by column privileges; only `get_my_profile()` returns them.
- [x] Invitation codes stored as SHA-256 hash; shown once; expiry / max uses / revoke; rate limited.
- [x] Receipts bucket private, member-only access by `<group>/<expense>/` path; 5 MB; jpg/png/webp/pdf only.
- [x] No hard deletes of financial rows; audit log of every change.
- [x] CSV export guards against spreadsheet formula injection.
- [x] Service-role key never used in the browser. Security headers in `apps/web/vercel.json`.

You must do:
- [ ] Turn **Confirm email** ON; set up custom **SMTP**; keep Site URL / Redirect URLs exact.
- [ ] Enable leaked-password protection if your Supabase plan offers it; keep min password length ≥ 8.
- [ ] Enable **daily backups** (Pro plan) or schedule `pg_dump` (see `docs/backup-restore.md`).
- [ ] Put the site behind HTTPS only (Vercel does) and keep dependencies updated (`npm audit`).
- [ ] Review Privacy / Terms text with a lawyer.
