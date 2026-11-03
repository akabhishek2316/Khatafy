import { paiseToPlain } from './money';
import { toCsv } from './csv';
import type { Statement } from './types';

export interface PairTotal { payerId: string; payerName: string; forId: string; forName: string; paise: number }

/**
 * "Who spent how much on whom": for every expense, the payer paid the other participants' shares.
 * A person's own share is not "for" someone else, so it is left out. Sorted by amount, biggest first.
 */
export function payerBeneficiaryTotals(s: Pick<Statement, 'expenses'>): PairTotal[] {
  const map = new Map<string, PairTotal>();
  for (const e of s.expenses) {
    for (const sp of e.splits) {
      if (sp.user_id === e.paid_by) continue;
      const k = `${e.paid_by}>${sp.user_id}`;
      const cur = map.get(k) ?? { payerId: e.paid_by, payerName: e.paid_by_name, forId: sp.user_id, forName: sp.full_name, paise: 0 };
      cur.paise += sp.share_paise;
      map.set(k, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.paise - a.paise || (a.payerName + a.forName).localeCompare(b.payerName + b.forName));
}

export function statementToCsv(
  s: Statement,
  h: { date: string; title: string; category: string; paidBy: string; amount: string; splitBetween: string; note: string },
  catName: (key: string) => string,
): string {
  return toCsv(
    [h.date, h.title, h.category, h.paidBy, h.amount, h.splitBetween, h.note],
    s.expenses.map((e) => [
      e.spent_at.slice(0, 10), { text: e.title }, catName(e.category_key), { text: e.paid_by_name }, paiseToPlain(e.amount_paise),
      { text: e.splits.map((p) => `${p.full_name}: ${paiseToPlain(p.share_paise)}`).join('; ') }, { text: e.note ?? '' },
    ]),
  );
}
