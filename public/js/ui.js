import { appPath } from './base.js';
import { icon, CATEGORY_ICON } from './icons.js';
import { t, th, getLang, num, locale } from './i18n.js';
import { errText } from './api.js';
import { cityLabel } from './state.js';

// ───────── Мәтінді қауіпсіз шығару ─────────
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Қолданушы жазған мәтін: автордың тілі белгіленеді, интерфейс тілі оны аудармайды. */
export function ugc(text, lang = null, tag = 'span') {
  return `<${tag} data-ugc${lang ? ` lang="${esc(lang)}"` : ''}>${esc(text)}</${tag}>`;
}
/** Мәтін интерфейс тілінен басқа тілде жазылса — кішкентай түсініктеме */
export function originalNote(lang) {
  if (!lang || lang === getLang()) return '';
  return `<span class="orig-note">${icon('globe')}${esc(t('ugc.original', { lang: t(`langName.${lang}`) }))}</span>`;
}

// ───────── Мәртебелер мен атаулар ─────────
const sm = (name) => icon(name).replace('<svg class=""', '<svg class="ico-sm"');

export function statusBadge(s) {
  return `<span class="badge badge-${esc(s)}"><span class="dot"></span>${esc(t(`status.${s}`))}</span>`;
}
export function moderationBadge(m) {
  if (m === 'approved') return '';
  return `<span class="badge badge-${esc(m)}">${esc(t(`moderation.${m}`))}</span>`;
}
/** Жарияланбаған өтініште орындалу мәртебесі көрсетілмейді (шатастырмау үшін) */
export function stateBadges(r) {
  return `${r.moderation_status === 'approved' || r.status === 'cancelled' ? statusBadge(r.status) : ''}${moderationBadge(r.moderation_status || 'approved')}`;
}
export function urgencyBadge(u) {
  if (!u || u === 'normal') return '';
  return `<span class="badge badge-${esc(u)}">${u === 'high' ? sm('alert') : ''}${esc(t(`urgency.${u}`))}</span>`;
}
export function catLabel(code, short = false) {
  return t(`${short ? 'catShort' : 'cat'}.${code}`);
}
export function catBadge(r, { short = false } = {}) {
  return `<span class="badge badge-cat" style="--cat:${esc(r.category_color)}">${sm(CATEGORY_ICON[r.category_code] || 'heart')}${esc(catLabel(r.category_code, short))}</span>`;
}
export const demoBadge = (r) => (r.is_demo ? `<span class="badge badge-demo" title="${esc(t('demo.hint'))}">${esc(t('demo.badge'))}</span>` : '');
export function disasterBadge(r) {
  if (r.direction !== 'disaster') return '';
  return `<span class="badge badge-disaster">${sm('alert')}${esc(r.disaster_type_code ? t(`dtype.${r.disaster_type_code}`) : t('dir.disaster'))}</span>`;
}
export function verificationBadge(v) {
  return v === 'verified'
    ? `<span class="badge badge-verified">${sm('shield')}${esc(t('verify.verified'))}</span>`
    : `<span class="badge badge-unverified">${sm('info')}${esc(t('verify.unverified'))}</span>`;
}
export function activityBadge(a) {
  return `<span class="badge badge-act-${esc(a)}"><span class="dot"></span>${esc(t(`activity.${a}`))}</span>`;
}

// ───────── Күн мен уақыт (Қазақстан уақыты, UTC+5) ─────────
function kz(d) { return new Date(new Date(d).getTime() + 5 * 3600e3); }
const pad = (n) => String(n).padStart(2, '0');

