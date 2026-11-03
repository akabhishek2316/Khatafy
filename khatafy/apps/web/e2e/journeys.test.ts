// End-to-end journeys: real built UI (Chromium) -> mock auth/storage -> REAL migrations on PostgreSQL.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb, type Db } from '../../../supabase/tests/harness';
import { buildForE2E } from './build';
import { startMock, type Mock } from './server';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
type Page = import('playwright').Page;
type Browser = import('playwright').Browser;

let db: Db; let mock: Mock; let browser: Browser;
const PW = 'Passw0rdX';
const ids: Record<string, string> = {};
const expect = async (page: Page, text: string | RegExp, timeout = 8000) => {
  try { await page.getByText(text).filter({ visible: true }).first().waitFor({ state: 'visible', timeout }); }
  catch (e) { const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 700); throw new Error(`Expected text ${text} on ${page.url()}\n--- page shows ---\n${body}`, { cause: e }); }
};
const newPage = async (opts: Record<string, unknown> = {}) => { const ctx = await browser.newContext({ locale: 'en-US', ...opts }); const page = await ctx.newPage(); page.on('pageerror', (e) => { throw e; }); return { ctx, page }; };

async function register(page: Page, name: string, email: string) {
  await page.goto(mock.url + '/register');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByLabel('Confirm password').fill(PW);
  await page.getByTestId('consent').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByTestId('verify-notice').waitFor();
  mock.confirm(email);
}
async function login(page: Page, email: string, pw = PW) {
  await page.goto(mock.url + '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(pw);
  await page.getByRole('button', { name: 'Log in' }).click();
}
const gidOf = (page: Page) => /\/g\/([0-9a-f-]{36})/.exec(page.url())![1]!;

before(async () => {
  db = createDb();
  const dist = await buildForE2E(join(tmpdir(), 'khatafy-e2e-dist'));
  mock = await startMock({ db, distDir: dist });
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await mock?.close(); db?.drop(); });

test('auth: separate register & login pages, verification, wrong password, guards', async () => {
  const { ctx, page } = await newPage();
  await page.goto(mock.url + '/groups');
  await page.waitForURL('**/login'); // guarded
  await expect(page, 'Log in to Khatafy');
  assert.ok(await page.getByRole('link', { name: 'Create account' }).isVisible());
  // client-side validation
  await page.goto(mock.url + '/register');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page, /Please enter your name/i);
  // register -> verification notice -> cannot log in until confirmed
  await page.getByLabel('Full name').fill('Asha Verma');
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByLabel('Confirm password').fill(PW);
  // the policy tick box is mandatory
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page, /accept the Terms of Use and Privacy Policy/i);
  await page.getByTestId('consent').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page, /asha@example.com/);
  await login(page, 'asha@example.com');
  await expect(page, /not confirmed|verify|confirm/i);
  mock.confirm('asha@example.com');
  await login(page, 'asha@example.com', 'WrongPass1');
  await expect(page, /Incorrect|Invalid|wrong/i);
  await login(page, 'asha@example.com');
  await page.waitForURL('**/groups');
  await expect(page, /Hello, Asha/);
  // logged-in user is redirected away from /login
  await page.goto(mock.url + '/login');
  await page.waitForURL('**/groups');
  await ctx.close();
});

