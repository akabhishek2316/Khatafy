import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { isEmail, passwordProblem, KhError } from '@khatafy/core';
import { Link, navigate, useLocation } from '../lib/router';
import { useAuth } from '../lib/auth';
import { startCooldown, useCooldown } from '../lib/cooldown';
import { useT } from '../lib/i18n';
import { Button, Field, GoogleIcon, Logo, PasswordField } from '../components/ui';
import { GOOGLE_ENABLED, OPERATOR } from '../lib/supabase';

function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { lang, setLang, t } = useT();
  const feats = [['1', '💰'], ['2', '🧾'], ['3', '🔒']] as const;
  return (
    <div className="auth2">
      <aside className="auth2-brand" aria-hidden="true">
        <div className="auth2-brand-in">
          <span className="brand-lockup"><Logo size={44} /><span>Khatafy</span></span>
          <h1>{t('auth.hero_title')}</h1>
          <p className="auth2-sub">{t('auth.hero_sub')}</p>
          <ul className="auth2-feats">
            {feats.map(([n, ic]) => (
              <li key={n}><span className="ic">{ic}</span><span><strong>{t(`auth.feat${n}_t`)}</strong><small>{t(`auth.feat${n}_d`)}</small></span></li>
            ))}
          </ul>
          <div className="auth2-card" role="presentation">
            <div className="row"><span>Flat 402 · Groceries</span><b>₹1,240</b></div>
            <div className="row dim"><span>Asha paid · split 4 ways</span><span>₹310 each</span></div>
            <div className="row ok"><span>You get back</span><b>₹930</b></div>
          </div>
        </div>
      </aside>
      <main className="auth2-main" id="main">
        <div className="auth2-bar">
          <span className="brand"><Logo size={32} /><span className="brand-name">Khatafy</span></span>
          <div className="lang-toggle" role="group" aria-label={t('common.language')}>
            <button className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
            <button className={lang === 'hi' ? 'on' : ''} aria-pressed={lang === 'hi'} onClick={() => setLang('hi')}>हिं</button>
          </div>
        </div>
        <div className="auth2-form">
          <h2>{title}</h2>
          {subtitle && <p className="muted auth2-subtitle">{subtitle}</p>}
          {children}
        </div>
        <footer className="auth2-foot">
          <p className="secure"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg> {t('auth.secure_note')}</p>
          <p className="legal-links"><Link to="/privacy">{t('legal.privacy')}</Link> · <Link to="/terms">{t('legal.terms')}</Link> · © {new Date().getFullYear()} {OPERATOR.name}</p>
        </footer>
      </main>
    </div>
  );
}

function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useT();
  return <button type="button" className="btn-google" onClick={onClick} disabled={disabled} data-testid="google-btn"><GoogleIcon /> <span>{t('auth.google')}</span></button>;
}
function OrDivider({ text }: { text: string }) { return <div className="or-divider" role="separator"><span>{text}</span></div>; }

function afterLoginPath(): string {
  const next = sessionStorage.getItem('kh.next');
  if (next && next.startsWith('/') && !next.startsWith('//')) { sessionStorage.removeItem('kh.next'); return next; }
  return '/groups';
}

export function LoginPage() {
  const { t, errorText } = useT();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const cd = useCooldown(email);
  const [info, setInfo] = useState<string | null>(sessionStorage.getItem('kh.expired') ? t('auth.session_expired') : null);
  useEffect(() => { sessionStorage.removeItem('kh.expired'); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null); setUnconfirmed(false);
    if (!isEmail(email)) return setErr(t('err.EMAIL_INVALID'));
    if (!pw) return setErr(t('auth.password_required'));
    setBusy(true);
    try { await auth.signIn(email, pw); navigate(afterLoginPath(), { replace: true }); }
    catch (x) { setErr(errorText(x)); setUnconfirmed(x instanceof KhError && x.code === 'AUTH_EMAIL_NOT_CONFIRMED'); }
    finally { setBusy(false); }
  };
  return (
    <AuthFrame title={t('auth.login_title')} subtitle={t('auth.login_sub')}>
      {info && <div className="banner banner-info" role="status">{info}</div>}
      {GOOGLE_ENABLED && <><GoogleButton onClick={() => auth.signInWithGoogle().catch((x) => setErr(errorText(x)))} /><OrDivider text={t('auth.or_email')} /></>}
      <form onSubmit={submit} noValidate>
        <Field label={t('auth.email')} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label={t('auth.password')} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <p className="forgot-row"><Link to="/forgot-password">{t('auth.forgot')}</Link></p>
        {err && <p className="field-error" role="alert">{err}</p>}
        {unconfirmed && <Button type="button" variant="secondary" disabled={cd > 0} onClick={async () => { try { await auth.resendVerification(email); startCooldown(email); setInfo(t('auth.verify_resent')); } catch (x) { setErr(errorText(x)); } }}>{cd > 0 ? t('auth.resend_in', { s: cd }) : t('auth.resend')}</Button>}
        <Button type="submit" loading={busy} className="btn-block">{t('auth.login')}</Button>
      </form>
      {GOOGLE_ENABLED && <p className="muted small center-text">{t('auth.google_note')}</p>}
      <p className="auth-links">{t('auth.no_account')} <Link to="/register">{t('auth.register')}</Link></p>
    </AuthFrame>
  );
}

