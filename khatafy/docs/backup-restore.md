# Backup & restore

* **Supabase Pro**: Project → Database → Backups (daily, point-in-time optional).
* **Free plan**: take your own dump regularly (needs the connection string from Project Settings → Database):
  ```bash
  pg_dump "postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres" --schema=public --no-owner -Fc -f khatafy-$(date +%F).dump
  ```
* **Restore** into a NEW Supabase project: run `supabase/khatafy_all_in_one.sql` first (creates structure), then
  `pg_restore --data-only --disable-triggers -d "<new connection string>" khatafy-DATE.dump`.
  Users in `auth.users` must be migrated too (Supabase support / `supabase db dump --schema auth`), otherwise logins will not match.
* Users can download their own data from **Profile → Download my data** (JSON).
* Receipts live in Storage — back them up from the Storage dashboard or with the Supabase CLI.
