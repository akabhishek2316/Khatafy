// The client-side split preview (TypeScript) must match the database engine (SQL) for every input.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { computeSplits, evenPercentBps, type ParticipantInput } from '../../packages/core/src/index';
import { createDb, sq, type Db } from './harness';

let db: Db;
before(() => { db = createDb(); });
after(() => db.drop());

const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const sqlSplit = (mode: string, amount: number, ps: ParticipantInput[]) => {
  const arr = ps.map((p) => ({ user_id: p.userId, ...(p.amountPaise !== undefined ? { amount_paise: p.amountPaise } : {}), ...(p.percentBps !== undefined ? { percent_bps: p.percentBps } : {}) }));
  const rows = db.json<Array<{ user_id: string; share_paise: number; percent_bps: number | null }>>(
    `select jsonb_agg(jsonb_build_object('user_id', user_id, 'share_paise', share_paise, 'percent_bps', percent_bps) order by user_id) from public.compute_splits('${mode}', ${amount}, ${sq(JSON.stringify(arr))}::jsonb)`);
  return Object.fromEntries(rows.map((r) => [r.user_id, r.share_paise]));
};
const tsSplit = (mode: 'equal' | 'amount' | 'percent', amount: number, ps: ParticipantInput[]) =>
  Object.fromEntries(computeSplits(mode, amount, ps).map((s) => [s.userId, s.sharePaise]));

test('equal splits: TS === SQL (random)', () => {
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 60; i++) {
    const n = 1 + Math.floor(rnd() * 8); const amount = 1 + Math.floor(rnd() * 9_999_999);
    const ps = ids(n).map((userId) => ({ userId }));
    assert.deepEqual(tsSplit('equal', amount, ps), sqlSplit('equal', amount, ps), `n=${n} amount=${amount}`);
  }
});

test('percent splits (largest remainder, ties by user id): TS === SQL (random)', () => {
  let seed = 5; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 60; i++) {
    const n = 2 + Math.floor(rnd() * 6); const amount = 1 + Math.floor(rnd() * 9_999_999);
    // random bps that sum to 10000
    const cuts = Array.from({ length: n - 1 }, () => Math.floor(rnd() * 10001)).sort((a, b) => a - b);
    const bps = [...cuts, 10000].map((c, k) => c - (k ? cuts[k - 1]! : 0));
    const ps = ids(n).map((userId, k) => ({ userId, percentBps: bps[k]! }));
    assert.deepEqual(tsSplit('percent', amount, ps), sqlSplit('percent', amount, ps), `bps=${bps} amount=${amount}`);
  }
  const ps = ids(3).map((userId, k) => ({ userId, percentBps: evenPercentBps(3)[k]! }));
  assert.deepEqual(tsSplit('percent', 1000, ps), sqlSplit('percent', 1000, ps));
});

test('amount splits: TS === SQL and both reject wrong sums', () => {
  const ps = ids(3).map((userId, k) => ({ userId, amountPaise: [100, 250, 650][k]! }));
  assert.deepEqual(tsSplit('amount', 1000, ps), sqlSplit('amount', 1000, ps));
  assert.throws(() => computeSplits('amount', 1001, ps));
  assert.throws(() => sqlSplit('amount', 1001, ps));
});
