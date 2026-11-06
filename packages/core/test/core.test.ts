import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseRupeesToPaise, paiseToPlain, formatPaise, parsePercentToBps, bpsToPercentString, MAX_AMOUNT_PAISE,
  computeSplits, SplitError, evenPercentBps, suggestSettlements, netOf, DraftQueue, syncDrafts, toKhError, isPermanentError,
  messages, createTranslator, passwordProblem, extractInviteCode, isEmail, toCsv, csvCell, monthKey, shiftMonth, validateExpenseInput, editWindowLeftMs, EDIT_WINDOW_MS, monthRange, dayKey, payerBeneficiaryTotals, statementToCsv, type Statement,
  type ExpenseInput,
} from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');

test('money parsing & formatting', () => {
  assert.equal(parseRupeesToPaise('12'), 1200);
  assert.equal(parseRupeesToPaise('12.5'), 1250);
  assert.equal(parseRupeesToPaise('1,234.05'), 123405);
  assert.equal(parseRupeesToPaise('0.1'), 10);
  for (const bad of ['', 'abc', '-5', '1.234', '1e3', '100000000.01']) assert.equal(parseRupeesToPaise(bad), null, bad);
  assert.equal(parseRupeesToPaise('100000000'), MAX_AMOUNT_PAISE);
  assert.equal(parseRupeesToPaise('0'), 0); // callers reject 0 as an amount
  assert.equal(paiseToPlain(123405), '1234.05');
  assert.equal(paiseToPlain(5), '0.05');
  assert.match(formatPaise(123456700), /12,34,567/); // Indian grouping
  assert.equal(parsePercentToBps('33.33'), 3333);
  assert.equal(bpsToPercentString(3333), '33.33');
});

test('equal split distributes every paisa, deterministic by user id', () => {
  const ids = ['c', 'a', 'b'];
  const s = computeSplits('equal', 1000, ids.map((userId) => ({ userId })));
  assert.equal(s.reduce((a, x) => a + x.sharePaise, 0), 1000);
  assert.deepEqual(Object.fromEntries(s.map((x) => [x.userId, x.sharePaise])), { a: 334, b: 333, c: 333 });
});

test('split property: sums always equal total (random)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 500; i++) {
    const n = 1 + Math.floor(rnd() * 9); const total = 1 + Math.floor(rnd() * 5_000_000);
    const ps = Array.from({ length: n }, (_, k) => ({ userId: `u${k}` }));
    assert.equal(computeSplits('equal', total, ps).reduce((a, x) => a + x.sharePaise, 0), total);
    const bps = evenPercentBps(n); assert.equal(bps.reduce((a, b) => a + b, 0), 10000);
    const pc = computeSplits('percent', total, ps.map((p, k) => ({ ...p, percentBps: bps[k]! })));
    assert.equal(pc.reduce((a, x) => a + x.sharePaise, 0), total);
  }
});

test('amount & percent split validation', () => {
  assert.throws(() => computeSplits('amount', 1000, [{ userId: 'a', amountPaise: 400 }, { userId: 'b', amountPaise: 500 }]), (e) => e instanceof SplitError);
  assert.throws(() => computeSplits('percent', 1000, [{ userId: 'a', percentBps: 5000 }, { userId: 'b', percentBps: 4000 }]), (e) => e instanceof SplitError);
  assert.throws(() => computeSplits('equal', 1000, []), (e) => e instanceof SplitError);
  assert.throws(() => computeSplits('equal', 1000, [{ userId: 'a' }, { userId: 'a' }]), (e) => e instanceof SplitError);
  assert.throws(() => computeSplits('equal', 0, [{ userId: 'a' }]), (e) => e instanceof SplitError);
  assert.equal(computeSplits('amount', 1000, [{ userId: 'a', amountPaise: 400 }, { userId: 'b', amountPaise: 600 }])[1]!.sharePaise, 600);
});

test('settlement suggestions zero out every balance with <= n-1 transfers', () => {
  let seed = 3; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 300; i++) {
    const n = 2 + Math.floor(rnd() * 8);
    const nets = Array.from({ length: n }, (_, k) => ({ userId: `u${k}`, netPaise: Math.floor((rnd() - 0.5) * 100000) }));
    nets[0]!.netPaise -= nets.reduce((a, x) => a + x.netPaise, 0); // force sum 0
    const sug = suggestSettlements(nets);
    assert.ok(sug.length <= n - 1);
    const after = new Map(nets.map((x) => [x.userId, x.netPaise]));
    for (const s of sug) { assert.ok(s.amountPaise > 0); after.set(s.from, after.get(s.from)! + s.amountPaise); after.set(s.to, after.get(s.to)! - s.amountPaise); }
    for (const v of after.values()) assert.equal(v, 0);
  }
  assert.equal(netOf({ paid_paise: 1000, share_paise: 400, settlement_paid_paise: 0, settlement_received_paise: 200 }), 400);
});

