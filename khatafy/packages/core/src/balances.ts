export interface MemberBalance {
  user_id: string;
  full_name: string;
  is_deleted: boolean;
  status: 'active' | 'left' | 'removed';
  paid_paise: number;
  share_paise: number;
  settlement_paid_paise: number;
  settlement_received_paise: number;
  carry_paise?: number; // earlier balance carried forward by "Close period"
  net_paise: number;
}

/**
 * net = paid - share + settlements paid out - settlements received.
 * Positive: the member should receive money ("You will get").
 * Negative: the member owes money ("You need to pay").
 * (The original build pack printed the settlement signs the other way round, which would
 * make a debtor who pays back look like they owe MORE. This is the corrected formula.)
 */
export function netOf(b: Pick<MemberBalance, 'paid_paise' | 'share_paise' | 'settlement_paid_paise' | 'settlement_received_paise'>): number {
  return b.paid_paise - b.share_paise + b.settlement_paid_paise - b.settlement_received_paise;
}

export interface Suggestion {
  from: string; // debtor user id
  to: string; // creditor user id
  amountPaise: number;
}

/**
 * Greedy "fewest practical transfers": repeatedly match the biggest debtor with the biggest
 * creditor. At most n-1 transfers; after paying all of them every net becomes 0 (when the nets sum to 0).
 */
export function suggestSettlements(nets: Array<{ userId: string; netPaise: number }>): Suggestion[] {
  const cred = nets.filter((n) => n.netPaise > 0).map((n) => ({ ...n }));
  const debt = nets.filter((n) => n.netPaise < 0).map((n) => ({ userId: n.userId, left: -n.netPaise }));
  const credLeft = cred.map((c) => ({ userId: c.userId, left: c.netPaise }));
  const by = (a: { userId: string; left: number }, b: { userId: string; left: number }) =>
    b.left - a.left || (a.userId < b.userId ? -1 : 1);
  const out: Suggestion[] = [];
  for (;;) {
    credLeft.sort(by);
    debt.sort(by);
    const c = credLeft[0];
    const d = debt[0];
    if (!c || !d || c.left <= 0 || d.left <= 0) break;
    const amt = Math.min(c.left, d.left);
    out.push({ from: d.userId, to: c.userId, amountPaise: amt });
    c.left -= amt;
    d.left -= amt;
  }
  return out;
}
