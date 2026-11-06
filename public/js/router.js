import { state, cityParam, on } from './state.js';
import { errorState } from './ui.js';
import { BASE, STATIC, appPath, toUrl, asset } from './base.js';

const routes = [];
export function route(pattern, load, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '/?$');
  routes.push({ re, keys, load, opts });
}

let cleanup = [];
let current = null;
export const hooks = { before: null };
const main = () => document.getElementById('main');

/** Ішкі сілтемеге таңдалған қаланы қосады — қала URL-да сақталады. */
export function withCity(href) {
  const u = new URL(href, location.origin);
  const p = appPath(u.pathname);
  if (u.origin !== location.origin || p.startsWith('/api')) return href;
  if (!u.searchParams.has('city')) u.searchParams.set('city', cityParam());
  return toUrl(p) + u.search + u.hash;
}

export function navigate(href, { replace = false } = {}) {
  const target = withCity(href);
  if (replace) history.replaceState({}, '', target);
  else history.pushState({}, '', target);
  render();
}

/** Бет модулін жүктеу: сәтсіз болса, сервердің қосулы екенін тексеріп, бір рет қайталайды. */
async function loadModule(r) {
  try {
    return await r.load();
  } catch (err) {
    let alive = false;
    if (STATIC) alive = true;
    else try { alive = (await fetch(asset('/api/health'), { cache: 'no-store' })).ok; } catch { alive = false; }
    if (!alive) {
      const e = new Error('server down');
      e.serverDown = true;
      throw e;
    }
    // Сервер қосулы: ескі кэш немесе уақытша үзіліс — бетті толық қайта жүктеу
    if (!sessionStorage.getItem('qm_reloaded')) {
      sessionStorage.setItem('qm_reloaded', '1');
      location.reload();
      return new Promise(() => {});
    }
    throw err;
  }
}

// ───── Формадағы мәндерді сақтау (тіл ауыстырғанда енгізілген деректер жоғалмауы үшін) ─────
export function captureForms(root = main()) {
  const out = [];
  root.querySelectorAll('input, select, textarea').forEach((el) => {
    if (el.type === 'file' || el.type === 'submit' || el.type === 'button' || el.closest('dialog')) return;
    const key = el.id || (el.name ? `${el.name}|${el.type === 'checkbox' || el.type === 'radio' ? el.value : ''}` : null);
    if (!key) return;
    out.push({ key, value: el.value, checked: el.checked, multi: el.tagName === 'SELECT' && el.multiple ? [...el.selectedOptions].map((o) => o.value) : null });
  });
  return out;
}
function restoreForms(root, snap) {
  const byKey = new Map(snap.map((x) => [x.key, x]));
  root.querySelectorAll('input, select, textarea').forEach((el) => {
    const key = el.id || (el.name ? `${el.name}|${el.type === 'checkbox' || el.type === 'radio' ? el.value : ''}` : null);
    const v = key && byKey.get(key);
    if (!v || el.type === 'file') return;
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = v.checked;
    else if (v.multi) [...el.options].forEach((o) => { o.selected = v.multi.includes(o.value); });
    else el.value = v.value;
  });
}

export async function render({ restore = null, keepScroll = false } = {}) {
  const y = window.scrollY;
  cleanup.forEach((fn) => { try { fn(); } catch { /* */ } });
  cleanup = [];
  hooks.before?.();
  const path = appPath();
  let match = null;
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      match = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, Number(m[i + 1])])) };
      break;
    }
  }
  const root = main();
  root.innerHTML = '';
  root.className = '';
  document.body.dataset.page = '';
  if (!keepScroll) window.scrollTo({ top: 0, behavior: 'instant' });
  if (!match) {
    root.innerHTML = `<div class="container">${errorState({ status: 404, code: 'PAGE_NOT_FOUND' }, { retry: false })}</div>`;
    document.dispatchEvent(new CustomEvent('routechange'));
    return;
  }
  const { r, params } = match;
  if (r.opts.auth && !state.user) {
    navigate(`/login?next=${encodeURIComponent(path + location.search)}`, { replace: true });
    return;
  }
  current = r;
  document.body.dataset.page = r.opts.name || '';
  const ctx = {
    root,
    params,
    query: new URLSearchParams(location.search),
    restoring: !!restore,
    onCleanup: (fn) => cleanup.push(fn),
    on: (name, fn) => cleanup.push(on(name, fn)),
  };
  try {
    const mod = await loadModule(r);
    try { sessionStorage.removeItem('qm_reloaded'); } catch { /* */ }
    if (current !== r) return;
    await mod.default(ctx);
    if (restore) {
      restoreForms(root, restore);
      document.dispatchEvent(new CustomEvent('qm:restored'));
    }
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="container">${errorState(err)}</div>`;
    root.querySelector('[data-retry]')?.addEventListener('click', () => render());
  }
  if (keepScroll) window.scrollTo({ top: y, behavior: 'instant' });
  else root.focus?.({ preventScroll: true });
  document.dispatchEvent(new CustomEvent('routechange'));
}

export function startRouter() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download') || a.dataset.external !== undefined) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || appPath(u.pathname).startsWith('/api')) return;
    if (BASE && !(u.pathname === BASE || u.pathname.startsWith(BASE + '/')) && !a.getAttribute('href').startsWith('/')) return;
    e.preventDefault();
    if (u.pathname === location.pathname && u.hash && u.search === location.search) {
      document.querySelector(u.hash)?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    navigate(u.pathname + u.search + u.hash);
  });
  window.addEventListener('popstate', () => render());
}
