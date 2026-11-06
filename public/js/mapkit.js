import { icon, CATEGORY_ICON, DISASTER_ICON } from './icons.js';
import { esc } from './ui.js';
import { state } from './state.js';
import { t, th } from './i18n.js';
import { asset } from './base.js';

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const KZ_VIEW = { center: [48.2, 67.5], zoom: 5 };
export const hasLeaflet = () => typeof window.L !== 'undefined';

export function cityView(city) {
  return city ? { center: [city.lat, city.lng], zoom: city.zoom || 12 } : KZ_VIEW;
}

/** Leaflet картасы: OpenStreetMap қабаттары (API кілтінсіз), атрибуция таңдалған тілде. */
export function createMap(el, { center, zoom, interactive = true, onTilesFailed } = {}) {
  if (!hasLeaflet()) throw new Error('Leaflet');
  const map = L.map(el, {
    center, zoom, zoomControl: false, attributionControl: true,
    dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive, boxZoom: interactive,
    keyboard: interactive, touchZoom: interactive, tap: interactive,
  });
  if (interactive) L.control.zoom({ zoomInTitle: t('map.zoomIn'), zoomOutTitle: t('map.zoomOut') }).addTo(map);
  map.attributionControl.setPrefix(false);
  let failed = 0, loaded = 0, reported = false;
  const cfg = state.mapConfig;
  const custom = cfg && cfg.tilesUrl && cfg.tilesUrl !== OSM_URL;
  const layer = L.tileLayer(custom ? cfg.tilesUrl : OSM_URL, {
    maxZoom: (custom && cfg.maxZoom) || 19,
    attribution: custom ? cfg.attribution : th('map.attribution'),
    className: 'qm-tiles',
    referrerPolicy: 'strict-origin-when-cross-origin',
  }).addTo(map);
  // Карта масштабтау анимациясы кезінде жойылса, Leaflet-тің кешіктірілген өңдегіші қате бермеуі үшін
  const origRemove = map.remove.bind(map);
  map.remove = () => {
    map._animatingZoom = false;
    try { map.stop(); } catch { /* */ }
    return origRemove();
  };
  const fail = () => {
    if (reported || loaded > 0) return;
    reported = true;
    addOfflineBase(map);
    onTilesFailed?.();
  };
  layer.on('tileload', () => { loaded++; if (map._qmOffline) removeOfflineBase(map); });
  layer.on('tileerror', () => {
    failed++;
    if (failed >= 6) fail();
  });
  // Қабаттар жауапсыз «ілініп» қалса да (желі бұғатталған) 9 секундтан кейін офлайн картаға ауысамыз
  const timer = setTimeout(() => { if (!loaded) fail(); }, 9000);
  map.on('unload', () => clearTimeout(timer));
  /** Қабаттарды қайта жүктеп көру (офлайн картадан шығу) */
  map.qmRetryTiles = () => {
    failed = 0; loaded = 0; reported = false;
    removeOfflineBase(map);
    layer.redraw();
    setTimeout(() => { if (!loaded) fail(); }, 9000);
  };
  return map;
}

// ───── Офлайн демо карта: Қазақстан шекарасы (Natural Earth, қоғамдық игілік) және қалалар ─────
let outlinePromise = null;
export function loadOutline() {
  outlinePromise ||= fetch(asset('/data/kz-outline.json'))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .catch((e) => { outlinePromise = null; throw e; });
  return outlinePromise;
}

