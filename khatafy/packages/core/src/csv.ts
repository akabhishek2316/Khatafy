import { paiseToPlain } from './money';

/** RFC 4180 escaping + spreadsheet formula-injection guard for free-text cells. */
export function csvCell(v: string | number | null | undefined, opts: { text?: boolean } = {}): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (opts.text && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined | { text: string }>>): string {
  const line = (cells: typeof rows[number]) =>
    cells.map((c) => (typeof c === 'object' && c !== null ? csvCell(c.text, { text: true }) : csvCell(c))).join(',');
  // BOM so Excel opens Hindi (UTF-8) correctly
  return '﻿' + [header.map((h) => csvCell(h)).join(','), ...rows.map(line)].join('\r\n') + '\r\n';
}

export function expensesToCsv(
  rows: Array<{ spent_at: string; title: string; category: string; amount_paise: number; paid_by_name: string; status: string; note?: string | null }>,
  header: { date: string; title: string; category: string; amount: string; paidBy: string; status: string; note: string },
): string {
  return toCsv(
    [header.date, header.title, header.category, header.amount, header.paidBy, header.status, header.note],
    rows.map((r) => [r.spent_at.slice(0, 10), { text: r.title }, r.category, paiseToPlain(r.amount_paise), { text: r.paid_by_name }, r.status, { text: r.note ?? '' }]),
  );
}
