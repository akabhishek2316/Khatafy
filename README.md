# Khatafy — Saath Raho. Hisab Saaf Rakho.

Room / flat / hostel ke saath rehne walon ka **shared expense diary**. Web app hai jo phone par **app ki tarah install** (PWA) ho jaati hai.
Hindi + English, INR (₹), paise-level accurate hisab, admin-approval se group join, receipts, payments, reports, budgets.

> Login aur Register **alag pages** hain (`/login`, `/register`), forgot/reset password, email verification — sab real apps jaisa.

---

## 0. Naya kya hai (v1.1)

| Feature | Kahan |
|---|---|
| Notification delete (ek-ek ya sabhi) | 🔔 Notifications page, har item par 🗑 |
| Har person ka share (mahine ke end ke hisab me) | Home, Balances (Monthly + Lifetime) aur Statement (PDF me bhi) |
| Profile avatar par click → menu (Profile, Language & theme, Password, Privacy & data, Help, Delete account, Logout) | Top bar |
| Help & FAQs page | `/help` (menu + More page) |
| Welcome / onboarding (3 screens, Skip / Back / Next) | `/welcome` (sirf pehli baar, naye visitor ko) |
| Naya icon / logo | `apps/web/public/icons/*`, `public/welcome/*` |
| Admin panel (privacy-safe) | `/admin` (sirf platform admin ko menu me dikhta hai) |

**v1.1.1:** header se language/theme button hata diye (ab Profile menu → Language & theme me hain). Help & FAQs aur Log out ab menu aur More page dono me baaki list jaisi rows hain; Log out laal rang aur exit icon ke saath. Change password page par pehle *current password* verify hota hai.

**v1.2:** sirf PDF download (JSON/CSV hata diye), Statement me person-wise filter + useful stats, Home se extra links hata diye, Settings danger zone theek, naya + button, mobile par chhota font, "You need to pay ..." wording.

**v1.6 (current):** Close no longer deletes anything and has no waiting/objection window. Admin picks a date -> sees a preview -> confirms once -> a summary is saved in "Close & history" (PDF per close). Expenses shows only open (not closed) expenses; Balances show the current position (records after the last close; unpaid earlier dues appear separately as "earlier balance"). Statements: last 12 months only. On the LAST DAY of every month a cleanup deletes everything older than the last 12 months (expenses, payments, receipts, closed-period summaries) and keeps unpaid balances. Run, in order: `0013` (if never run), `0014` (if never run), `0016_close_no_delete_monthly_cleanup.sql` (0016 replaces the 0014 review flow (the old 0015 file was removed)).
1. Enable **pg_cron** (Dashboard -> Integrations -> Cron) and re-run 0016 if it printed "pg_cron is not enabled". The monthly job runs 28th-31st at 22:00 IST and acts only on the real last day of the month.
2. Deploy the Edge Function `supabase/functions/purge-receipts` (see its header) so receipt FILES of cleaned-up expenses are removed from Storage.
3. Test on a throw-away group: add expenses, close, check Expenses is empty and Balances current; to test cleanup: `select public.kh_monthly_cleanup(true);` (data older than 12 months is deleted; set an expense date >12 months back first).
4. Privacy Policy / Terms updated. **Have a lawyer review them.**

**v1.5 (cleaner screens, no duplicate data):**
- Home: one summary card (balance + this month + my share), pending confirmations, settle-up, last 3 expenses. Removed the per-person share card and budget card.
- Balances and Payments are now one place (two tabs). Members page holds Requests and Invitations. Activity moved into Settings.
- More menu: Reports, Statement, Close & history, Shopping list, Notices, Settings, Profile, Help.
- Removed duplicates: Statement "who paid whom" table, Reports "by member" table. Per-person share now shows in Balances and Statement only.
- Old links (`/settlements`, `/requests`, `/invitations`) still work, so notifications and bookmarks do not break.
- No database change in v1.5.

