// Maps database / network errors to stable codes that the UI translates (Hindi + English).
export class KhError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'KhError';
  }
}

const PHASE1_MESSAGES: Array<[RegExp, string]> = [
  [/Authentication required/i, 'AUTH_REQUIRED'],
  [/Group name must be between/i, 'INVALID_GROUP_NAME'],
  [/Description is too long/i, 'DESCRIPTION_TOO_LONG'],
  [/Invalid invitation code/i, 'INVITATION_INVALID'],
  [/Invitation is invalid, expired, revoked or fully used/i, 'INVITATION_INVALID'],
  [/invitation has been revoked/i, 'INVITATION_INVALID'],
  [/Invitation usage limit reached/i, 'INVITATION_USED_UP'],
  [/not accepting join requests|Archived groups cannot accept/i, 'GROUP_ARCHIVED'],
  [/already an active member/i, 'ALREADY_MEMBER'],
  [/Message is too long/i, 'NOTE_TOO_LONG'],
  [/already been reviewed/i, 'REQUEST_ALREADY_REVIEWED'],
  [/Join request not found/i, 'REQUEST_NOT_FOUND'],
  [/Invitation not found/i, 'INVITATION_NOT_FOUND'],
  [/Only group admins/i, 'ADMIN_REQUIRED'],
  [/Active (target )?membership not found/i, 'TARGET_NOT_MEMBER'],
  [/Use leave_group/i, 'USE_LEAVE'],
  [/Invitation expiry/i, 'INVALID_EXPIRY'],
  [/Maximum uses/i, 'INVALID_MAX_USES'],
  [/Role must be admin or member/i, 'INVALID_ROLE'],
  [/duplicate key value/i, 'DUPLICATE'],
];

const CODE_RE = /^[A-Z][A-Z0-9_]{2,}$/;

/** Known codes the UI can translate. Anything else falls back to UNKNOWN. */
export function toKhError(e: unknown): KhError {
  if (e instanceof KhError) return e;
  const anyE = e as { message?: string; code?: string; status?: number; name?: string } | null;
  const msg = (anyE?.message ?? '').trim();
  if (CODE_RE.test(msg)) return new KhError(msg);
  for (const [re, code] of PHASE1_MESSAGES) if (re.test(msg)) return new KhError(code, msg);
  if (anyE?.code === '42501' || /permission denied|row-level security/i.test(msg)) return new KhError('FORBIDDEN', msg);
  if (anyE?.code === 'PGRST301' || /JWT expired|jwt/i.test(msg) || anyE?.status === 401) return new KhError('SESSION_EXPIRED', msg);
  if (anyE?.code === '54000') return new KhError('RATE_LIMITED', msg);
  if (/Failed to fetch|NetworkError|network request failed|Load failed|fetch failed/i.test(msg) || anyE?.name === 'TypeError') {
    return new KhError('NETWORK', msg);
  }
  return new KhError('UNKNOWN', msg);
}

/** Errors that will never succeed on retry (used by the offline queue). */
export function isPermanentError(code: string): boolean {
  return !['NETWORK', 'SESSION_EXPIRED', 'UNKNOWN', 'RATE_LIMITED'].includes(code);
}

/** Supabase Auth (GoTrue) errors -> stable codes. */
export function toAuthError(e: unknown): KhError {
  const x = e as { message?: string; code?: string; status?: number } | null;
  const msg = x?.message ?? '';
  const code = x?.code ?? '';
  if (/invalid login credentials/i.test(msg) || code === 'invalid_credentials') return new KhError('AUTH_INVALID_CREDENTIALS', msg);
  if (/email not confirmed/i.test(msg) || code === 'email_not_confirmed') return new KhError('AUTH_EMAIL_NOT_CONFIRMED', msg);
  if (/already (been )?registered|already exists/i.test(msg) || code === 'user_already_exists') return new KhError('AUTH_USER_EXISTS', msg);
  if (code === 'weak_password' || /password.*(weak|short|at least|characters)/i.test(msg)) return new KhError('AUTH_WEAK_PASSWORD', msg);
  if (x?.status === 429 || /rate limit|too many|security purposes/i.test(msg) || code === 'over_email_send_rate_limit') return new KhError('AUTH_EMAIL_RATE', msg);
  if (/expired|invalid.*(token|link)|otp/i.test(msg)) return new KhError('AUTH_LINK_EXPIRED', msg);
  return toKhError(e);
}
