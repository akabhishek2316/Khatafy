# Khatafy security audit (v1.2.1)

Scope: Supabase schema/RLS/functions/storage, web app code, hosting headers. Method: static review of the code and SQL in this repo.
**Not done:** no penetration test, no run against a live database, no dependency scan (`npm audit` needs network). Treat as a first review, not a guarantee.

## What was checked and is OK
| Area | Result |
|---|---|
| RLS | All 22 tables have RLS enabled |
| Table writes | Clients have **SELECT only**; every write goes through RPC functions |
| Anonymous access | `anon` has no table grants and can run only `get_app_status()` (public banner text) |
| SECURITY DEFINER functions | 91 functions; all set `search_path`; all revoked from PUBLIC/anon; every callable one checks the caller / group membership |
| Phone numbers | Hidden from other members by column-level grant |
| Invitation codes | Stored as hash (`token_hash`); code shown once |
| Receipts | Private bucket, signed URLs, only active group members, no client delete/update |
| Realtime | Only RLS-allowed rows are delivered |
| XSS | No `dangerouslySetInnerHTML` / `innerHTML` / `eval` in the app |
| Redirects | Post-login redirect only accepts in-app paths |
| Secrets | No keys found in the repo; `service_role` is never used in the app |
| Admin panel | Aggregates only; changes need a reason and are audit-logged; admin can only be granted through SQL |
| Service worker | Caches only same-origin app files, never API data |

## Problems found and fixed in v1.2.1
1. **No Content-Security-Policy / HSTS** -> added in `apps/web/vercel.json` (scripts only from your own site; connections only to your site and Supabase; no framing).
2. **Inline script in index.html** (would force `unsafe-inline`) -> moved to `public/theme-init.js`.
3. **Offline draft expenses stayed in the browser after log out** (shared-phone risk) -> cleared on log out.
4. **`export_my_data` still callable on the server** after the button was removed -> execute revoked (migration `0012`).

## Remaining risks / recommendations (not changed)
1. **Implicit auth flow** (`flowType: 'implicit'`): email-confirm / reset links carry tokens in the URL hash. PKCE is safer but breaks links opened on a different device; switch only after testing both flows.
2. **Session token in localStorage** (Supabase default). The new CSP reduces XSS risk; do not add third-party scripts.
3. **Avatars bucket is public**: anyone with an avatar URL can view that photo without logging in (URL contains the user ID). Make it private if profile photos are sensitive.
4. **Supabase dashboard settings (do these):** password min length 8+, email confirmation ON, Auth rate limits on, custom SMTP, turn OFF unused providers, enable MFA on your own Supabase/GitHub/Vercel/Brevo accounts, keep the `service_role` key out of Vercel.
5. **Admin account:** use a separate email with 2-step verification; consider TOTP-gating the admin panel.
6. **Drafts of a user who is logged out by session expiry are kept** (to avoid losing offline work) and sync when the same user signs in again.
7. `admin_set_group_status` updates the group directly and was not tested against the existing update guards.
8. Run `npm audit` and keep dependencies updated; enable GitHub Dependabot + secret scanning.
