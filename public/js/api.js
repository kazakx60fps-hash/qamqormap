// Backend-пен байланыс: Fetch API + JSON. Деректер тек HTTP/REST API арқылы алынады.
// Сервер қателерді тұрақты кодпен (code, params, field_codes) қайтарады; мәтінді frontend таңдалған тілде құрастырады.
import { t, has } from './i18n.js';
import { STATIC, asset } from './base.js';

let csrfToken = null;
export function setCsrf(tok) { csrfToken = tok; }

export class ApiError extends Error {
  constructor(status, message, { code = null, params = {}, fields = null, fieldCodes = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.params = params || {};
    this.fields = fields || null;
    this.fieldCodes = fieldCodes || null;
  }
}

/** Қатенің мәтіні таңдалған тілде */
export function errText(err) {
  if (!err) return t('errors.UNKNOWN');
  if (err.code && has(`errors.${err.code}`)) return t(`errors.${err.code}`, { ...err.params, status: err.params?.status ? t(`status.${err.params.status}`) : '' });
  if (err.status === 0) return t('errors.NETWORK');
  if (err.name === 'TypeError' || /dynamically imported module|Failed to fetch/i.test(err.message || '')) return t('errors.NETWORK');
  return err.message || t('errors.UNKNOWN');
}

const listeners = new Set();
/** 401 келгенде (сессия бітсе) қолданба хабардар болады */
export function onUnauthorized(fn) { listeners.add(fn); }

export async function api(path, { method = 'GET', body, form, query, signal } = {}) {
  if (STATIC) {
    // GitHub Pages: сервер жоқ — алдын ала дайындалған оқу деректері (static-api.js)
    const { staticApi } = await import('./static-api.js');
    try {
      return await staticApi(path, { method, body, query });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (!err.code) console.error('[static-api]', err);
      throw new ApiError(err.status || 404, err.message, { code: err.code || 'NOT_FOUND' });
    }
  }
  let url = asset('/api' + path);
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    const s = qs.toString();
    if (s) url += (url.includes('?') ? '&' : '?') + s;
  }
  const headers = { Accept: 'application/json' };
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin', signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, t('errors.NETWORK'), { code: 'NETWORK' });
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!res.ok) {
    if (res.status === 401) listeners.forEach((fn) => fn());
    throw new ApiError(res.status, data?.error || `HTTP ${res.status}`, {
      code: data?.code || null, params: data?.params, fields: data?.fields, fieldCodes: data?.field_codes,
    });
  }
  return data;
}
