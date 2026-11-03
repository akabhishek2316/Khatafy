import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'kh.theme';

export function getThemePref(): ThemePref {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark' || v === 'system') return v; } catch { /* storage blocked */ }
  return 'light'; // default look is the light, premium theme
}
const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export function applyTheme(pref: ThemePref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b0d1a' : '#4338ca');
}
export function setThemePref(pref: ThemePref) {
  try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
  applyTheme(pref);
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const on = () => { if (getThemePref() === 'system') applyTheme('system'); };
    mq?.addEventListener?.('change', on);
    return () => mq?.removeEventListener?.('change', on);
  }, []);
  const set = useCallback((p: ThemePref) => { setThemePref(p); setPref(p); }, []);
  return { pref, set, isDark: document.documentElement.dataset.theme === 'dark' };
}
