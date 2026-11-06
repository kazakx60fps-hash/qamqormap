// Бірыңғай аударма жүйесі: kk (әдепкі), ru, en сөздіктері.
// Кілт табылмаса — қазақша нұсқа қолданылады; ол да болмаса — кілттің өзі көрсетіледі.
import kk from './i18n/kk.js';
import ru from './i18n/ru.js';
import en from './i18n/en.js';

const DICTS = { kk, ru, en };
export const DEFAULT_LANG = 'kk';
export const LANGS = [
  { code: 'kk', short: 'KK', native: 'Қазақша' },
  { code: 'ru', short: 'RU', native: 'Русский' },
  { code: 'en', short: 'EN', native: 'English' },
];
const LOCALES = { kk: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' };
const LS_KEY = 'qm_lang';

let current = DEFAULT_LANG;
const missing = new Set();

export const getLang = () => current;
export const locale = () => LOCALES[current];
export const isLang = (l) => Object.prototype.hasOwnProperty.call(DICTS, l);

export function setLangValue(l) {
  current = isLang(l) ? l : DEFAULT_LANG;
  document.documentElement.lang = current;
  try { localStorage.setItem(LS_KEY, current); } catch { /* жеке режим */ }
}

export function savedLang() {
  try {
    const v = localStorage.getItem(LS_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

function lookup(dict, key) {
  let v = dict;
  for (const part of key.split('.')) {
    if (v == null || typeof v !== 'object') return undefined;
    v = v[part];
  }
  return v;
}

function raw(key) {
  let v = lookup(DICTS[current], key);
  if (v === undefined && current !== DEFAULT_LANG) v = lookup(DICTS[DEFAULT_LANG], key);
  if (v === undefined && !missing.has(key)) {
    missing.add(key);
    console.warn('[i18n] кілт жоқ:', key);
  }
  return v;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function format(v, params, escapeParams, ugcKeys = []) {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') {
    // Көпше түр: { one, few, many, other }
    const n = Number(params.count ?? 0);
    const cat = new Intl.PluralRules(LOCALES[current]).select(n);
    v = v[cat] ?? v.other ?? '';
  }
  return String(v).replace(/\{(\w+)\}/g, (_, k) => {
    let p = params[k];
    if (typeof p === 'number' && (k === 'count' || k === 'km' || k === 'radius')) p = num(p, { maximumFractionDigits: 1 });
    if (!escapeParams) return p ?? '';
    return ugcKeys.includes(k) ? `<span data-ugc>${escape(p)}</span>` : escape(p);
  });
}

/** Мәтін (параметрлер өңделмейді) — textContent, title, toast үшін. */
export function t(key, params = {}) {
  const v = format(raw(key), params, false);
  return v === null ? key : v;
}

/** HTML үлгісіне қою үшін: сөздік мәтіні сенімді, параметрлер экрандалады; ugc тізіміндегі параметрлер қолданушы мәтіні ретінде белгіленеді. */
export function th(key, params = {}, { ugc = [] } = {}) {
  const v = format(raw(key), params, true, ugc);
  return v === null ? escape(key) : v;
}

export function has(key) {
  return lookup(DICTS[current], key) !== undefined || lookup(DICTS[DEFAULT_LANG], key) !== undefined;
}

export function num(n, opts) {
  return new Intl.NumberFormat(LOCALES[current], opts).format(n ?? 0);
}

/** Тексеру үшін: сөздік кілттерінің тізімі */
export function flatKeys(obj = DICTS.kk, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !('other' in v)) out.push(...flatKeys(v, key));
    else out.push(key);
  }
  return out;
}
export { DICTS };
