import { route, startRouter, render, hooks, navigate, withCity } from './router.js';
import { state, loadSession, loadReference, resolveCityFromUrl, setCity, on, refreshCityCounts } from './state.js';
import { initLayout, renderHeader } from './layout.js';
import { connectRealtime } from './realtime.js';
import { onUnauthorized } from './api.js';
import { toast, errorState } from './ui.js';
import { setLangValue, savedLang, t } from './i18n.js';
import { initialLang } from './lang.js';
import { notifText, notifLink } from './notif.js';

route('/', () => import('./pages/home.js'), { name: 'home' });
route('/map', () => import('./pages/map.js'), { name: 'map' });
route('/incidents', () => import('./pages/incidents.js'), { name: 'incidents' });
route('/disasters', () => import('./pages/disasters.js'), { name: 'disasters' });
route('/events/new', () => import('./pages/event-form.js'), { name: 'event-form', auth: true });
route('/events/:id/edit', () => import('./pages/event-form.js'), { name: 'event-form', auth: true });
route('/events/:id', () => import('./pages/event-view.js'), { name: 'event' });
route('/requests/new', () => import('./pages/request-form.js'), { name: 'form', auth: true });
route('/requests/:id/edit', () => import('./pages/request-form.js'), { name: 'form', auth: true });
route('/requests/:id', () => import('./pages/request-view.js'), { name: 'request' });
route('/dashboard', () => import('./pages/dashboard.js'), { name: 'dashboard', auth: true });
route('/coordinator', () => import('./pages/coordinator.js'), { name: 'coordinator', auth: true });
route('/org', () => import('./pages/org.js'), { name: 'org', auth: true });
route('/login', () => import('./pages/auth.js'), { name: 'login' });
route('/register', () => import('./pages/auth.js'), { name: 'register' });
route('/about', () => import('./pages/about.js'), { name: 'about' });

async function boot() {
  // Сессия мен анықтамалықтар жүктелгенше гостьтің сақталған тілін қолданамыз
  setLangValue(savedLang() || 'kk');
  try {
    await Promise.all([loadReference(), loadSession()]);
  } catch (err) {
    document.getElementById('main').innerHTML = `<div class="container">${errorState(err)}</div>`;
    document.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
    return;
  }
  setLangValue(initialLang());
  setCity(resolveCityFromUrl(), { silent: true });
  // Артқа/алға өткенде URL-дағы қаланы күйге қайта енгізу
  hooks.before = () => {
    const id = resolveCityFromUrl();
    const urlHas = new URLSearchParams(location.search).has('city');
    if (id !== state.cityId) setCity(id);
    else if (!urlHas) setCity(id, { silent: true });
  };
  initLayout();
  startRouter();
  connectRealtime();
  onUnauthorized(() => {
    if (state.user) {
      state.user = null;
      renderHeader();
    }
  });
  on('notification', (n) => {
    const { title, body } = notifText(n);
    const href = notifLink(n);
    toast(body || '', { title, link: href ? { href: withCity(href), text: t('common.open') } : null });
  });
  on('request-changed', () => refreshCityCounts());
  window.addEventListener('focus', () => { if (state.user) loadSession().catch(() => {}); });
  await render();
}

boot();
export { navigate };
