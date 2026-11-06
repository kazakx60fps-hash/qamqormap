// Бірыңғай аударма жүйесі (kk — әдепкі, ru, en).
// Негізі — сайттың сөздіктері (src/shared/i18n-*.js, `npm run sync` арқылы көшіріледі):
// статустар, санаттар, апат түрлері, қате кодтары және хабарламалар бір кілттермен аударылады.
// Мобильді экрандардың өз мәтіндері `m.*` аттар кеңістігінде (mobile-*.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import kkShared from '../shared/i18n-kk.js';
import ruShared from '../shared/i18n-ru.js';
import enShared from '../shared/i18n-en.js';
import kkM from './mobile-kk';
import ruM from './mobile-ru';
import enM from './mobile-en';

export type Lang = 'kk' | 'ru' | 'en';
export const LANGS: { code: Lang; short: string; native: string }[] = [
  { code: 'kk', short: 'KK', native: 'Қазақша' },
  { code: 'ru', short: 'RU', native: 'Русский' },
  { code: 'en', short: 'EN', native: 'English' },
];
export const DEFAULT_LANG: Lang = 'kk';
export const isLang = (v: unknown): v is Lang => v === 'kk' || v === 'ru' || v === 'en';

type Dict = Record<string, unknown>;
const DICTS: Record<Lang, Dict> = {
  kk: { ...(kkShared as Dict), m: kkM },
  ru: { ...(ruShared as Dict), m: ruM },
  en: { ...(enShared as Dict), m: enM },
};

const missing = new Set<string>();

function lookup(dict: Dict, key: string): unknown {
  let v: unknown = dict;
  for (const part of key.split('.')) {
    if (v == null || typeof v !== 'object') return undefined;
    v = (v as Dict)[part];
  }
  return v;
}

export function hasKey(key: string, lang: Lang = DEFAULT_LANG) {
  return lookup(DICTS[lang], key) !== undefined || lookup(DICTS.kk, key) !== undefined;
}

/** Көпше түр (Hermes-те Intl.PluralRules болмауы мүмкін, сондықтан ережелер қолмен) */
function pluralCat(lang: Lang, n: number): string {
  if (lang === 'ru') {
    const m10 = n % 10, m100 = n % 100;
    if (!Number.isInteger(n)) return 'other';
    if (m10 === 1 && m100 !== 11) return 'one';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
    return 'many';
  }
  return n === 1 ? 'one' : 'other';
}

export function formatNumber(n: number, lang: Lang, digits = 1) {
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/\.?0+$/, '');
  const [int, frac] = fixed.split('.');
  const sep = lang === 'en' ? ',' : ' ';
  const dec = lang === 'en' ? '.' : ',';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return frac ? `${grouped}${dec}${frac}` : grouped;
}

const ENTITIES: Record<string, string> = { '&copy;': '©', '&amp;': '&', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? e);

export type Params = Record<string, string | number | null | undefined>;

export function translate(lang: Lang, key: string, params: Params = {}): string {
  let v = lookup(DICTS[lang], key);
  if (v === undefined && lang !== DEFAULT_LANG) v = lookup(DICTS[DEFAULT_LANG], key);
  if (v === undefined) {
    if (!missing.has(key)) {
      missing.add(key);
      if (__DEV__) console.warn('[i18n] кілт жоқ:', key);
    }
    return key;
  }
  if (Array.isArray(v)) return v.join(', ');
  if (v && typeof v === 'object') {
    const o = v as Record<string, string>;
    const cat = pluralCat(lang, Number(params.count ?? 0));
    v = o[cat] ?? o.other ?? o.many ?? '';
  }
  const s = String(v).replace(/\{(\w+)\}/g, (_, k: string) => {
    const p = params[k];
    if (typeof p === 'number' && (k === 'count' || k === 'km' || k === 'radius')) return formatNumber(p, lang);
    return p == null ? '' : String(p);
  });
  return s.includes('<') || s.includes('&') ? stripHtml(s) : s;
}

export function translateArray(lang: Lang, key: string): string[] {
  const v = lookup(DICTS[lang], key) ?? lookup(DICTS.kk, key);
  return Array.isArray(v) ? (v as string[]) : [];
}

/** Тест/тексеру үшін: барлық кілттер тізімі */
export function flatKeys(lang: Lang): string[] {
  const out: string[] = [];
  const walk = (o: Dict, p: string) => {
    for (const [k, v] of Object.entries(o)) {
      const key = p ? `${p}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && !('other' in (v as Dict))) walk(v as Dict, key);
      else out.push(key);
    }
  };
  walk(DICTS[lang], '');
  return out;
}

const LS_KEY = 'qm_lang';

type Ctx = {
  lang: Lang;
  t: (key: string, params?: Params) => string;
  tArr: (key: string) => string[];
  setLang: (l: Lang) => void;
  ready: boolean;
};
const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(LS_KEY)
      .then((v) => { if (isLang(v)) setLangState(v); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(LS_KEY, l).catch(() => {});
  }, []);
  const value = useMemo<Ctx>(() => ({
    lang,
    t: (key, params) => translate(lang, key, params),
    tArr: (key) => translateArray(lang, key),
    setLang,
    ready,
  }), [lang, setLang, ready]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error('I18nProvider жоқ');
  return c;
}
