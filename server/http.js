// HTTP қателері мен серверлік тексеру көмекшілері.
// Әр қате тұрақты кодпен (code) және параметрлермен (params) қайтарылады; frontend оны таңдалған тілге аударады.
import { ERRORS, FIELDS, fill } from './messages.js';

/** fields: { өріс: 'CODE' | { code, params } } */
export class HttpError extends Error {
  constructor(status, code, { params = {}, fields = null } = {}) {
    super(fill(ERRORS[code] || code, params));
    this.status = status;
    this.code = code;
    this.params = params;
    this.fields = fields ? normalizeFields(fields) : null;
  }

  toJSON() {
    const out = { error: this.message, code: this.code, params: this.params };
    if (this.fields) {
      out.field_codes = this.fields;
      out.fields = Object.fromEntries(Object.entries(this.fields).map(([k, v]) => [k, fill(FIELDS[v.code] || v.code, v.params)]));
    }
    return out;
  }
}

function normalizeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' ? { code: v, params: {} } : { code: v.code, params: v.params || {} }]));
}

export const badRequest = (code = 'VALIDATION', fields = null, params = {}) => new HttpError(400, code, { fields, params });
export const unauthorized = (code = 'AUTH_REQUIRED', fields = null) => new HttpError(401, code, { fields });
export const forbidden = (code = 'FORBIDDEN', params = {}) => new HttpError(403, code, { params });
export const notFound = (code = 'NOT_FOUND') => new HttpError(404, code);
export const conflict = (code, params = {}) => new HttpError(409, code, { params });

/** async маршрут қателерін next()-ке жібереді */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Қарапайым валидатор: өріс қателерін (кодтарын) жинап, соңында бір 400 жауап береді.
 */
export class Validator {
  constructor(body) {
    this.body = body || {};
    this.errors = {};
    this.out = {};
  }

  fail(field, code, params = {}) {
    if (!this.errors[field]) this.errors[field] = { code, params };
    return this;
  }

  str(field, { min = 0, max = 1000, required = true } = {}) {
    const raw = this.body[field];
    const v = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim();
    if (!v) {
      if (required) this.fail(field, 'REQUIRED');
      this.out[field] = '';
      return this;
    }
    if (v.length < min) this.fail(field, 'MIN_LENGTH', { min });
    else if (v.length > max) this.fail(field, 'MAX_LENGTH', { max });
    this.out[field] = v;
    return this;
  }

  int(field, { required = true, min = -Infinity, max = Infinity } = {}) {
    const raw = this.body[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) this.fail(field, 'REQUIRED');
      this.out[field] = null;
      return this;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) this.fail(field, 'INVALID');
    this.out[field] = n;
    return this;
  }

  num(field, { required = true, min = -Infinity, max = Infinity } = {}) {
    const raw = this.body[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) this.fail(field, 'REQUIRED');
      this.out[field] = null;
      return this;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max) this.fail(field, 'INVALID');
    this.out[field] = n;
    return this;
  }

  oneOf(field, values, { required = true, def } = {}) {
    const v = this.body[field] ?? def;
    if (v === undefined || v === null || v === '') {
      if (required) this.fail(field, 'REQUIRED');
      this.out[field] = null;
      return this;
    }
    if (!values.includes(v)) this.fail(field, 'INVALID');
    this.out[field] = v;
    return this;
  }

  date(field, { required = false } = {}) {
    const raw = this.body[field];
    if (!raw) {
      if (required) this.fail(field, 'REQUIRED');
      this.out[field] = null;
      return this;
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) this.fail(field, 'INVALID_DATE');
    this.out[field] = d;
    return this;
  }

  url(field, { required = false, max = 300 } = {}) {
    const raw = String(this.body[field] ?? '').trim();
    if (!raw) {
      if (required) this.fail(field, 'REQUIRED');
      this.out[field] = '';
      return this;
    }
    let ok = false;
    try {
      const u = new URL(raw);
      ok = ['http:', 'https:'].includes(u.protocol);
    } catch { ok = false; }
    if (!ok) this.fail(field, 'INVALID_URL');
    else if (raw.length > max) this.fail(field, 'MAX_LENGTH', { max });
    this.out[field] = raw;
    return this;
  }

  phone(field, { required = true } = {}) {
    const raw = String(this.body[field] ?? '').trim();
    if (!raw) {
      if (required) this.fail(field, 'REQUIRED');
      this.out[field] = null;
      return this;
    }
    const digits = raw.replace(/\D/g, '');
    let norm = digits;
    if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) norm = '7' + digits.slice(1);
    else if (digits.length === 10) norm = '7' + digits;
    if (!/^7\d{10}$/.test(norm)) this.fail(field, 'INVALID_PHONE');
    this.out[field] = `+${norm.slice(0, 1)} ${norm.slice(1, 4)} ${norm.slice(4, 7)} ${norm.slice(7, 9)} ${norm.slice(9, 11)}`;
    return this;
  }

  check(cond, field, code, params) {
    if (!cond) this.fail(field, code, params);
    return this;
  }

  done() {
    if (Object.keys(this.errors).length) throw badRequest('VALIDATION', this.errors);
    return this.out;
  }
}

export function idParam(req, name = 'id') {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}

/** Ұзындығы min-нен кем себеп/түсініктеме үшін бірыңғай қате */
export function requireText(value, field, min = 5) {
  const v = String(value || '').trim();
  if (v.length < min) throw badRequest('VALIDATION', { [field]: { code: v ? 'MIN_LENGTH' : 'REQUIRED', params: { min } } });
  return v;
}