test('group + invite + join request + approval; roles enforced', async () => {
  const a = await newPage(); const b = await newPage();
  await register(a.page, 'Ravi Kumar', 'ravi@example.com'); await login(a.page, 'ravi@example.com');
  await a.page.getByLabel('Group name').fill('Flat 302');
  await a.page.getByRole('button', { name: 'Create group' }).click();
  await a.page.waitForURL(/\/g\/[0-9a-f-]{36}$/);
  ids.g = gidOf(a.page);
  await expect(a.page, 'Flat 302');
  // invitation
  await a.page.goto(`${mock.url}/g/${ids.g}/invitations`);
  await a.page.getByRole('button', { name: 'Create invitation' }).click();
  const link = (await a.page.getByTestId('invite-link').textContent())!;
  assert.match(link, /\/join\?code=[0-9a-f]{48}$/);
  // a non-member cannot open the group
  await register(b.page, 'Sneha Rao', 'sneha@example.com'); await login(b.page, 'sneha@example.com');
  await b.page.waitForURL('**/groups');
  await b.page.goto(`${mock.url}/g/${ids.g}`);
  await expect(b.page, /not an active member|not allowed|permission|member of this group/i);
  // join via link
  await b.page.goto(link);
  await b.page.getByRole('button', { name: 'Send request' }).click();
  await expect(b.page, /Request sent|Waiting for approval/);
  // admin sees + approves
  await a.page.goto(`${mock.url}/g/${ids.g}/requests`);
  await expect(a.page, 'Sneha Rao');
  await a.page.getByRole('button', { name: 'Approve' }).click();
  await expect(a.page, 'Member approved');
  await b.page.goto(`${mock.url}/g/${ids.g}`);
  await expect(b.page, 'Flat 302');
  // plain members do not see admin pages
  await b.page.goto(`${mock.url}/g/${ids.g}/invitations`);
  await expect(b.page, /not allowed/i);
  const roles = db.run(`select string_agg(role::text, ',' order by role) from public.group_members`);
  assert.equal(roles, 'admin,member');
  // no owner role anywhere; an admin can make another member admin, who can later step down
  await a.page.goto(`${mock.url}/g/${ids.g}/members`);
  assert.equal(await a.page.getByText(/owner/i).count(), 0);
  await a.page.getByRole('button', { name: 'Make admin' }).click();
  await expect(a.page, 'Role updated');
  assert.equal(db.run(`select string_agg(role::text, ',' order by role) from public.group_members`), 'admin,admin');
  await a.page.getByRole('button', { name: 'Remove admin role' }).waitFor({ state: 'visible', timeout: 8000 }); // the group creator can demote another admin
  await b.page.goto(`${mock.url}/g/${ids.g}/invitations`);
  assert.equal(await b.page.getByText(/not allowed/i).count(), 0);
  await b.page.goto(`${mock.url}/g/${ids.g}/members`);
  assert.equal(await b.page.getByRole('button', { name: 'Remove' }).count(), 0); // admins cannot remove admins
  await b.page.getByRole('button', { name: 'Step down as admin' }).click();
  await b.page.getByRole('button', { name: 'Step down as admin' }).last().click();
  await expect(b.page, 'Role updated');
  assert.equal(db.run(`select string_agg(role::text, ',' order by role) from public.group_members`), 'admin,member');
  await a.ctx.close(); await b.ctx.close();
});

