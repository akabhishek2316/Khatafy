import { MAX_AMOUNT_PAISE } from './money';
import type { ExpenseInput } from './types';

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

/** Min 8 chars with at least one letter and one digit. */
export function passwordProblem(p: string): 'PASSWORD_SHORT' | 'PASSWORD_WEAK' | null {
  if (p.length < 8) return 'PASSWORD_SHORT';
  if (!/[A-Za-zऀ-ॿ]/.test(p) || !/\d/.test(p)) return 'PASSWORD_WEAK';
  return null;
}

/** Extracts the invitation code from a pasted link or raw code. */
export function extractInviteCode(input: string): string | null {
  const s = input.trim();
  const m = /(?:[?&#]code=|\/join\/)([0-9a-fA-F]{20,64})/.exec(s) ?? /^([0-9a-fA-F]{20,64})$/.exec(s);
  return m?.[1]?.toLowerCase() ?? null;
}

export type ExpenseFormError = 'INVALID_TITLE' | 'INVALID_AMOUNT' | 'NO_PARTICIPANTS' | 'PAYER_REQUIRED' | 'INVALID_DATE' | 'NOTE_TOO_LONG' | 'INVALID_CATEGORY';

export function validateExpenseInput(e: ExpenseInput): ExpenseFormError[] {
  const errs: ExpenseFormError[] = [];
  if (!e.title.trim() || e.title.trim().length > 120) errs.push('INVALID_TITLE');
  if (!Number.isSafeInteger(e.amountPaise) || e.amountPaise <= 0 || e.amountPaise > MAX_AMOUNT_PAISE) errs.push('INVALID_AMOUNT');
  if (!e.participants.length) errs.push('NO_PARTICIPANTS');
  if (!e.paidBy) errs.push('PAYER_REQUIRED');
  if (!e.categoryKey) errs.push('INVALID_CATEGORY');
  const t = Date.parse(e.spentAt);
  if (Number.isNaN(t) || t > Date.now() + 24 * 3600 * 1000) errs.push('INVALID_DATE');
  if (e.note && e.note.length > 500) errs.push('NOTE_TOO_LONG');
  return errs;
}