**v1.4 (Settle & close, replaces the 6/9/12-month auto-delete):** an admin closes the books up to a date once members have settled. 3-day review (any member can object, admin can cancel) -> summary kept ("Settled history": total, per-head, paid/share, who paid whom) -> detailed expenses/payments deleted -> unpaid dues carried forward as "earlier balance". Closed dates become read-only. Run, in order: `0013` (only if not run before) then `supabase/migrations/0014_period_close.sql` (it also removes the retention objects from 0013).
1. Enable **pg_cron** (Dashboard -> Integrations -> Cron), then re-run 0014 if it printed "pg_cron is not enabled". The finalising job runs daily at 03:00 IST.
2. Receipt **files** are removed only through the Storage API: deploy the Edge Function `supabase/functions/purge-receipts` (steps in its header; needs a `CRON_SECRET`; schedule it daily in Dashboard -> Cron). Until then, receipt files of closed periods stay in storage (unreachable from the app, but not erased).
3. Privacy Policy and Terms were updated. **Have a lawyer review them** and fill the `VITE_COMPANY_*` variables.
4. Test on a throw-away group: record expenses + a payment, leave one person unpaid, request a close, then in SQL Editor `update period_closes set effective_at = now() where status = 'pending';` and `select public.kh_finalize_due_closes();`. Check the summary, that the unpaid amount shows as "earlier balance", and that Balances totals did not change.

### Admin panel kaise kaam karta hai (privacy by design)
Admin ko **sirf ginti aur technical data** milta hai: total users, naye sign-ups, groups/expenses/payments ki ginti, group ka ID + member count + status.
Admin **nahi dekh sakta**: group/member ke naam, email, expense, amount, note, receipt, payment details.
Admin kar sakta hai: (1) kisi group ko **archive/restore** (jaise kisi shikayat ya kaanooni notice par) — **kaaran likhna zaroori**, (2) maintenance notice / announcement banner, (3) **audit log** dekhna. Har admin action `platform_audit` table me record hota hai.
Admin banane ke liye koi button nahi hai (jaan-bujhkar). Pehla admin SQL Editor se, **sirf ek baar**:
```sql
insert into public.platform_admins(user_id) select id from auth.users where email = 'AAPKA-EMAIL@example.com';
```
Phir us account se login karke profile menu me "Admin panel" dikhega. Supabase me us email par strong password rakhein.
Is design ko apne vakeel/legal advisor se ek baar check karwa lein (India: DPDP Act 2023 ke hisaab se privacy policy me "platform maintainers sirf aggregate data dekhte hain" likhna theek rahega).

### Update kaise karein
- **Naya Supabase project:** `supabase/khatafy_all_in_one.sql` (ab 11 migrations) ek baar chalayein.
- **Purana project jo v1.0 par chal raha hai:** sirf `supabase/migrations/0011_notif_delete_admin_panel.sql` SQL Editor me chalayein. Baaki sab same.
- `.env` me kuch naya nahi chahiye (wahi `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_SUPPORT_EMAIL`).

### Abhi tak test nahi hua (imaandari se)
Ye badlav bina `npm install` / bina Supabase par chalaye likhe gaye hain. Pehle `npm install && npm run typecheck && npm run web:build`, phir `npm run test:core`, phir 2 asli accounts se test karein. Purane `e2e` tests me profile-link wale steps ab menu ke hisaab se badalne pad sakte hain.

---

## 1. Ye project kya hai (aur kya nahi)

| Hai | Status |
|---|---|
| Web app (React + Vite + TypeScript) — phone/desktop dono par chalta hai | ✅ bana hai |
| Phone par install (Add to Home Screen, offline shell) | ✅ PWA |
| Supabase backend: Postgres + Auth + RLS + Storage + Realtime | ✅ SQL ready (`supabase/migrations`) |
| Expenses (equal / amount / percent split), edit, cancel (void), receipts, offline draft | ✅ |
| Balances, suggested payments, manual payment confirmation, reminders | ✅ |
| Members, roles (admin/member — koi owner role nahi), invite code/link + approval | ✅ |
| Reports (month-wise, category, member, 6-month trend), budgets + alerts, CSV, Print/PDF | ✅ |
| Shopping list, notices, activity log, in-app notifications | ✅ |
| Profile, language, password change, **data export**, **account delete** | ✅ |
| Native Android/iOS (Expo) app | ❌ nahi banaya — PWA use karein (Chrome → "Install app") |
| Push notifications (phone ke bahar) | ❌ nahi; in-app notifications + realtime hain |
| Automatic monthly reminders (pg_cron) | ❌ nahi |
| Real bank/UPI verification | ❌ jaan-bujhkar nahi: app sirf **manual confirmation** maanta hai |

---

## 2. Aapko kya karna hai (step by step)

Total ~20 minute. Koi paid cheez zaroori nahi (Supabase free + Vercel free kaafi hai).

### Step 1 — Supabase project banao
1. <https://supabase.com> → New project (region: **Mumbai / ap-south-1**).
2. Database password kahin safe save kar lo.