test('expenses: equal / amount / percent splits, balances, edit, void', async () => {
  const a = await newPage(); const b = await newPage();
  await login(a.page, 'ravi@example.com'); await login(b.page, 'sneha@example.com');
  await a.page.waitForURL('**/groups'); await b.page.waitForURL('**/groups');
  const addExpense = async (page: Page, title: string, amount: string) => {
    await page.goto(`${mock.url}/g/${ids.g}/expense/new`);
    await expect(page, 'Save expense', 15000);
    await page.getByLabel('Amount (₹)').fill(amount);
    await page.getByLabel('What was it for?').fill(title);
  };
  // equal: Ravi pays 301 for both -> 150.51 / 150.49 (extra paisa deterministic)
  await addExpense(a.page, 'Vegetables', '301');
  await a.page.getByRole('button', { name: 'Save expense' }).click();
  await a.page.waitForURL(/\/(diary|expense\/[0-9a-f-]{36})$/);
  await expect(a.page, 'Vegetables');
  assert.equal(db.scalar(`select sum(share_paise) from public.expense_splits`), '30100');
  // amount split
  await addExpense(a.page, 'Gas cylinder', '1000');
  await a.page.getByRole('tab', { name: 'Amounts' }).click();
  await a.page.getByLabel('Share Ravi Kumar').fill('300');
  await a.page.getByLabel('Share Sneha Rao').fill('600');
  await expect(a.page, /Remaining: ₹100/);
  await a.page.getByRole('button', { name: 'Save expense' }).click(); // blocked client side
  await expect(a.page, /Remaining|must add up|total/i);
  await a.page.getByLabel('Share Sneha Rao').fill('700');
  await expect(a.page, 'Split is correct');
  await a.page.getByRole('button', { name: 'Save expense' }).click();
  await a.page.waitForURL(/\/(diary|expense\/[0-9a-f-]{36})$/);
  // percent split paid by Sneha (from her side)
  await addExpense(b.page, 'Internet', '999');
  await b.page.getByRole('tab', { name: 'Percent' }).click();
  await b.page.getByRole('button', { name: 'Fill evenly' }).click();
  await b.page.getByRole('button', { name: 'Save expense' }).click();
  await b.page.waitForURL(/\/(diary|expense\/[0-9a-f-]{36})$/);
  assert.equal(db.scalar(`select count(*) from public.expenses`), '3');
  assert.equal(db.scalar(`select sum(share_paise) from public.expense_splits s join public.expenses e on e.id=s.expense_id where e.title='Internet'`), '99900');
  // balances page (net matches the DB truth)
  const bal = db.rpc<any[]>(db.scalar(`select id::text from auth.users where email='ravi@example.com'`), 'get_group_balances', `'${ids.g}'::uuid`);
  const ravi = bal.find((r) => r.full_name === 'Ravi Kumar');
  const sneha = bal.find((r) => r.full_name === 'Sneha Rao');
  assert.equal(ravi.net_paise + sneha.net_paise, 0);
  await a.page.goto(`${mock.url}/g/${ids.g}/balances`);
  await expect(a.page, 'Suggested payments');
  // edit (requires reason)
  await a.page.goto(`${mock.url}/g/${ids.g}/diary`);
  await a.page.getByText('Vegetables').first().click();
  await a.page.getByRole('link', { name: /Edit/ }).click();
  await a.page.getByLabel('Amount (₹)').fill('320');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(a.page, /reason/i);
  await a.page.getByLabel('Reason').fill('Price was wrong');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(a.page, '₹320');
  assert.equal(db.scalar(`select max(version) from public.expenses where title='Vegetables'`), '2');
  await a.page.getByTestId('edited-tag').waitFor();
  await expect(a.page, /You can edit this for \d+ more min/);
  await a.page.goto(`${mock.url}/g/${ids.g}/diary`);
  await a.page.locator('li', { hasText: 'Vegetables' }).getByText('Edited').waitFor();
  await a.page.getByText('Vegetables').first().click();
  // void
  await a.page.getByRole('button', { name: 'Cancel this expense' }).click();
  await a.page.getByLabel('Reason').fill('Duplicate');
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel this expense' }).click();
  await a.page.getByTestId('void-banner').waitFor();
  assert.equal(db.scalar(`select status from public.expenses where title='Vegetables'`), 'voided');
  // the other member cannot edit someone else's expense unless admin -> sees detail without edit for non-creator
  await b.page.goto(`${mock.url}/g/${ids.g}/diary`);
  await expect(b.page, 'Gas cylinder');
  await a.ctx.close(); await b.ctx.close();
});

test('payments: record -> receiver confirms -> balances settle; manual-confirmation warning shown', async () => {
  const a = await newPage(); const b = await newPage();
  await login(a.page, 'ravi@example.com'); await login(b.page, 'sneha@example.com');
  await a.page.waitForURL('**/groups'); await b.page.waitForURL('**/groups');
  const raviId = db.scalar(`select id::text from auth.users where email='ravi@example.com'`);
  const snehaId = db.scalar(`select id::text from auth.users where email='sneha@example.com'`);
  const netOf = (uid: string) => Number(db.rpc<any[]>(raviId, 'get_group_balances', `'${ids.g}'::uuid`).find((r) => r.user_id === uid).net_paise);
  const before = netOf(snehaId); assert.ok(before < 0, 'Sneha should owe Ravi');
  await b.page.goto(`${mock.url}/g/${ids.g}/settlements`);
  await expect(b.page, /does not move money/i);
  await b.page.getByRole('button', { name: /Record payment/ }).first().click();
  const dlg = b.page.getByRole('dialog');
  await dlg.getByLabel('Paid to').selectOption({ label: 'Ravi Kumar' });
  await dlg.getByLabel(/Amount/).fill(String(Math.abs(before) / 100));
  await dlg.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(b.page, /waiting for the receiver/i);
  assert.equal(netOf(snehaId), before, 'pending payment must not change balances');
  await a.page.goto(`${mock.url}/g/${ids.g}/settlements`);
  await a.page.getByRole('button', { name: 'Confirm received' }).click();
  await expect(a.page, 'Payment confirmed');
  assert.equal(netOf(snehaId), 0);
  await a.page.goto(`${mock.url}/g/${ids.g}/balances`);
  await expect(a.page, 'Everyone is settled up.');
  // sender cannot confirm own payment (DB-level rule)
  assert.match(db.rpcFails(snehaId, 'update_payment_status', `'${db.scalar('select id::text from public.payments limit 1')}'::uuid, 'confirm', null`), /./);
  await a.ctx.close(); await b.ctx.close();
});

