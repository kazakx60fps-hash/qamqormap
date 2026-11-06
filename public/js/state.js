import { api, setCsrf } from './api.js';
import { getLang, t } from './i18n.js';

// Қолданба күйі. Деректердің негізгі көзі — backend; мұнда тек ағымдағы сессия мен анықтамалықтар.
export const state = {
  user: null,
  unread: 0,
  cities: [],
  citiesById: new Map(),
  regions: [],
  regionsByCode: new Map(),
  categories: [],
  categoriesById: new Map(),
  categoriesByCode: new Map(),
  disasterTypes: [],
  cityId: null, // null = Бүкіл Қазақстан
  mapConfig: null,
};

const bus = new EventTarget();
export function on(name, fn) {
  const h = (e) => fn(e.detail);
  bus.addEventListener(name, h);
  return () => bus.removeEventListener(name, h);
}
export function emit(name, detail) { bus.dispatchEvent(new CustomEvent(name, { detail })); }

const LS_KEY = 'qm_city'; // тек интерфейс баптауы

export async function loadSession() {
  const me = await api('/auth/me');
  state.user = me.user;
  state.unread = me.unread || 0;
  setCsrf(me.csrfToken);
  emit('auth', state.user);
}
export function setSession({ user, csrfToken }) {
  state.user = user;
  setCsrf(csrfToken);
  emit('auth', user);
}
export function clearSession() {
  state.user = null;
  state.unread = 0;
  setCsrf(null);
  emit('auth', null);
}

function indexCities(items) {
  state.cities = items;
  state.citiesById = new Map(items.map((x) => [x.id, x]));
}

export async function loadReference() {
  const [c, k, m, rg, dt] = await Promise.all([
    api('/cities'), api('/categories'), api('/map-config').catch(() => null),
    api('/regions').catch(() => ({ items: [] })), api('/disaster-types').catch(() => ({ items: [] })),
  ]);
  indexCities(c.items);
  state.categories = k.items;
  state.categoriesById = new Map(k.items.map((x) => [x.id, x]));
  state.categoriesByCode = new Map(k.items.map((x) => [x.code, x]));
  state.mapConfig = m;
  state.regions = rg.items;
  state.regionsByCode = new Map(rg.items.map((x) => [x.code, x]));
  state.disasterTypes = dt.items;
  state.disasterGroups = dt.groups || [];
}
export async function refreshCityCounts() {
  try { indexCities((await api('/cities')).items); } catch { /* маңызды емес */ }
}

/** Қала атауы таңдалған тілде (id немесе қала нысаны бойынша) */
export function cityLabel(c) {
  const city = typeof c === 'object' && c ? c : state.citiesById.get(Number(c));
  if (!city) return '';
  const l = getLang();
  return (l === 'en' && city.name_en) || (l === 'ru' && city.name_ru) || city.name_kk;
}
export function regionLabel(code) {
  const r = state.regionsByCode.get(code);
  if (!r) return '';
  const l = getLang();
  return r[`name_${l}`] || r.name_kk;
}
export function cityRegionLabel(c) {
  const city = typeof c === 'object' && c ? c : state.citiesById.get(Number(c));
  return city ? regionLabel(city.region_code) || city.region_kk : '';
}

/** URL-дағы ?city= параметрі негізгі көз; болмаса соңғы таңдау немесе қолданушының қаласы. */
export function resolveCityFromUrl() {
  const p = new URLSearchParams(location.search).get('city');
  if (p === 'all') return null;
  if (p && state.citiesById.has(Number(p))) return Number(p);
  let saved = null;
  try { saved = localStorage.getItem(LS_KEY); } catch { /* жеке режим */ }
  if (saved === 'all') return null;
  if (saved && state.citiesById.has(Number(saved))) return Number(saved);
  if (state.user?.city_id) return state.user.city_id;
  return 1; // Астана
}

export function cityParam() { return state.cityId ? String(state.cityId) : 'all'; }
export function city() { return state.cityId ? state.citiesById.get(state.cityId) : null; }
export function cityName() { return city() ? cityLabel(city()) : t('city.all'); }

export function setCity(id, { silent = false } = {}) {
  state.cityId = id || null;
  try { localStorage.setItem(LS_KEY, cityParam()); } catch { /* жеке режим */ }
  const url = new URL(location.href);
  url.searchParams.set('city', cityParam());
  history.replaceState(history.state, '', url);
  if (!silent) emit('city', state.cityId);
}