export function RegisterPage() {
  const { t, errorText } = useT();
  const auth = useAuth();
  const [f, setF] = useState({ name: '', email: '', pw: '', pw2: '' });
  const [agree, setAgree] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const cd = useCooldown(sent);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.name.trim()) er.name = t('err.NAME_REQUIRED');
    if (!isEmail(f.email)) er.email = t('err.EMAIL_INVALID');
    const pp = passwordProblem(f.pw);
    if (pp) er.pw = t(`err.${pp}`);
    if (f.pw !== f.pw2) er.pw2 = t('err.PASSWORD_MISMATCH');
    if (!agree) er.agree = t('auth.consent_required');
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const r = await auth.signUp(f.name, f.email, f.pw);
      if (r.needsVerification) { startCooldown(f.email); setSent(f.email); } else navigate(afterLoginPath(), { replace: true });
    } catch (x) { setErrs({ form: errorText(x) }); }
    finally { setBusy(false); }
  };

  if (sent) {
    return (
      <AuthFrame title={t('auth.verify_title')}>
        <div className="banner banner-info" role="status" data-testid="verify-notice">{t('auth.verify_text', { email: sent })}</div>
        {resent && <p className="muted" role="status">{t('auth.verify_resent')}</p>}
        <Button variant="secondary" disabled={cd > 0} onClick={async () => { try { await auth.resendVerification(sent); startCooldown(sent); setResent(true); } catch (x) { setErrs({ form: errorText(x) }); setSent(null); } }}>{cd > 0 ? t('auth.resend_in', { s: cd }) : t('auth.resend')}</Button>
        <p className="auth-links"><Link to="/login">{t('auth.back_login')}</Link></p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title={t('auth.register_title')} subtitle={t('auth.register_sub')}>
      {GOOGLE_ENABLED && <>
        <GoogleButton onClick={() => { if (!agree) return setErrs({ agree: t('auth.consent_required') }); auth.signInWithGoogle().catch((x) => setErrs({ form: errorText(x) })); }} />
        <OrDivider text={t('auth.or_register_email')} />
      </>}
      <form onSubmit={submit} noValidate>
        <Field label={t('auth.name')} autoComplete="name" value={f.name} onChange={set('name')} error={errs.name} />
        <Field label={t('auth.email')} type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set('email')} error={errs.email} />
        <PasswordField meter label={t('auth.password')} autoComplete="new-password" value={f.pw} onChange={set('pw')} error={errs.pw} hint={t('auth.password_hint')} />
        <PasswordField label={t('auth.password2')} autoComplete="new-password" value={f.pw2} onChange={set('pw2')} error={errs.pw2} />
        <div className="consent">
          <label className="check">
            <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); if (e.target.checked) setErrs((x) => { const { agree: _a, ...rest } = x; return rest; }); }} aria-invalid={errs.agree ? true : undefined} data-testid="consent" />
            <span>{t('auth.consent_pre')} <Link to="/terms" target="_blank" rel="noopener">{t('legal.terms')}</Link> {t('auth.consent_and')} <Link to="/privacy" target="_blank" rel="noopener">{t('legal.privacy')}</Link>{/^[.।]/.test(t('auth.consent_post')) ? '' : ' '}{t('auth.consent_post')}</span>
          </label>
          {errs.agree && <p className="field-error" role="alert">{errs.agree}</p>}
        </div>
        {errs.form && <p className="field-error" role="alert">{errs.form}</p>}
        <Button type="submit" loading={busy} className="btn-block">{t('auth.register')}</Button>
      </form>
      <p className="auth-links">{t('auth.have_account')} <Link to="/login">{t('auth.login')}</Link></p>
    </AuthFrame>
  );
}