test('language toggle, reports, shopping list, notices, notifications, activity', async () => {
  const a = await newPage();
  await login(a.page, 'ravi@example.com'); await a.page.waitForURL('**/groups');
  await a.page.goto(`${mock.url}/g/${ids.g}/reports`);
  await expect(a.page, 'Total spent');
  await a.page.goto(`${mock.url}/g/${ids.g}/shopping`);
  await a.page.getByLabel('Item').fill('Rice 5kg'); await a.page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(a.page, 'Rice 5kg');
  await a.page.getByLabel('Mark Rice 5kg as bought').check();
  await expect(a.page, /Bought by/);
  await a.page.goto(`${mock.url}/g/${ids.g}/notices`);
  await a.page.getByRole('button', { name: /New notice/ }).click();
  await a.page.getByLabel('Title').fill('Rent day'); await a.page.getByLabel('Message').fill('Pay by 5th');
  await a.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(a.page, 'Pay by 5th');
  await a.page.goto(`${mock.url}/g/${ids.g}/activity`);
  await expect(a.page, /Vegetables|added|expense/i);
  await a.page.goto(`${mock.url}/notifications`);
  await expect(a.page, /Sneha|payment|join/i);
  // Hindi
  await a.page.getByRole('button', { name: 'हिं' }).click();
  await expect(a.page, 'सूचनाएँ');
  assert.equal(db.scalar(`select preferred_language from public.profiles where full_name='Ravi Kumar'`), 'hi');
  await a.page.goto(`${mock.url}/g/${ids.g}`);
  await expect(a.page, 'मेरा हिसाब');
  await a.page.getByRole('button', { name: 'EN' }).click();
  await expect(a.page, 'My balance');
  for (let i = 0; i < 40 && db.scalar(`select preferred_language from public.profiles where full_name='Ravi Kumar'`) !== 'en'; i++) await a.page.waitForTimeout(100);
  await a.ctx.close();
});

test('offline: new expense saved as draft, synced once when back online (idempotent)', async () => {
  const a = await newPage();
  await login(a.page, 'ravi@example.com'); await a.page.waitForURL('**/groups');
  await a.page.goto(`${mock.url}/g/${ids.g}/expense/new`);
  await expect(a.page, 'Save expense', 15000);
  await a.page.getByLabel('Amount (₹)').fill('80'); await a.page.getByLabel('What was it for?').fill('Offline chai');
  await a.ctx.setOffline(true);
  await a.page.getByRole('button', { name: 'Save expense' }).click();
  await expect(a.page, /saved on this device|saved offline|No internet/i);
  assert.equal(db.scalar(`select count(*) from public.expenses where title='Offline chai'`), '0');
  await a.ctx.setOffline(false);
  await a.page.goto(`${mock.url}/g/${ids.g}/diary`);
  await a.page.waitForFunction(() => true);
  await expect(a.page, 'Offline chai', 15000);
  assert.equal(db.scalar(`select count(*) from public.expenses where title='Offline chai'`), '1');
  await a.ctx.close();
});

test('mobile layout: bottom nav, FAB, no horizontal scroll', async () => {
  const m = await newPage({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });
  await login(m.page, 'ravi@example.com'); await m.page.waitForURL('**/groups');
  for (const path of ['', '/diary', '/balances', '/members', '/reports', '/more', '/settings', '/expense/new']) {
    await m.page.goto(`${mock.url}/g/${ids.g}${path}`);
    await m.page.waitForLoadState('networkidle');
    const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `horizontal overflow ${overflow}px on ${path || '/'}`);
  }
  await m.page.goto(`${mock.url}/g/${ids.g}`);
  await m.page.locator('.bottomnav').waitFor({ state: 'visible' }); await m.page.locator('.fab').waitFor({ state: 'visible' });
  await m.ctx.close();
});


