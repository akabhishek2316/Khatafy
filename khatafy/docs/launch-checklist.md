# Launch checklist

## A. Smoke test on a real Supabase TEST project (30 min) — do this once
1. Run `supabase/khatafy_all_in_one.sql`; set Site URL + Redirect URLs; `.env`; `npm run web:dev`.
2. Register user A → verification email arrives → link opens the app logged in → Login works. Wrong password shows an error.
3. Forgot password → email → `/reset-password` → new password works.
4. A creates group, invitation (code shown once). User B (second browser/incognito) registers and joins by link → A approves.
5. A adds expenses (equal, amount, percent) incl. a receipt upload → B sees them live (Realtime) and can open the receipt.
6. B records a payment to A → A confirms → balances reach zero. Cancel an expense; edit another.
7. Turn off network, add an expense → turn on → it appears once.
8. Profile → Download my data; delete account (B) → B cannot log in; A still sees "Deleted user" on old entries.
9. Install the app on a phone (Add to Home Screen).

## B. Before sharing publicly
- Custom SMTP configured and tested; sender domain has SPF/DKIM.
- Privacy Policy / Terms reviewed; `VITE_SUPPORT_EMAIL` set.
- Backups on (see `backup-restore.md`).
- `npm run typecheck && npm run test:core && npm run web:build` all green on your machine.

## C. Known later-upgrades (not needed to launch)
Native Expo app, push notifications (Edge Function + FCM), monthly reminder cron (pg_cron), UPI deep links, receipt OCR.