export function fmtDate(d, { time = true, weekday = false } = {}) {
  if (!d) return '';
  const k = kz(d);
  const months = t('date.months');
  const days = t('date.days');
  const lang = getLang();
  const day = k.getUTCDate();
  const month = months[k.getUTCMonth()];
  let s = lang === 'en' ? `${day} ${month}` : `${day} ${month}`;
  if (k.getUTCFullYear() !== kz(Date.now()).getUTCFullYear()) s += ` ${k.getUTCFullYear()}${lang === 'kk' ? ' ж.' : lang === 'ru' ? ' г.' : ''}`;
  if (weekday) s = `${days[k.getUTCDay()]}, ${s}`;
  if (time) s += `, ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
  return s;
}
export function fmtTime(d) {
  const k = kz(d);
  return `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}
export function timeAgo(d) {
  if (!d) return '';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return t('time.justNow');
  if (s < 3600) return t('time.minutesAgo', { count: Math.floor(s / 60) });
  if (s < 86400) return t('time.hoursAgo', { count: Math.floor(s / 3600) });
  if (s < 86400 * 7) return t('time.daysAgo', { count: Math.floor(s / 86400) });
  return fmtDate(d, { time: false });
}
export function fmtNeeded(r) {
  if (!r.needed_from) return r.needed_note ? null : t('time.agree');
  let s = fmtDate(r.needed_from, { weekday: true });
  if (r.needed_to) s += `–${fmtTime(r.needed_to)}`;
  return s;
}
/** Уақыт мәтіні: needed_note — қолданушы мәтіні, сондықтан ugc ретінде белгіленеді */
export function neededHtml(r) {
  const v = fmtNeeded(r);
  return v === null ? ugc(r.needed_note, r.content_lang) : esc(v);
}
/** datetime-local мәнін Қазақстан уақыты ретінде ISO-ға айналдыру */
export function localInputToIso(v) { return v ? `${v}:00+05:00` : null; }
export function isoToLocalInput(d) {
  if (!d) return '';
  const k = kz(d);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}T${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}