/** Finds text that overlaps other text, and anything poking out of the viewport. Runs in the browser. */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    (window as any).__name = (f: unknown) => f;
    const vw = window.innerWidth;
    type Box = { el: Element; r: DOMRect; txt: string };
    const boxes: Box[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent ?? '').trim(); const el = n.parentElement;
      if (!t || !el) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[aria-hidden="true"]') || el.closest('.sr-only') || el.closest('script,style')) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      for (const r of Array.from(range.getClientRects())) if (r.width > 2 && r.height > 4) boxes.push({ el, r, txt: t.slice(0, 24) });
    }
    const out: string[] = [];
    const fixedUi = (e: Element) => !!e.closest('.bottomnav, .fab, .toasts, .topbar, header.top');
    const scrolls = (e: Element) => { for (let x: Element | null = e; x && x !== document.body; x = x.parentElement) { const o = getComputedStyle(x).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
    for (const b of boxes) if ((b.r.right > vw + 1 || b.r.left < -1) && !scrolls(b.el)) out.push(`off-screen: "${b.txt}" (${Math.round(b.r.left)}..${Math.round(b.r.right)} of ${vw})`);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, c = boxes[j]!;
      if (a.el === c.el || a.el.contains(c.el) || c.el.contains(a.el) || fixedUi(a.el) !== fixedUi(c.el)) continue;
      const w = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left);
      const h = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top);
      if (w > 3 && h > 4) {
        const small = Math.min(a.r.width * a.r.height, c.r.width * c.r.height);
        if ((w * h) / small > 0.25) out.push(`overlap: "${a.txt}" x "${c.txt}"`);
      }
    }
    return out;
  });
}