export function ForgotPage() {
  const { t, errorText } = useT();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const cd = useCooldown(`reset:${email}`);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isEmail(email)) return setErr(t('err.EMAIL_INVALID'));
    setBusy(true); setErr(null);
    try { await auth.sendReset(email); startCooldown(`reset:${email}`); setDone(true); } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  return (
    <AuthFrame title={t('auth.forgot_title')} subtitle={t('auth.forgot_sub')}>
      {done ? <><div className="banner banner-info" role="status" data-testid="reset-sent">{t('auth.reset_sent')}</div><Button variant="secondary" disabled={cd > 0} loading={busy} onClick={() => submit({ preventDefault() {} } as FormEvent)}>{cd > 0 ? t('auth.resend_in', { s: cd }) : t('auth.send_reset')}</Button></> : (
        <form onSubmit={submit} noValidate>
          <Field label={t('auth.email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={err} />
          <Button type="submit" loading={busy} className="btn-block">{t('auth.send_reset')}</Button>
        </form>
      )}
      <p className="auth-links"><Link to="/login">{t('auth.back_login')}</Link></p>
    </AuthFrame>
  );
}

export function ResetPage() {
  const { t, errorText } = useT();
  const auth = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const pp = passwordProblem(pw);
    if (pp) return setErr(t(`err.${pp}`));
    if (pw !== pw2) return setErr(t('err.PASSWORD_MISMATCH'));
    setBusy(true); setErr(null);
    try { await auth.setPassword(pw); setDone(true); setTimeout(() => navigate('/groups', { replace: true }), 1200); }
    catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  if (auth.status === 'loading') return <AuthFrame title={t('auth.reset_title')}><p className="muted">{t('common.loading')}</p></AuthFrame>;
  if (auth.status === 'out') {
    return <AuthFrame title={t('auth.reset_title')}><div className="banner banner-warn" role="alert">{t('err.AUTH_LINK_EXPIRED')}</div><p className="auth-links"><Link to="/forgot-password">{t('auth.forgot_title')}</Link></p></AuthFrame>;
  }
  return (
    <AuthFrame title={t('auth.reset_title')}>
      {done ? <div className="banner banner-info" role="status">{t('auth.reset_done')}</div> : (
        <form onSubmit={submit} noValidate>
          <PasswordField meter label={t('auth.new_password')} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint={t('auth.password_hint')} />
          <PasswordField label={t('auth.password2')} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          {err && <p className="field-error" role="alert">{err}</p>}
          <Button type="submit" loading={busy} className="btn-block">{t('auth.save_password')}</Button>
        </form>
      )}
    </AuthFrame>
  );
}

/** Landing page for email-confirmation / OAuth redirects. supabase-js consumes the URL itself. */
export function CallbackPage() {
  const { t } = useT();
  const auth = useAuth();
  const loc = useLocation();
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const failed = hash.get('error') || loc.search.get('error');
  useEffect(() => {
    if (failed) return;
    if (auth.status === 'in') navigate(afterLoginPath(), { replace: true });
    if (auth.status === 'out') {
      const timer = setTimeout(() => navigate('/login', { replace: true }), 2500);
      return () => clearTimeout(timer);
    }
  }, [auth.status, failed]);
  return (
    <AuthFrame title={failed ? t('auth.link_failed') : t('auth.confirming')}>
      {failed ? <><div className="banner banner-warn" role="alert">{t('err.AUTH_LINK_EXPIRED')}</div><p className="auth-links"><Link to="/login">{t('auth.back_login')}</Link></p></> : <p className="muted">{t('common.loading')}</p>}
    </AuthFrame>
  );
}

export function SetupRequired() {
  return (
    <div className="auth-wrap setup"><main className="auth-card" id="main">
      <h2>Khatafy setup needed</h2>
      <p>Supabase is not configured. Create <code>apps/web/.env</code> from <code>.env.example</code> and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart. (README step 4.)</p>
      <p lang="hi">Supabase जुड़ा नहीं है। <code>apps/web/.env</code> फ़ाइल में <code>VITE_SUPABASE_URL</code> और <code>VITE_SUPABASE_ANON_KEY</code> भरें और दोबारा चलाएँ।</p>
    </main></div>
  );
}
