// Exact split engine. MUST stay behaviour-identical to public.compute_splits() in
// supabase/migrations/0003_expenses.sql (a parity test checks both against random input).
import { MAX_AMOUNT_PAISE } from './money';

export type SplitMode = 'equal' | 'amount' | 'percent';

export interface ParticipantInput {
  userId: string;
  amountPaise?: number; // mode 'amount'
  percentBps?: number; // mode 'percent' (10000 = 100%)
}
export interface SplitShare {
  userId: string;
  sharePaise: number;
  percentBps: number | null;
}

export class SplitError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'SplitError';
  }
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

export function computeSplits(mode: SplitMode, amountPaise: number, participants: ParticipantInput[]): SplitShare[] {
  if (!['equal', 'amount', 'percent'].includes(mode)) throw new SplitError('INVALID_SPLIT_MODE');
  if (!isInt(amountPaise) || amountPaise <= 0 || amountPaise > MAX_AMOUNT_PAISE) throw new SplitError('INVALID_AMOUNT');
  if (!participants.length) throw new SplitError('NO_PARTICIPANTS');
  if (participants.length > 1000) throw new SplitError('TOO_MANY_PARTICIPANTS');

  const ps = participants.map((p) => ({ ...p, userId: p.userId.toLowerCase() }));
  if (new Set(ps.map((p) => p.userId)).size !== ps.length) throw new SplitError('DUPLICATE_PARTICIPANT');
  ps.sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));

  if (mode === 'equal') {
    const n = ps.length;
    const base = Math.floor(amountPaise / n);
    const rem = amountPaise % n;
    return ps.map((p, i) => ({ userId: p.userId, sharePaise: base + (i < rem ? 1 : 0), percentBps: null }));
  }

  if (mode === 'amount') {
    for (const p of ps) {
      if (!isInt(p.amountPaise) || p.amountPaise < 0) throw new SplitError('INVALID_SPLIT');
    }
    const sum = ps.reduce((s, p) => s + (p.amountPaise as number), 0);
    if (sum !== amountPaise) throw new SplitError('SPLIT_SUM_MISMATCH');
    return ps.map((p) => ({ userId: p.userId, sharePaise: p.amountPaise as number, percentBps: null }));
  }

  // percent: largest remainder method, ties broken by user id (ascending)
  for (const p of ps) {
    if (!isInt(p.percentBps) || p.percentBps < 0 || p.percentBps > 10000) throw new SplitError('INVALID_SPLIT');
  }
  const totalBps = ps.reduce((s, p) => s + (p.percentBps as number), 0);
  if (totalBps !== 10000) throw new SplitError('PERCENT_SUM_INVALID');
  const rows = ps.map((p) => {
    const num = amountPaise * (p.percentBps as number); // < 1e14, exact in double precision
    return { userId: p.userId, bps: p.percentBps as number, floor: Math.floor(num / 10000), rem: num % 10000 };
  });
  const leftover = amountPaise - rows.reduce((s, r) => s + r.floor, 0);
  const order = [...rows].sort((a, b) => b.rem - a.rem || (a.userId < b.userId ? -1 : 1));
  const bonus = new Set(order.slice(0, leftover).map((r) => r.userId));
  return rows.map((r) => ({ userId: r.userId, sharePaise: r.floor + (bonus.has(r.userId) ? 1 : 0), percentBps: r.bps }));
}

/** JSON expected by the create_expense / edit_expense RPCs. */
export function toRpcParticipants(mode: SplitMode, participants: ParticipantInput[]) {
  return participants.map((p) => {
    if (mode === 'amount') return { user_id: p.userId, amount_paise: p.amountPaise };
    if (mode === 'percent') return { user_id: p.userId, percent_bps: p.percentBps };
    return { user_id: p.userId };
  });
}

/** Distributes 100.00% over n participants as evenly as possible (for the percentage editor default). */
export function evenPercentBps(n: number): number[] {
  const base = Math.floor(10000 / n);
  const rem = 10000 - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}