test('mobile audit: no overlapping text or off-screen content at 360px (English + Hindi)', async () => {
  const m = await newPage({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  await login(m.page, 'ravi@example.com'); await m.page.waitForURL('**/groups');
  const eid = db.scalar(`select id::text from public.expenses where title='Gas cylinder'`);
  const paths = ['/groups', '/profile', '/notifications'].map((p) => p)
    .concat(['', '/diary', '/balances', '/settlements', '/members', '/requests', '/reports', '/statement', '/more', '/settings', '/expense/new', '/shopping', '/notices', '/activity', `/expense/${eid}`].map((p) => `/g/${ids.g}${p}`));
  const problems: string[] = [];
  for (const lang of ['en', 'hi']) {
    if (lang === 'hi') { await m.page.goto(`${mock.url}/groups`); await m.page.getByRole('button', { name: 'हिं' }).first().click(); await m.page.waitForTimeout(300); }
    for (const path of paths) {
      await m.page.goto(mock.url + path); await m.page.waitForLoadState('networkidle'); await m.page.waitForTimeout(250);
      const ov = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (ov > 1) problems.push(`[${lang}] ${path}: horizontal scroll ${ov}px`);
      for (const p of await layoutProblems(m.page)) problems.push(`[${lang}] ${path}: ${p}`);
    }
  }
  // restore English so later tests start from the default language
  await m.page.goto(`${mock.url}/groups`); await m.page.getByRole('button', { name: 'EN', exact: true }).first().click();
  for (let i = 0; i < 30 && db.scalar(`select preferred_language from public.profiles where id=(select id from auth.users where email='ravi@example.com')`) !== 'en'; i++) await m.page.waitForTimeout(200);
  await m.ctx.close();
  assert.deepEqual(problems, []);
});

test('links in lists and nav are not underlined; prose links are', async () => {
  const m = await newPage({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  await login(m.page, 'ravi@example.com'); await m.page.waitForURL('**/groups');
  const bad: string[] = [];
  for (const path of ['', '/diary', '/members', '/balances', '/more']) {
    await m.page.goto(`${mock.url}/g/${ids.g}${path}`); await m.page.waitForLoadState('networkidle');
    bad.push(...await m.page.evaluate(() => Array.from(document.querySelectorAll('a')).filter((a) => !a.closest('p, .legal-body, .check') && getComputedStyle(a).textDecorationLine.includes('underline')).map((a) => `underlined: ${(a.textContent ?? '').trim().slice(0, 30)}`)));
  }
  await m.ctx.close();
  assert.deepEqual([...new Set(bad)], []);
});

test('screenshots (set E2E_SHOTS=dir to keep them)', async () => {
  const dir = process.env.E2E_SHOTS; if (!dir) return;
  const { mkdirSync } = await import('node:fs'); mkdirSync(dir, { recursive: true });
  for (const [label, opts] of [['mobile', { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1280, height: 800 } }]] as const) {
    const x = await newPage(opts);
    await login(x.page, 'ravi@example.com'); await x.page.waitForURL('**/groups');
    for (const path of ['', '/diary', '/balances', '/settlements', '/members', '/reports', '/expense/new', '/more']) {
      await x.page.goto(`${mock.url}/g/${ids.g}${path}`);
      await x.page.waitForLoadState('networkidle'); await x.page.waitForTimeout(500);
      await x.page.screenshot({ path: join(dir, `${label}${path.replace(/\//g, '-') || '-home'}.png`) });
    }
    await x.page.goto(`${mock.url}/groups`); await x.page.waitForTimeout(600); await x.page.screenshot({ path: join(dir, `${label}-groups.png`) });
    await x.page.goto(`${mock.url}/notifications`); await x.page.waitForLoadState('networkidle'); await x.page.waitForTimeout(400); await x.page.screenshot({ path: join(dir, `${label}-notifications.png`) });
    await x.ctx.close();
  }
  const y = await newPage({ viewport: { width: 390, height: 800 } });
  await y.page.goto(mock.url + '/login'); await y.page.screenshot({ path: join(dir, 'mobile-login.png') });
  await y.page.goto(mock.url + '/register'); await y.page.screenshot({ path: join(dir, 'mobile-register.png') });
  await y.page.goto(mock.url + '/terms'); await y.page.screenshot({ path: join(dir, 'mobile-terms.png') });
  const d = await newPage({ viewport: { width: 1366, height: 800 } });
  await d.page.goto(mock.url + '/login', { waitUntil: 'networkidle' }); await d.page.waitForTimeout(400); await d.page.screenshot({ path: join(dir, 'desktop-login.png') });
  await d.page.goto(mock.url + '/register', { waitUntil: 'networkidle' }); await d.page.waitForTimeout(400); await d.page.screenshot({ path: join(dir, 'desktop-register.png') });
  await d.page.goto(mock.url + '/privacy', { waitUntil: 'networkidle' }); await d.page.waitForTimeout(400); await d.page.screenshot({ path: join(dir, 'desktop-privacy.png') });
  await d.ctx.close();
  await y.ctx.close();
});

test('profile: update name, export data, change password, delete account', async () => {
  const a = await newPage();
  await register(a.page, 'Temp Person', 'temp@example.com'); await login(a.page, 'temp@example.com'); await a.page.waitForURL('**/groups');
  await a.page.goto(mock.url + '/profile');
  await a.page.getByLabel('Full name').fill('Temp Renamed');
  await a.page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(a.page, 'Saved');
  assert.equal(db.scalar(`select count(*) from public.profiles where full_name='Temp Renamed'`), '1');
  await a.page.getByLabel('New password').fill('Another1Pass'); await a.page.getByLabel('Confirm password').fill('Another1Pass');
  await a.page.getByRole('button', { name: 'Change password' }).last().click();
  await expect(a.page, 'Password changed');
  await a.page.getByRole('button', { name: 'Delete my account' }).click();
  await a.page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete my account' }).click();
  await a.page.waitForURL('**/login');
  assert.equal(db.scalar(`select count(*) from auth.users where email='temp@example.com'`), '0');
  assert.equal(db.scalar(`select count(*) from public.profiles where full_name='Temp Renamed'`), '0');
  await a.ctx.close();
});

test('auth UX: Google button, show/hide password, strength meter, consent stored', async () => {
  const { ctx, page } = await newPage();
  await page.goto(mock.url + '/login');
  assert.ok(await page.getByTestId('google-btn').isVisible());
  const pw = page.getByLabel('Password', { exact: true });
  await pw.fill('secret123');
  assert.equal(await pw.getAttribute('type'), 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  assert.equal(await pw.getAttribute('type'), 'text');
  await page.goto(mock.url + '/register');
  assert.ok(await page.getByTestId('google-btn').isVisible());
  // Google sign-up also needs the tick
  await page.getByTestId('google-btn').click();
  await expect(page, /accept the Terms of Use and Privacy Policy/i);
  const first = page.getByLabel('Password', { exact: true });
  await first.fill('abc12345');
  const weak = Number(await page.getByTestId('pw-strength').getAttribute('data-score'));
  await first.fill('Tr1cky-Horse-Battery-9');
  const strong = Number(await page.getByTestId('pw-strength').getAttribute('data-score'));
  assert.ok(strong > weak && strong === 4, `strength ${weak} -> ${strong}`);
  // policy links open the public pages
  const href = await page.getByRole('link', { name: 'Privacy Policy' }).first().getAttribute('href');
  assert.equal(href, '/privacy');
  // acceptance is recorded on the account
  await page.getByLabel('Full name').fill('Consent Check'); await page.getByLabel('Email').fill('consent@example.com');
  await page.getByLabel('Confirm password').fill('Tr1cky-Horse-Battery-9');
  await page.getByTestId('consent').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByTestId('verify-notice').waitFor();
  const meta = mock.signupMeta.get('consent@example.com') as Record<string, string>;
  assert.match(String(meta.terms_version), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!Number.isNaN(Date.parse(meta.terms_accepted_at!)), 'acceptance time recorded');
  await ctx.close();
});

test('legal pages are public and the app shows setup help when unconfigured is handled by build config', async () => {
  const { ctx, page } = await newPage();
  await page.goto(mock.url + '/privacy'); await expect(page, 'Privacy Policy');
  await expect(page, /Last updated: /); await expect(page, /Digital Personal Data Protection/);
  assert.ok(await page.locator('.legal-toc button').count() >= 10);
  await page.goto(mock.url + '/terms'); await expect(page, 'Terms of Use');
  await expect(page, /Governing law and disputes/); await expect(page, /help@example.com/);
  assert.ok(!(await page.locator('body').innerText()).includes('{'), 'no unfilled placeholders');
  await page.getByRole('button', { name: 'हिं' }).click(); await expect(page, 'उपयोग की शर्तें'); await expect(page, /आख़िरी बदलाव/);
  assert.ok(!(await page.locator('body').innerText()).includes('{'), 'no unfilled placeholders (hi)');
  await page.goto(mock.url + '/nope'); await page.waitForURL('**/login');
  await ctx.close();
});

test('edit window: Edited tag, 1-hour limit in the UI and in the database', async () => {
  const a = await newPage();
  await login(a.page, 'ravi@example.com'); await a.page.waitForURL('**/groups');
  const id = db.scalar(`select id::text from public.expenses where title='Gas cylinder'`);
  // inside the window: edit button visible, no Edited tag yet
  await a.page.goto(`${mock.url}/g/${ids.g}/expense/${id}`);
  await expect(a.page, /You can edit this for \d+ more min/);
  assert.equal(await a.page.getByRole('link', { name: /Edit/ }).count(), 1);
  assert.equal(await a.page.getByTestId('edited-tag').count(), 0);
  // 2 hours later
  db.run(`alter table public.expenses disable trigger trg_expenses_guard; update public.expenses set created_at = now() - interval '2 hours' where id='${id}'; alter table public.expenses enable trigger trg_expenses_guard`);
  await a.page.reload();
  await expect(a.page, /1-hour edit time is over/);
  assert.equal(await a.page.getByRole('link', { name: /Edit/ }).count(), 0);
  assert.equal(await a.page.getByRole('button', { name: 'Cancel this expense' }).count(), 1, 'cancel (void) stays available');
  await a.page.goto(`${mock.url}/g/${ids.g}/expense/${id}/edit`);
  await a.page.getByTestId('edit-locked').waitFor();
  await a.ctx.close();
});

test('statement: month / custom range, who-paid-for-whom, CSV and PDF', async () => {
  const a = await newPage({ acceptDownloads: true });
  await login(a.page, 'ravi@example.com'); await a.page.waitForURL('**/groups');
  await a.page.goto(`${mock.url}/g/${ids.g}/statement`);
  await a.page.getByTestId('stmt-total').waitFor();
  const dbTotal = Number(db.scalar(`select coalesce(sum(amount_paise),0) from public.expenses where status='active' and spent_at >= date_trunc('month', now())`));
  const shown = (await a.page.getByTestId('stmt-total').innerText()).replace(/[^0-9.]/g, '');
  assert.equal(Math.round(Number(shown) * 100), dbTotal);
  await a.page.getByTestId('stmt-pairs').waitFor();
  const rows = await a.page.getByTestId('stmt-expenses').locator('tbody tr').count();
  assert.equal(rows, Number(await a.page.getByTestId('stmt-count').innerText()));
  // custom range with no expenses
  await a.page.getByRole('tab', { name: 'Custom dates' }).click();
  await a.page.getByLabel('From').fill('2020-01-01'); await a.page.getByLabel('To').fill('2020-01-31');
  await a.page.getByRole('button', { name: 'Show' }).click();
  await expect(a.page, 'No expenses in this period');
  // invalid range
  await a.page.getByLabel('From').fill('2020-03-01'); await a.page.getByRole('button', { name: 'Show' }).click();
  await expect(a.page, /start date that is not after/i);
  // last month tab works (probably empty), this month again
  await a.page.getByRole('tab', { name: 'This month' }).click();
  await a.page.getByTestId('stmt-total').waitFor();
  // CSV download
  const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.getByRole('button', { name: 'Export CSV' }).click()]);
  assert.match(dl.suggestedFilename(), /^Khatafy-Flat-302-\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv$/);
  // PDF (print layout): chrome chrome of the app is hidden, report content is present
  await a.page.emulateMedia({ media: 'print' });
  assert.equal(await a.page.locator('.topbar').isVisible(), false);
  assert.equal(await a.page.locator('.print-head').isVisible(), true);
  const pdf = await a.page.pdf({ format: 'A4', printBackground: true });
  const { writeFileSync } = await import('node:fs');
  const f = join(tmpdir(), 'khatafy-statement-e2e.pdf'); writeFileSync(f, pdf);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF'); assert.ok(pdf.length > 8000, `pdf too small: ${pdf.length}`);
  const { spawnSync } = await import('node:child_process');
  const txt = spawnSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
  if (txt.status === 0) { assert.match(txt.stdout, /Flat 302/); assert.match(txt.stdout, /Internet/); assert.match(txt.stdout, /Ravi Kumar/); }
  await a.ctx.close();
});

test('theme: light by default (even if the device is dark), switchable and remembered', async () => {
  const a = await newPage({ colorScheme: 'dark' });
  await a.page.goto(mock.url + '/login');
  assert.equal(await a.page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await login(a.page, 'ravi@example.com'); await a.page.waitForURL('**/groups');
  await a.page.getByRole('button', { name: 'Change theme' }).click();
  assert.equal(await a.page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await a.page.reload(); await a.page.getByRole('button', { name: 'Change theme' }).waitFor();
  assert.equal(await a.page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  const bg = await a.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(bg, 'rgb(246, 247, 251)');
  await a.page.getByRole('button', { name: 'Change theme' }).click();
  assert.equal(await a.page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await a.ctx.close();
});

test('resend verification: 60-second timer on register and login', async () => {
  const a = await newPage();
  await a.page.goto(mock.url + '/register');
  await a.page.getByLabel('Full name').fill('Timer Test'); await a.page.getByLabel('Email').fill('timer@example.com');
  await a.page.getByLabel('Password', { exact: true }).fill(PW); await a.page.getByLabel('Confirm password').fill(PW);
  await a.page.getByTestId('consent').check();
  await a.page.getByRole('button', { name: 'Create account' }).click();
  await a.page.getByTestId('verify-notice').waitFor();
  const btn = a.page.getByRole('button', { name: /Resend/ });
  assert.equal(await btn.isDisabled(), true);
  assert.match(await btn.innerText(), /Resend in (5\d|60)s/);
  // after a reload the timer is still running (same tab)
  await login(a.page, 'timer@example.com');
  await expect(a.page, /verify your email/i);
  const btn2 = a.page.getByRole('button', { name: /Resend/ });
  assert.equal(await btn2.isDisabled(), true);
  // fast-forward: expire the timer in storage -> button becomes active
  await a.page.evaluate(() => { for (const k of Object.keys(sessionStorage)) if (k.startsWith('kh.cd.')) sessionStorage.setItem(k, String(Date.now() - 1000)); });
  await a.page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('button.btn-secondary')?.disabled, null, { timeout: 5000 });
  await a.ctx.close();
});