### Step 2 — Database tayyar karo (ek baar)
1. Supabase → **SQL Editor** → New query.
2. File `supabase/khatafy_all_in_one.sql` poori open karo, copy → paste → **Run**.
   (Ye saari migrations ek file me hain. **Sirf naye project par ek hi baar** chalana.)
3. "Success" aana chahiye. Kuch fail ho to error mujhe/developer ko bhejna — aadha-adhoora chalaya hua project delete karke naya banana sabse safe hai.

> Agar aap SQL badalte hain to `npm run db:bundle` se all-in-one file dobara banegi.

### Step 3 — Auth settings (zaroori)
Supabase → **Authentication**:
- **URL Configuration**
  - *Site URL*: aapki live site, jaise `https://khatafy.vercel.app` (local test ke liye `http://localhost:5173`)
  - *Redirect URLs* me ye dono add karo (apne domain ke saath):
    `https://khatafy.vercel.app/auth/callback`, `https://khatafy.vercel.app/reset-password`, aur local ke liye `http://localhost:5173/auth/callback`, `http://localhost:5173/reset-password`
- **Providers → Email**: *Confirm email* **ON** rakhein (production ke liye). Password min length 8.
- **Emails / SMTP**: Supabase ka default email sender bahut kam emails/ghanta bhejta hai (sirf testing ke liye). **Public launch se pehle apna SMTP lagao** (Resend / Brevo / Gmail workspace — Authentication → SMTP Settings). Warna logon ko verification mail nahi pahunchegi.
- (Optional) Google login: Providers → Google ON karo, phir `.env` me `VITE_ENABLE_GOOGLE=true`.

### Step 4 — Keys apne app me daalo
1. Supabase → **Project Settings → API**: `Project URL` aur `anon / publishable key` copy karo.
2. `apps/web/.env.example` ko copy karke `apps/web/.env` naam do aur dono value bharo.
   **`service_role` / secret key kabhi yahan mat daalna.**

### Step 5 — Chalao
```bash
npm install
npm run web:dev          # http://localhost:5173
```
Register → email me link kholo → Login → group banao.

### Step 6 — Internet par daalo (build)
```bash
npm run web:build        # output: apps/web/dist
```
**Vercel (sabse aasan):** repo GitHub par push → Vercel → *Import* → Root Directory `apps/web`, Install Command `cd ../.. && npm install`, Build Command `npm run build`, Output `dist`, Environment Variables me `VITE_SUPABASE_URL` aur `VITE_SUPABASE_ANON_KEY`. (`apps/web/vercel.json` me SPA rewrites + security headers pehle se hain.)
Netlify/Cloudflare Pages par bhi chalega: bas "sab URL → index.html" rewrite chahiye.

### Step 7 — Phone par app ki tarah
Chrome me site kholo → menu → **Install app / Add to Home screen**. iPhone: Safari → Share → *Add to Home Screen*.

### Step 8 — Launch se pehle
`docs/launch-checklist.md` dekho (SMTP, backups, legal pages ka review, test accounts).

---

## 3. Tests (maine kya chalaya)

```bash
npm run test:core     # unit tests: paise math, splits, settlements, offline queue, CSV, Hindi/English completeness
npm run test:db       # PostgreSQL par asli migrations: RLS, roles, concurrency, ledger, privacy (+ TS<->SQL split parity)
npm run test:e2e      # asli browser (Chromium) me poora app: register→verify→login→group→invite→approve→expenses→payments→offline→Hindi→mobile→delete account
npm run typecheck
```
`test:db` / `test:e2e` ke liye local **PostgreSQL** chahiye (env: `PGHOST PGPORT PGUSER`, default `localhost:54329` user `postgres`) aur e2e ke liye ek baar `npx playwright install chromium`.

**Is build me kya verify hua:** 49 DB tests + 3 parity tests + 17 core tests + 17 browser journeys (sab pass).
**Honest limits (isi sandbox me nahi ho paya):**
- Internet-blocked environment me `npm install` nahi chal paya, isliye **`vite build` aur asli `@supabase/supabase-js` se test nahi hua**. Browser tests me app esbuild se bani aur supabase-js ki jagah ek chhota stand-in laga jo *asli SQL* se baat karta hai. Aapke `npm install` ke baad `npm run typecheck` aur `npm run web:build` ek baar chalana — agar koi chhoti type/version ki shikayat aaye to wo dependency-version level ki hogi.
- Asli Supabase par ye sirf aap hi test kar sakte hain: email bhejna, Storage upload, Realtime, `delete_my_account` (auth.users se delete). Inka code Supabase ke documented behaviour ke hisaab se likha hai; pehle ek **test project** par `docs/launch-checklist.md` ka "smoke test" chala lena.
- Privacy/Terms pages **template** hain — public launch se pehle kisi legal salahkaar se dekhwa lein.