test('offline draft queue: idempotent sync, permanent failures kept, offline stops', async () => {
  const store = new Map<string, string>();
  const q = new DraftQueue({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) });
  const input: ExpenseInput = { title: 'Milk', amountPaise: 6000, categoryKey: 'grocery', spentAt: new Date().toISOString(), paidBy: 'a', splitMode: 'equal', participants: [{ userId: 'a' }, { userId: 'b' }] };
  const d1 = await q.add('g', input); await q.add('g', { ...input, title: 'Bread' });
  const seen: string[] = [];
  let mode: 'ok' | 'offline' | 'bad' = 'offline';
  const api = { createExpense: async (_g: string, key: string, e: ExpenseInput) => { seen.push(key); if (mode === 'offline') throw new Error('Failed to fetch'); if (mode === 'bad' && e.title === 'Bread') throw new Error('INVALID_AMOUNT'); return 'id'; } };
  let r = await syncDrafts(q, api as any);
  assert.equal(r.stoppedOffline, true); assert.equal((await q.list()).length, 2);
  mode = 'bad'; r = await syncDrafts(q, api as any);
  assert.equal(r.synced, 1); assert.equal(r.failed, 1);
  const left = await q.list(); assert.equal(left.length, 1); assert.equal(left[0]!.status, 'failed');
  assert.ok(seen.includes(d1.id)); // draft id used as idempotency key
});

test('error mapping', () => {
  assert.equal(toKhError(new Error('NOT_A_MEMBER')).code, 'NOT_A_MEMBER');
  assert.equal(toKhError(new TypeError('Failed to fetch')).code, 'NETWORK');
  assert.equal(toKhError({ message: 'JWT expired' }).code, 'SESSION_EXPIRED');
  assert.equal(toKhError({ message: 'weird' }).code, 'UNKNOWN');
  assert.equal(isPermanentError('NETWORK'), false);
  assert.equal(isPermanentError('INVALID_AMOUNT'), true);
});

test('validation helpers', () => {
  assert.equal(passwordProblem('short1'), 'PASSWORD_SHORT');
  assert.equal(passwordProblem('longpassword'), 'PASSWORD_WEAK');
  assert.equal(passwordProblem('longpass1'), null);
  assert.equal(isEmail('a@b.co'), true); assert.equal(isEmail('a@b'), false);
  const code = 'ab12'.repeat(12);
  assert.equal(extractInviteCode(`https://x.app/join?code=${code}`), code);
  assert.equal(extractInviteCode(`  ${code.toUpperCase()} `), code);
  assert.equal(extractInviteCode('!!'), null);
  assert.deepEqual(validateExpenseInput({ title: '', amountPaise: 0, categoryKey: 'x', spentAt: 'bad', paidBy: '', splitMode: 'equal', participants: [] }).length > 3, true);
});

test('csv escaping and formula-injection guard', () => {
  assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  const out = toCsv(['t'], [[{ text: '=HYPERLINK("x")' }]]);
  assert.ok(out.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(out.startsWith('﻿'));
});

test('dates: month keys use group timezone', () => {
  assert.equal(monthKey(new Date('2026-01-31T20:00:00Z'), 'Asia/Kolkata'), '2026-02'); // 01:30 IST on 1 Feb
  assert.equal(monthKey(new Date('2026-01-31T20:00:00Z'), 'UTC'), '2026-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12'); assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

// ---------------- i18n completeness ----------------
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === 'node_modules' || f === 'dist' ? [] : walk(p)) : /\.tsx?$/.test(p) ? [p] : []; });
const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(',');

test('every message has en+hi, same placeholders', () => {
  for (const [k, v] of Object.entries(messages)) {
    assert.ok(v.en?.trim(), `${k} missing en`); assert.ok(v.hi?.trim(), `${k} missing hi`);
    assert.equal(ph(v.en), ph(v.hi), `${k}: placeholder mismatch`);
  }
});

