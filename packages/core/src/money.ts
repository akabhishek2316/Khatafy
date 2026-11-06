// Money is ALWAYS integer paise. Never use floating point for amounts.
export const MAX_AMOUNT_PAISE = 10_000_000_000; // INR 10 crore, mirrors the database limit

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/**
 * Parses a user typed rupee amount ("1,250", "99.5", "₹ 10.05", "१२०") into integer paise
 * using string arithmetic only. Returns null when the text is not a valid amount
 * (more than 2 decimals, negative, letters, too large ...).
 */
export function parseRupeesToPaise(input: string): number | null {
  let s = input.trim().replace(/[₹\s,]/g, '');
  s = s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  if (!/^(\d{1,10})?(\.\d{1,2})?$/.test(s) || s === '' || s === '.') return null;
  const [intPart = '', frac = ''] = s.split('.');
  const paise = Number(intPart || '0') * 100 + Number(frac.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(paise) || paise > MAX_AMOUNT_PAISE) return null;
  return paise;
}

/** Paise -> "1234.50" plain string (for inputs and CSV). */
export function paiseToPlain(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const r = Math.floor(abs / 100);
  const p = abs % 100;
  return `${neg ? '-' : ''}${r}.${String(p).padStart(2, '0')}`;
}

const groupFmt = new Intl.NumberFormat('en-IN');

/** Paise -> "₹1,23,456.50" (Indian digit grouping). */
export function formatPaise(paise: number, opts: { symbol?: boolean; sign?: boolean } = {}): string {
  const { symbol = true, sign = false } = opts;
  const abs = Math.abs(paise);
  const r = Math.floor(abs / 100);
  const p = abs % 100;
  const body = `${groupFmt.format(r)}.${String(p).padStart(2, '0')}`;
  const prefix = paise < 0 ? '-' : sign && paise > 0 ? '+' : '';
  return `${prefix}${symbol ? '₹' : ''}${body}`;
}

/** "33.33" -> 3333 basis points (100.00% = 10000). Null if invalid. */
export function parsePercentToBps(input: string): number | null {
  const s = input.trim().replace('%', '').replace(/\s/g, '');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const [i = '0', f = ''] = s.split('.');
  const bps = Number(i) * 100 + Number(f.padEnd(2, '0') || '0');
  return bps > 10000 ? null : bps;
}

export function bpsToPercentString(bps: number): string {
  const r = Math.floor(bps / 100);
  const f = bps % 100;
  return f === 0 ? String(r) : `${r}.${String(f).padStart(2, '0').replace(/0$/, '')}`;
}