---

## 4. Folder map
```
apps/web/            React app (src/pages, src/lib, src/components), public/ (PWA), e2e/ (browser tests)
packages/core/       Shared logic: money, splits, balances, offline queue, API wrapper, Hindi/English text, tests
supabase/migrations  Database (10 files)   |  supabase/khatafy_all_in_one.sql  (paste-in-one-go)
supabase/email-templates  Professional verification/reset email HTML (Supabase me paste karna hai)
supabase/tests       Database tests on real PostgreSQL
docs/                Architecture, security, launch checklist, backup/restore, privacy notes
```

## 5. Zaroori design faislay
- Paisa hamesha **integer paise** me (float kabhi nahi). Split ka bacha hua paisa deterministic (sorted user id) baanta jaata hai — browser aur database same jawab dete hain (parity test).
- Kuch bhi hard-delete nahi: expense **cancel (void)** hota hai, edit par purana version history me rehta hai.
- Balance = jo aapne diya − aapka hissa + jo aapne settlement me diya − jo settlement me mila. Sirf **confirmed** payments gine jaate hain.
- Group join: invite code/link → request → admin approve. Code sirf ek baar dikhta hai (DB me sirf hash).
- Har data access Postgres **RLS + SECURITY DEFINER functions** se; phone number sirf khud ko dikhta hai.
- Naye expense offline bhi likh sakte hain (phone me draft, net aate hi apne-aap sync, double-entry nahi hoti). Edit/cancel/payment ke liye internet chahiye.

## 6. v1.1 me kya naya hai
- **Resend email timer:** verification / reset mail dobara bhejne ka button 60 second ke baad hi chalta hai.
- **Professional email templates:** `supabase/email-templates/` me 6 HTML files hain. Supabase → Authentication → Emails → Templates me har template ka Subject + HTML paste karo (README us folder me hai).
- **Premium light theme** (default). Top bar ke chand/suraj button ya Profile se Light / Dark / System chuno.
- **Edited tag:** edit kiya hua expense list aur detail me "Edited" tag dikhata hai (kab edit hua, wo bhi).
- **1 ghanta edit limit:** expense add hone ke 60 minute baad edit band (database level par enforce). Creator aur admin dono par lagu. Galat entry ho to **Cancel (void)** hamesha possible hai.
- **Statement page** (menu → Statement): is mahine / pichhla mahina / custom dates; kisne kitna, kab, kis cheez ke liye, kiske upar. **PDF** = "Download PDF" dabao → print window me "Save as PDF" chuno (Hindi text sahi aata hai). CSV bhi milta hai.

**Purane Supabase project par update:** SQL Editor me sirf `supabase/migrations/0008_edit_window_statement.sql` paste karke Run karo. Naye project par `khatafy_all_in_one.sql` hi kaafi hai.

## 7. v1.2 — App icon, Auth page, Legal pages
- **App icon / logo:** aapka diya logo `apps/web/public/icons/` me lag gaya (PWA icons, apple-touch-icon, favicon, in-app logo). Poora colour theme bhi logo ke blue/navy me badal gaya.
- **Login / Register redesign:** left me brand panel, right me clean form; "Continue with Google" button, show/hide password, password strength meter, **policy wala tick box (zaroori)** — bina tick ke account nahi banta (Google se bhi nahi). Kis version par kab sahmati di, wo user ke account metadata (`terms_accepted_at`, `terms_version`) me save hota hai.
- **Terms of Use / Privacy Policy:** poore sections (12–13), contents list, Hindi + English, India ke DPDP Act 2023 ke hisaab se. `.env` me ye bharo: `VITE_COMPANY_NAME`, `VITE_COMPANY_ADDRESS`, `VITE_GRIEVANCE_OFFICER`, `VITE_JURISDICTION_CITY`, `VITE_SUPPORT_EMAIL`. Text badlo to `src/pages/legalText.ts` me `LEGAL_VERSION` / `LEGAL_UPDATED` bhi badlo.
- **Google button:** ab default me dikhta hai. Supabase me Google provider ON hona chahiye, warna `VITE_ENABLE_GOOGLE=false` kar do.
- **Zaroori:** public launch se pehle legal text kisi vakeel se ek baar dikhwa lo — ye general template-quality text hai, legal advice nahi.