test('every key used by the web UI exists', () => {
  const prefixes = new Set(Object.keys(messages).map((k) => k.split('.')[0]));
  const dynamicFamilies = ['cat', 'pay', 'err', 'role', 'split', 'invite', 'member', 'notif', 'act'];
  const missing: string[] = [];
  for (const f of walk(join(root, 'apps/web/src')).concat(walk(join(root, 'packages/core/src')).filter((x) => !/messages\./.test(x)))) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/['"`]([a-z]+(?:\.[a-zA-Z0-9_]+)+)['"`]/g)) {
      const k = m[1]!;
      if (!prefixes.has(k.split('.')[0]) || /^(lib|e|navigator|window|document|import|process)\./.test(k)) continue;
      if (/\.(tsx?|css|json|png|svg|webmanifest|js)$/.test(k)) continue;
      if (!(k in messages) && !dynamicFamilies.includes(k.split('.')[0]!)) missing.push(`${f.split('/src/')[1]}: ${k}`);
      else if (!(k in messages) && /^(err|notif|act)\./.test(k)) missing.push(`${f.split('/src/')[1]}: ${k}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('every error code raised by the database has a translation', () => {
  const dir = join(root, 'supabase/migrations'); const codes = new Set<string>();
  for (const f of readdirSync(dir)) for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/raise exception\s+'([A-Z][A-Z0-9_]+)'/gi)) codes.add(m[1]!);
  // raised only by functions that migration 0009 drops/replaces (the owner role no longer exists)
  const retired = new Set(['OWNER_REQUIRED', 'ALREADY_OWNER', 'OWNER_MUST_TRANSFER', 'INVALID_RETENTION', 'CLOSE_ALREADY_PENDING', 'CLOSE_NOT_FOUND', 'CLOSE_NOT_PENDING']);
  const missing = [...codes].filter((c) => !retired.has(c) && !(`err.${c}` in messages));
  assert.deepEqual(missing, []);
});

test('translator fills placeholders', () => {
  const t = createTranslator(messages, 'hi');
  assert.match(t('groups.welcome', { name: 'राम' }), /राम/);
});

test('edit window: 60 minutes, never negative', () => {
  const t0 = Date.parse('2026-05-01T10:00:00Z');
  assert.equal(editWindowLeftMs('2026-05-01T10:00:00Z', t0), EDIT_WINDOW_MS);
  assert.equal(editWindowLeftMs('2026-05-01T10:00:00Z', t0 + 59 * 60_000), 60_000);
  assert.equal(editWindowLeftMs('2026-05-01T10:00:00Z', t0 + 60 * 60_000), 0);
  assert.equal(editWindowLeftMs('2026-05-01T10:00:00Z', t0 + 5 * 3600_000), 0);
});

test('month ranges and day keys', () => {
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', to: '2026-12-31' });
  assert.equal(dayKey(new Date('2026-01-31T20:00:00Z'), 'Asia/Kolkata'), '2026-02-01');
});

test('statement: who paid for whom excludes own share; csv escapes', () => {
  const st = {
    expenses: [
      { id: '1', title: '=Rice', category_key: 'grocery', spent_at: '2026-04-01T00:00:00Z', amount_paise: 3000, paid_by: 'a', paid_by_name: 'Asha', note: null, version: 1, split_mode: 'equal',
        splits: [{ user_id: 'a', full_name: 'Asha', share_paise: 1000 }, { user_id: 'b', full_name: 'Bala', share_paise: 1000 }, { user_id: 'c', full_name: 'Chitra', share_paise: 1000 }] },
      { id: '2', title: 'Milk', category_key: 'food', spent_at: '2026-04-02T00:00:00Z', amount_paise: 1000, paid_by: 'b', paid_by_name: 'Bala', note: 'x,y', version: 2, split_mode: 'equal',
        splits: [{ user_id: 'a', full_name: 'Asha', share_paise: 500 }, { user_id: 'b', full_name: 'Bala', share_paise: 500 }] },
    ],
  } as unknown as Statement;
  const pairs = payerBeneficiaryTotals(st);
  assert.deepEqual(pairs.map((p) => `${p.payerName}>${p.forName}:${p.paise}`), ['Asha>Bala:1000', 'Asha>Chitra:1000', 'Bala>Asha:500']);
  const csv = statementToCsv(st, { date: 'Date', title: 'Title', category: 'Cat', paidBy: 'Paid by', amount: 'Amt', splitBetween: 'Split', note: 'Note' }, (k) => k);
  assert.ok(csv.includes(`"'=Rice"`) || csv.includes("'=Rice"));
  assert.ok(csv.includes('"x,y"'));
  assert.ok(csv.includes('Asha: 10.00; Bala: 10.00; Chitra: 10.00'));
});
