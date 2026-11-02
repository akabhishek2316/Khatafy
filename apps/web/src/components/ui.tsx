import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useT } from '../lib/i18n';

export function Logo({ size = 28 }: { size?: number }) {
  return <img className="logo-img" src="/icons/logo-mark.png" width={size} height={size} alt="" aria-hidden="true" decoding="async" />;
}

export function ExitIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
    </svg>
  );
}

export function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function Button({ variant = 'primary', loading, children, disabled, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean }) {
  return (
    <button className={`btn btn-${variant} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="spinner spinner-sm" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useT();
  return (
    <div className="center-pad" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label ?? t('common.loading')}</span>
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-wrap" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${95 - i * 12}%` }} />)}
    </div>
  );
}

export function Card({ children, className = '', title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ icon = '📭', title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <p className="empty-title">{title}</p>
      {hint && <p className="muted">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useT();
  return (
    <div className="error-box" role="alert">
      <span>{message}</span>
      {onRetry && <Button variant="secondary" onClick={onRetry}>{t('common.retry')}</Button>}
    </div>
  );
}

type FieldProps = { label: string; error?: string | null; hint?: string };

export function Field({ label, error, hint, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} {...rest} />
      {hint && !error && <p id={`${id}-h`} className="hint">{hint}</p>}
      {error && <p id={`${id}-e`} className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function TextArea({ label, error, hint, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : undefined} {...rest} />
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p id={`${id}-e`} className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function Select({ label, error, hint, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} aria-invalid={error ? true : undefined} {...rest}>{children}</select>
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useT();
  const tid = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusable = el?.querySelector<HTMLElement>('input,select,textarea,button:not(.modal-close)');
    (focusable ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea')];
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open'); prev?.focus(); };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={tid} ref={ref} tabIndex={-1}>
        <header className="modal-head">
          <h2 id={tid}>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0] ?? '').join('').toUpperCase() || '?';
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return url ? (
    <img src={url} alt="" className="avatar" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="avatar" aria-hidden="true" style={{ width: size, height: size, background: `hsl(${hue} 55% 40%)`, fontSize: size * 0.4 }}>{initials}</span>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'info'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/** Signed amount: green when the member should receive, red when they owe. */
export function NetAmount({ paise, big }: { paise: number; big?: boolean }) {
  const { money, t } = useT();
  const cls = paise > 0 ? 'pos' : paise < 0 ? 'neg' : 'zero';
  const label = paise > 0 ? t('bal.will_get') : paise < 0 ? t('bal.need_pay') : t('bal.settled');
  return (
    <span className={`net ${cls} ${big ? 'net-big' : ''}`}>
      <span className="net-label">{label}</span>
      {paise !== 0 && <strong className="net-amt">{money(Math.abs(paise))}</strong>}
    </span>
  );
}

export function ConfirmModal({ title, text, confirmLabel, danger, busy, disabled, onConfirm, onClose, children }: {
  title: string; text?: string; confirmLabel: string; danger?: boolean; busy?: boolean; disabled?: boolean; onConfirm: () => void; onClose: () => void; children?: ReactNode;
}) {
  const { t } = useT();
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
      <Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={disabled} onClick={onConfirm}>{confirmLabel}</Button>
    </>}>
      {text && <p>{text}</p>}
      {children}
    </Modal>
  );
}

export function copyText(text: string): Promise<boolean> {
  return navigator.clipboard?.writeText(text).then(() => true, () => false) ?? Promise.resolve(false);
}

/** Password input with a show/hide toggle and an optional strength meter. */
export function PasswordField({ label, error, hint, meter, value, ...rest }: FieldProps & { meter?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  const { t } = useT();
  const [show, setShow] = useState(false);
  const v = String(value ?? '');
  const score = !meter || !v ? 0 : passwordScore(v);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pw-wrap">
        <input id={id} type={show ? 'text' : 'password'} value={value} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} {...rest} />
        <button type="button" className="pw-toggle" aria-label={show ? t('auth.hide_pw') : t('auth.show_pw')} aria-pressed={show} onClick={() => setShow((x) => !x)}>
          {show
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A10.5 10.5 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2.1-2.7 3.4M6.5 7.6C4.6 8.9 3.3 10.7 2.5 12c1 1.8 4.5 6 9.5 6 1.4 0 2.7-.3 3.8-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 12C3.5 10.2 7 6 12 6s8.5 4.2 9.5 6c-1 1.8-4.5 6-9.5 6s-8.5-4.2-9.5-6z" /><circle cx="12" cy="12" r="3" /></svg>}
        </button>
      </div>
      {meter && v && (
        <div className="pw-meter" data-testid="pw-strength" data-score={score} role="status" aria-label={`${t('auth.str_label')}: ${t(`auth.str_${score}`)}`}>
          <span className="bars" aria-hidden="true">{[1, 2, 3, 4].map((n) => <i key={n} className={n <= score ? `on s${score}` : ''} />)}</span>
          <span className="lbl">{t(`auth.str_${score}`)}</span>
        </div>
      )}
      {hint && !error && <p id={`${id}-h`} className="hint">{hint}</p>}
      {error && <p id={`${id}-e`} className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function passwordScore(pw: string): 1 | 2 | 3 | 4 {
  let n = 0;
  if (pw.length >= 8) n++;
  if (pw.length >= 12) n++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) n++;
  else if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) n += 0.5;
  return Math.max(1, Math.min(4, Math.floor(n))) as 1 | 2 | 3 | 4;
}