## 8. v1.4 — Owner role hata diya
- Ab sirf do roles hain: **Admin** aur **Member**. Group banane wala pehla admin hota hai; purane owners admin ban gaye.
- Koi bhi admin kisi member ko **admin bana sakta hai**. Dusre admin ko **sirf group banane wala (Creator)** demote ya remove kar sakta hai; baaki admins ek dusre ko nahi hata sakte. Creator ko koi nahi hata sakta. Har admin khud admin pad chhod sakta hai ("Step down"), jab koi aur admin ho.
- Aakhri admin group chhod nahi sakta / account delete nahi kar sakta (jab tak group me dusre members hain) — pehle kisi ko admin banao ya group archive karo.
- Notifications page ka layout bhi theek kiya (har notification alag card, icon + time).
- **Purane Supabase project par:** SQL Editor me `0009_remove_owner_role.sql` aur uske baad `0010_creator_can_remove_admins.sql` Run karo (0008 pehle chala chuka ho).

## 9. Google login me "Khatafy" naam dikhana (Google Cloud Console)
Google ke consent screen par jo naam/URL dikhta hai wo **app ke code se nahi, Google Cloud Console se** aata hai:
1. Google Cloud Console → **Google Auth Platform → Branding**: App name = `Khatafy`, App logo = `apps/web/public/icons/icon-512.png`, support email, **App home page / Privacy policy / Terms of service** links (apni live website ke `/privacy` aur `/terms`), Authorized domain = apna domain.
2. **Audience** me app ko *In production* karo (Testing me rahega to limited users hi login kar paenge).
3. Branding verify/submit karo — verify hone ke baad Google "Sign in to Khatafy" dikhata hai. Verify hone tak wo Supabase ka domain (`xxxx.supabase.co`) dikha sakta hai.
4. Agar consent screen par Supabase URL bilkul hi nahi chahiye to Supabase ka **Custom Domain** (paid add-on) lagana padta hai, jaise `auth.aapkadomain.com`.

## 10. Updates ke baare me
Ye app kisi cheez ko "update" nahi maangti. Sirf: (a) future me SQL badlao to naya migration file add hota hai, (b) `npm audit` se kabhi-kabhi dependencies update karna achchhi aadat hai.

**v1.5.2:** app icon (home screen / install) is now the logo only, without the "Khatafy" text. Uninstall and reinstall the app (or clear site data) to see it on a phone.

**v1.6.1:** a member can only add expenses they paid themselves (server-enforced), and the payer of an expense can never be changed. Run `supabase/migrations/0017_expense_payer_is_caller.sql`. The "Paid by" field is now read-only.

**v1.7:** after a close, unpaid dues of the closed period are shown SEPARATELY ("Earlier dues: you need to pay / you will get", with the reason and the period end date) and are never mixed with new expenses; new shared items only affect the current period. A payment after the close first settles earlier dues between the same two people, the rest counts for the current period. Run `supabase/migrations/0018_balances_earlier_vs_current.sql`.

**v1.7.1:** closing up to today now cuts at the moment of closing (expenses added later the same day work); expense date/time is always "now" and cannot be changed (server-enforced). Run `supabase/migrations/0019_close_same_day_and_auto_datetime.sql`.

**v1.7.2:** payment date/time is always "now" and cannot be changed (server-enforced). Run `supabase/migrations/0020_payment_time_is_now.sql`.

**v1.8:** Home shows three clear cards: My balance, **Current period** (since the last close) and **Last closed period**. Close & history is now ordered: Current period (live) -> Earlier unpaid record (separate) -> Close the books -> Settled history. Run `supabase/migrations/0021_period_overview.sql`.

**v1.9:** period-wise (close-wise) views next to the monthly ones: Reports (Month | Period), Balances (Current | Monthly | Period) and Statement (This month | Last month | Period | Custom). A period = from one close to the next, or the current open period. Run `supabase/migrations/0022_period_wise_views.sql`.

**v1.9.6:** (1) Expenses "Paid by" filter now shows only expenses that person PAID (not ones they only share). (2) One type scale for the whole app (same on phone and desktop; base 14px): all font sizes come from 8 tokens in `styles.css` ("TYPE SYSTEM" block at the end). (3) Payments are explicit again: every payment is either for the EARLIER dues (closed period) or for the CURRENT period - chosen from the card you press (or a selector on the Payments page), with a clear message; the payments list shows which one each was. Run `supabase/migrations/0023_payment_kinds_and_paid_by_filter.sql`.
