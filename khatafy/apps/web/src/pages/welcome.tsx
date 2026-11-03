import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { navigate } from '../lib/router';
import { Logo } from '../components/ui';

export const WELCOME_KEY = 'kh.welcomed';
export const hasSeenWelcome = () => { try { return localStorage.getItem(WELCOME_KEY) === '1'; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* ignore */ } };

export function WelcomePage() {
  const { t, lang, setLang } = useT();
  const [i, setI] = useState(0);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus(); }, [i]);
  const last = i === 2;
  const finish = (to: string) => { markSeen(); navigate(to, { replace: true }); };
  const n = i + 1;
  return (
    <div className="welcome">
      <div className="welcome-top">
        <button className="lang-pill" onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} aria-label={t('common.language')}>{lang === 'en' ? 'हिन्दी' : 'English'}</button>
      </div>
      {i === 0 && <div className="welcome-brand"><Logo size={72} /><div><div className="brand-name big">Khatafy</div><div className="welcome-slogan">{t('wel.slogan')}</div></div></div>}
      <h1 ref={head} tabIndex={-1} className="welcome-title">{t(`wel.s${n}.title`)}</h1>
      <p className="welcome-text">{t(`wel.s${n}.text`)}</p>
      <img className="welcome-img" src={`/welcome/w${n}.jpg`} alt="" width={475} height={i === 0 ? 330 : 400} />
      {i > 0 && <div className="welcome-note" role="note">{t(`wel.s${n}.note`)}</div>}
      <div className="dots" role="presentation">{[0, 1, 2].map((d) => <span key={d} className={d === i ? 'on' : ''} />)}</div>
      <div className="welcome-actions">
        {i > 0 && <button className="btn btn-secondary" onClick={() => setI(i - 1)}>← {t('wel.back')}</button>}
        <button className="btn btn-primary" onClick={() => (last ? finish('/register') : setI(i + 1))}>{last ? t('wel.start') : t('wel.next')} →</button>
      </div>
      {i === 0 && <button className="link-btn" onClick={() => finish('/login')}>{t('wel.skip')}</button>}
    </div>
  );
}
