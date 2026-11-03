import { useT } from '../lib/i18n';
import { PlainShell } from '../components/shell';
import { useAuth } from '../lib/auth';
import { Link } from '../lib/router';
import { Logo } from '../components/ui';
import { SUPPORT_EMAIL, OPERATOR } from '../lib/supabase';
import { LEGAL, LEGAL_UPDATED } from './legalText';

function fill(text: string, lang: 'en' | 'hi'): string {
  const email = SUPPORT_EMAIL || (lang === 'hi' ? 'सेवा चलाने वाले से संपर्क करें' : 'the contact address shown in the app');
  const grievance = OPERATOR.grievance ? (lang === 'hi' ? `शिकायत अधिकारी: ${OPERATOR.grievance}।` : `Grievance Officer: ${OPERATOR.grievance}.`) : '';
  return text
    .replaceAll('{company}', OPERATOR.name)
    .replaceAll('{email}', email)
    .replaceAll('{city}', OPERATOR.jurisdiction || (lang === 'hi' ? 'हमारे पंजीकृत कार्यालय वाले शहर' : 'the city of our registered office'))
    .replaceAll('{grievance}', grievance)
    .trim();
}

function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const { t, lang, setLang } = useT();
  const { status } = useAuth();
  const doc = LEGAL[kind][lang];
  const other = kind === 'privacy' ? 'terms' : 'privacy';
  const go = (id: string) => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const body = (
    <article className="legal-doc">
      <header className="legal-head">
        <h1>{t(kind === 'privacy' ? 'legal.privacy' : 'legal.terms')}</h1>
        <p className="muted small" data-testid="legal-updated">{t('legal.updated', { date: LEGAL_UPDATED[lang] })}</p>
        <p className="legal-intro">{fill(doc.intro, lang)}</p>
        <p className="muted small">{t('legal.operator')}: <strong>{OPERATOR.name}</strong>{OPERATOR.address ? ` · ${OPERATOR.address}` : ''}</p>
      </header>
      <div className="legal-cols">
        <nav className="legal-toc" aria-label={t('legal.on_this_page')}>
          <p className="legal-toc-title">{t('legal.on_this_page')}</p>
          <ol>{doc.sections.map((s) => <li key={s.id}><button type="button" onClick={() => go(s.id)}>{s.h.replace(/^\d+\.\s*/, '')}</button></li>)}</ol>
        </nav>
        <div className="legal-body">
          {doc.sections.map((s) => (
            <section key={s.id} id={`sec-${s.id}`}>
              <h2>{s.h}</h2>
              {s.p?.map((x) => <p key={x}>{fill(x, lang)}</p>)}
              {s.list && <ul>{s.list.map((x) => <li key={x}>{fill(x, lang)}</li>)}</ul>}
              {s.after?.map((x) => <p key={x}>{fill(x, lang)}</p>)}
            </section>
          ))}
          <p className="legal-end muted small">
            {t('legal.also_read')}: <Link to={`/${other}`}>{t(other === 'privacy' ? 'legal.privacy' : 'legal.terms')}</Link>
            {' · '}<button type="button" className="linklike no-print" onClick={() => window.print()}>{t('legal.print')}</button>
          </p>
        </div>
      </div>
    </article>
  );
  if (status === 'in') return <PlainShell>{body}</PlainShell>;
  return (
    <div className="legal-wrap">
      <header className="legal-top">
        <Link to="/login" className="brand"><Logo size={32} /><span className="brand-name">Khatafy</span></Link>
        <div className="lang-toggle" role="group" aria-label={t('common.language')}>
          <button className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
          <button className={lang === 'hi' ? 'on' : ''} aria-pressed={lang === 'hi'} onClick={() => setLang('hi')}>हिं</button>
        </div>
      </header>
      <main id="main" className="legal-main">
        {body}
        <p className="auth-links"><Link to="/login">{t('auth.back_login')}</Link></p>
      </main>
      <footer className="legal-foot muted small">© {new Date().getFullYear()} {OPERATOR.name}. {t('legal.all_rights')}</footer>
    </div>
  );
}
export const PrivacyPage = () => <LegalPage kind="privacy" />;
export const TermsPage = () => <LegalPage kind="terms" />;
