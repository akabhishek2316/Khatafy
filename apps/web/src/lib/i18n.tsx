import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createTranslator, detectLang, formatPaise, messages, hasKey, KhError, toKhError, type Lang, type Translator } from '@khatafy/core';

const STORAGE_KEY = 'kh.lang';

function initialLang(): Lang {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === 'en' || s === 'hi') return s;
  } catch { /* storage blocked */ }
  return detectLang(navigator.language);
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translator;
  money: (paise: number, opts?: { sign?: boolean }) => string;
  date: (iso: string, withTime?: boolean) => string;
  errorText: (e: unknown) => string;
}
const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const value = useMemo<I18nCtx>(() => {
    const t = createTranslator(messages, lang);
    const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
    return {
      lang, setLang, t,
      money: (p, o) => formatPaise(p, o),
      date: (iso, withTime) =>
        new Intl.DateTimeFormat(locale, withTime
          ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
          : { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)),
      errorText: (e) => {
        const err = e instanceof KhError ? e : toKhError(e);
        const key = `err.${err.code}`;
        return hasKey(messages, key) ? t(key) : t('err.UNKNOWN');
      },
    };
  }, [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('I18nProvider missing');
  return c;
}
