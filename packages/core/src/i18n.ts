import type { Lang } from './types';

export type Entry = { en: string; hi: string };
export type Dict = Record<string, Entry>;

export type Translator = (key: string, params?: Record<string, string | number>) => string;

export function createTranslator(dict: Dict, lang: Lang): Translator {
  return (key, params) => {
    const e = dict[key];
    let s = e ? e[lang] || e.en : key;
    if (params) s = s.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
    return s;
  };
}

export const hasKey = (dict: Dict, key: string) => key in dict;

export function detectLang(navLang: string | undefined): Lang {
  return navLang?.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}