export function addOfflineBase(map) {
  if (map._qmOffline) return;
  const group = L.layerGroup();
  map._qmOffline = group;
  map.getContainer().classList.add('is-offline');
  if (!map.getPane('qmOffline')) {
    const pane = map.createPane('qmOffline');
    pane.style.zIndex = 250; // тайлдар (200) мен белгілер (400+) арасында
    pane.style.pointerEvents = 'none';
  }
  map.attributionControl.addAttribution('Natural Earth');
  loadOutline().then((gj) => {
    if (map._qmOffline !== group) return;
    L.geoJSON(gj, {
      pane: 'qmOffline', interactive: false,
      style: (f) => (f.properties.code === 'KZ'
        ? { color: '#2457F5', weight: 2, fillColor: '#FFFFFF', fillOpacity: 1 }
        : { color: '#B6C1D8', weight: 1, fillColor: '#E6EAF3', fillOpacity: 1 }),
    }).addTo(group);
    for (const c of state.cities || []) {
      const m = L.circleMarker([c.lat, c.lng], {
        pane: 'qmOffline', interactive: false, radius: c.is_major ? 4 : 2.5,
        color: '#14213D', weight: 1, fillColor: c.is_major ? '#14213D' : '#8A93AB', fillOpacity: 1,
      });
      if (c.is_major) m.bindTooltip(cityName(c), { permanent: true, direction: 'right', className: 'qm-offline-label', offset: [4, 0] });
      m.addTo(group);
    }
  }).catch(() => { /* контур жүктелмесе, белгілер бәрібір көрінеді */ });
  group.addTo(map);
}

function removeOfflineBase(map) {
  if (!map._qmOffline) return;
  map.removeLayer(map._qmOffline);
  map._qmOffline = null;
  map.getContainer().classList.remove('is-offline');
  map.attributionControl.removeAttribution('Natural Earth');
}

function cityName(c) {
  const l = document.documentElement.lang;
  return (l === 'en' && c.name_en) || (l === 'ru' && c.name_ru) || c.name_kk;
}

export function markerIcon(r, { selected = false } = {}) {
  const done = r.status === 'completed';
  return L.divIcon({
    className: `qm-marker${selected ? ' is-selected' : ''}`,
    html: `<div class="qm-pin${done ? ' is-done' : ''}${r.urgency === 'high' && !done ? ' is-high' : ''}${r.direction === 'disaster' ? ' is-disaster' : ''}" style="background:${esc(r.category_color)}">${icon(CATEGORY_ICON[r.category_code] || 'heart')}</div>`,
    iconSize: [38, 38],
  });
}

/** Апат оқиғасының белгісі: өтініштерден ерекшеленетін ромб пішіні және апат түрінің иконкасы */
export function eventIcon(e, { selected = false } = {}) {
  return L.divIcon({
    className: `qm-event-marker${selected ? ' is-selected' : ''}`,
    html: `<div class="qm-event${e.activity_status === 'resolved' ? ' is-resolved' : ''}${e.verification_status === 'verified' ? ' is-verified' : ''}" style="--ev:${esc(e.type_color)}">
      <span class="qm-event-inner">${icon(DISASTER_ICON[e.type_code] || 'alert')}</span>${e.is_demo ? '<span class="qm-event-demo">i</span>' : ''}</div>`,
    iconSize: [46, 46],
  });
}

/** Оқиғаның картадағы нүктесі: өз нүктесі немесе аймақтағы бірінші қаланың орталығы */
export function eventPoint(e) {
  if (e.lat != null) return [e.lat, e.lng];
  for (const a of e.areas || []) {
    if (a.city_id) {
      const c = state.citiesById.get(a.city_id);
      if (c) return [c.lat, c.lng];
    }
  }
  for (const a of e.areas || []) {
    if (a.region_code) {
      const cs = state.cities.filter((c) => c.region_code === a.region_code);
      if (cs.length) return [cs.reduce((s, c) => s + c.lat, 0) / cs.length, cs.reduce((s, c) => s + c.lng, 0) / cs.length];
    }
  }
  return null;
}

export function meIcon() {
  return L.divIcon({ className: 'qm-me', html: '<div></div>', iconSize: [22, 22] });
}

/** Жасырын контейнерден көрсетілгенде карта өлшемін қайта есептеу */
export function watchResize(map, el) {
  if (typeof ResizeObserver === 'undefined') return () => {};
  const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
  ro.observe(el);
  return () => ro.disconnect();
}