export const fmtNum = (n) => num(n);
export const fmtKm = (km) => num(km, { maximumFractionDigits: 1 });
export const fmtDecimal = (n) => num(n, { maximumFractionDigits: 1 });
export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}
const AV_COLORS = ['#2457F5', '#FF7856', '#16A34A', '#7C5CF2', '#0EA5A4', '#E0A100'];
export function avatar(name, size = '') {
  const c = AV_COLORS[[...String(name)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV_COLORS.length];
  return `<span class="avatar ${size}" style="background:${c}" aria-hidden="true" data-ugc>${esc(initials(name))}</span>`;
}
export { cityLabel, locale };

// ───────── Күйлер ─────────
export function loadingState(text = null) {
  return `<div class="state" role="status" aria-live="polite"><div class="spinner"></div><p>${esc(text || t('common.loading'))}</p></div>`;
}
export function skeletonCards(n = 3) {
  return Array.from({ length: n }, () => '<div class="skeleton skel-card" aria-hidden="true"></div>').join('');
}
export function emptyState({ title, text = '', action = '', ico = 'inbox' }) {
  return `<div class="state"><div class="state-icon">${icon(ico)}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}
export function errorState(err, { retry = true } = {}) {
  const locked = err?.status === 401 || err?.status === 403;
  const key = err?.status === 404 ? 'notFound' : err?.status === 401 ? 'loginNeeded' : err?.status === 403 ? 'noAccess' : 'error';
  const action = err?.status === 401
    ? `<a class="btn btn-primary" href="/login?next=${encodeURIComponent(appPath() + location.search)}" data-link>${esc(t('nav.login'))}</a>`
    : retry && !locked && err?.status !== 404 ? `<button class="btn" type="button" data-retry>${icon('refresh')}${esc(t('common.retry'))}</button>` : '';
  return `<div class="state ${locked ? 'is-locked' : 'is-error'}" role="alert"><div class="state-icon">${icon(locked ? 'lock' : 'alert')}</div><h3>${esc(t(`state.${key}`))}</h3><p>${esc(err?.serverDown ? t('errors.SERVER_DOWN') : errText(err))}</p>${action}</div>`;
}

// ───────── Тосттар ─────────
export function toast(message, { type = 'info', title = '', link = null, timeout = 4500 } = {}) {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const el = document.createElement('div');
  el.className = `toast is-${type}`;
  el.innerHTML = `${icon(type === 'success' ? 'checkCircle' : type === 'error' ? 'alert' : 'bell')}<div>${title ? `<strong>${esc(title)}</strong>` : ''}${esc(message)}${link ? ` <a href="${esc(link.href)}" data-link>${esc(link.text)}</a>` : ''}</div>`;
  box.append(el);
  setTimeout(() => el.remove(), timeout);
}
export const toastError = (err) => toast(errText(err), { type: 'error' });

// ───────── Батырма күйі (қайта басудан қорғау) ─────────
export async function withBusy(btn, fn) {
  if (!btn || btn.classList.contains('is-busy')) return;
  btn.classList.add('is-busy');
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try {
    return await fn();
  } finally {
    btn.classList.remove('is-busy');
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

// ───────── Форма қателері ─────────
/** Өріс қатесінің мәтіні: сервердің кодынан немесе дайын мәтіннен */
export function fieldText(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const params = { ...(v.params || {}) };
  if (params.city_id) params.city = cityLabel(params.city_id);
  return t(`fieldErrors.${v.code}`, params);
}
export function clearErrors(form) {
  $$('.field.has-error', form).forEach((f) => f.classList.remove('has-error'));
  $$('.field-error', form).forEach((e) => { e.textContent = ''; });
  $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid'));
  $('.form-alert', form)?.replaceChildren();
}
/** err: ApiError немесе { message, fields: { өріс: 'мәтін' | {code, params} } } */
export function showErrors(form, err) {
  clearErrors(form);
  const fields = err?.fieldCodes || err?.fields || {};
  let first = null;
  for (const [name, val] of Object.entries(fields)) {
    const box = form.querySelector(`[data-field="${name}"]`);
    if (!box) continue;
    box.classList.add('has-error');
    const e = box.querySelector('.field-error');
    if (e) e.innerHTML = `${icon('alert').replace('<svg class=""', '<svg class="ico-err"')}<span>${esc(fieldText(val))}</span>`;
    const input = box.querySelector('input:not([type=hidden]), select, textarea');
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      if (!first) first = input;
    }
  }
  const alert = $('.form-alert', form);
  const msg = err?.code || err instanceof Error ? errText(err) : err?.message;
  if (alert) alert.innerHTML = `<div class="alert alert-error" role="alert">${icon('alert')}<div><strong>${esc(msg || t('errors.VALIDATION'))}</strong></div></div>`;
  (first || alert)?.focus?.();
  if (!first && alert) alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Қолданушы өрісті түзете бастағанда сол өрістің қатесін жасыру */
document.addEventListener('input', (e) => {
  const box = e.target.closest?.('.field.has-error');
  if (!box) return;
  box.classList.remove('has-error');
  e.target.removeAttribute('aria-invalid');
}, true);
document.addEventListener('change', (e) => {
  const box = e.target.closest?.('.field.has-error');
  if (box) box.classList.remove('has-error');
}, true);

export function field({ name, label, required = false, hint = '', control, span = false }) {
  return `<div class="field ${span ? 'span-2' : ''}" data-field="${name}">
    <label for="f-${name}" class="${required ? 'req' : ''}">${esc(label)}</label>
    ${control}
    ${hint ? `<span class="hint" id="h-${name}">${esc(hint)}</span>` : ''}
    <span class="field-error" id="e-${name}" aria-live="polite"></span>
  </div>`;
}
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi) {
        out[el.name] ||= [];
        if (el.checked) out[el.name].push(el.value);
      } else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else if (el.tagName === 'SELECT' && el.multiple) {
      out[el.name] = [...el.selectedOptions].map((o) => o.value);
    } else if (el.type !== 'file' && el.type !== 'submit' && el.type !== 'button') out[el.name] = el.value;
  }
  return out;
}

// ───────── Диалогтар (Escape жабады, фокус бастапқы батырмаға қайтады) ─────────
export function openDialog({ title, body, actions = [], className = '', onOpen }) {
  const opener = document.activeElement;
  const dlg = document.createElement('dialog');
  dlg.className = `dlg ${className}`;
  dlg.setAttribute('aria-labelledby', 'dlg-title');
  dlg.innerHTML = `<div class="dlg-head"><h2 id="dlg-title">${esc(title)}</h2>
      <button class="btn btn-ghost btn-icon" type="button" data-close aria-label="${esc(t('common.close'))}">${icon('x')}</button></div>
    <div class="dlg-body">${body}</div>
    ${actions.length ? `<div class="dlg-foot">${actions.map((a, i) => `<button type="button" class="btn ${a.cls || ''}" data-act="${i}">${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}`;
  document.body.append(dlg);
  const close = (val) => {
    if (dlg.open) dlg.close(val ?? '');
  };
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (opener && document.contains(opener)) opener.focus();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
    if (e.target.closest('[data-close]')) close();
  });
  actions.forEach((a, i) => {
    const b = dlg.querySelector(`[data-act="${i}"]`);
    b.addEventListener('click', async () => {
      if (!a.onClick) return close();
      await withBusy(b, () => a.onClick({ close, dlg, button: b }));
    });
  });
  dlg.showModal();
  onOpen?.(dlg);
  return { dlg, close };
}
/** Тіл ауыстырғанда ашық диалогтарды жабу */
export function closeAllDialogs() {
  $$('dialog.dlg[open]').forEach((d) => d.close());
}

export function confirmDialog({ title, text, okLabel = null, okCls = 'btn-primary', onConfirm }) {
  return openDialog({
    title,
    body: `<p class="muted">${esc(text)}</p><div class="form-alert" tabindex="-1" style="margin-top:12px"></div>`,
    actions: [
      { label: t('common.cancel'), cls: 'btn-ghost' },
      { label: okLabel || t('common.confirm'), cls: okCls, onClick: async ({ close, dlg }) => {
        try {
          await onConfirm();
          close('ok');
        } catch (err) {
          dlg.querySelector('.form-alert').innerHTML = `<div class="alert alert-error" role="alert">${icon('alert')}<div>${esc(errText(err))}</div></div>`;
        }
      } },
    ],
  });
}

/** Себеп/түсініктеме сұрайтын диалог */
export function reasonDialog({ title, text = '', label = null, placeholder = '', okLabel = null, okCls = 'btn-primary', required = true, min = 5, extra = '', fieldName = 'reason', onSubmit }) {
  const { dlg } = openDialog({
    title,
    body: `<form class="stack" novalidate>
      ${text ? `<p class="muted">${esc(text)}</p>` : ''}
      ${extra}
      ${field({ name: fieldName, label: label || t('common.reason'), required, control: `<textarea class="textarea" id="f-${fieldName}" name="reason" maxlength="600" placeholder="${esc(placeholder)}" aria-describedby="e-${fieldName}"></textarea>` })}
      <div class="form-alert" tabindex="-1"></div></form>`,
    actions: [
      { label: t('common.cancel'), cls: 'btn-ghost' },
      { label: okLabel || t('common.send'), cls: okCls, onClick: async ({ close, dlg: d }) => {
        const form = d.querySelector('form');
        const reason = form.reason.value.trim();
        if (required && reason.length < min) {
          showErrors(form, { message: t('errors.VALIDATION'), fields: { [fieldName]: { code: reason ? 'MIN_LENGTH' : 'REQUIRED', params: { min } } } });
          return;
        }
        try {
          await onSubmit(reason, form);
          close('ok');
        } catch (err) {
          showErrors(form, err);
        }
      } },
    ],
  });
  setTimeout(() => dlg.querySelector('textarea')?.focus(), 30);
  dlg.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
  return dlg;
}
export { t, th, errText };
