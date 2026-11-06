// «Оқиғалар картасы»: Қазақстанның интерактивті картасы (Leaflet + OpenStreetMap, API кілтінсіз).
// Көрсетілетіні: координатор жариялаған оқиғалар (өрт, су тасқыны, жер сілкінісі, авария, басқа мәселе),
// автордың өз хабарламалары (тексеруде) және координаторға тексерілмеген хабарламалар.
// Тайлдар жүктелмесе — офлайн демо карта (Қазақстан шекарасы мен қалалар) көрсетіледі.
import { api, errText } from '../api.js';
import { state, cityLabel, cityRegionLabel, setCity } from '../state.js';
import { icon, DISASTER_ICON } from '../icons.js';
import { esc, $, $$, toast, emptyState, errorState, skeletonCards, timeAgo, fmtDate, verificationBadge, activityBadge, openDialog, field, formData, showErrors } from '../ui.js';
import { t, getLang } from '../i18n.js';
import { navigate, withCity } from '../router.js';
import { STATIC } from '../base.js';
import { createMap, eventPoint, hasLeaflet, watchResize, KZ_VIEW } from '../mapkit.js';

const KZ_BOUNDS = [[40.5, 46.4], [55.5, 87.4]];
const inKz = (lat, lng) => lat >= 40 && lat <= 56 && lng >= 46 && lng <= 88;
const GROUP_ICON = { fire: 'flame', flood: 'waves', earthquake: 'quake', accident: 'car', misc: 'alert' };

function groupsOf() {
  // Сервер топтарды /disaster-types жауабында береді; ескі сервер болса — әдепкі топтар
  return state.disasterGroups?.length ? state.disasterGroups : [
    { code: 'fire', types: ['wildfire', 'fire'] }, { code: 'flood', types: ['flood', 'mudflow'] },
    { code: 'earthquake', types: ['earthquake'] }, { code: 'accident', types: ['accident'] },
    { code: 'misc', types: ['landslide', 'avalanche', 'blizzard', 'drought_heat', 'incident_other'] },
  ];
}
const groupOfType = (code) => groupsOf().find((g) => g.types.includes(code))?.code || 'misc';
const typeColor = (code) => state.disasterTypes.find((d) => d.code === code)?.color || '#64748B';

function distKm(a, b, c, d) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function nearestCity(lat, lng) {
  let best = null, bd = Infinity;
  for (const c of state.cities) {
    const d = distKm(lat, lng, c.lat, c.lng);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function citySearch(q) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const score = (c) => {
    const names = [c.name_kk, c.name_ru, c.name_en].filter(Boolean).map((x) => x.toLowerCase());
    if (names.some((n) => n.startsWith(s))) return 0;
    if (names.some((n) => n.includes(s))) return 1;
    if ((c.search_text || '').toLowerCase().includes(s)) return 2;
    return 9;
  };
  return state.cities.map((c) => [score(c), c]).filter(([x]) => x < 9)
    .sort((a, b) => a[0] - b[0] || (b[1].is_major - a[1].is_major) || cityLabel(a[1]).localeCompare(cityLabel(b[1])))
    .slice(0, 8).map(([, c]) => c);
}

export default async function incidentsPage(ctx) {
  document.title = `${t('incidents.title')} — QamqorMap`;
  const q = ctx.query;
  const f = {
    group: ['fire', 'flood', 'earthquake', 'accident', 'misc'].includes(q.get('g')) ? q.get('g') : 'all',
    activity: ['active', 'resolved', 'any'].includes(q.get('act')) ? q.get('act') : 'any',
    at: state.citiesById.get(Number(q.get('at'))) ? Number(q.get('at')) : null, // таңдалған қала (болмаса — бүкіл Қазақстан)
    pending: q.get('pending') !== '0',
  };
  const isCoord = !!state.user?.is_coordinator;

  ctx.root.innerHTML = `
  <div class="inc-page">
    <div class="inc-bar">
      <div class="inc-bar-in">
        <div class="inc-head">
          <div>
            <h1 id="inc-h">${icon('map')}${esc(t('incidents.title'))}</h1>
            <p class="muted inc-lead">${esc(t('incidents.lead'))}</p>
          </div>
          <button type="button" class="btn btn-coral inc-add" id="inc-add">${icon('plus')}<span>${esc(t('incidents.add'))}</span></button>
        </div>
        <div class="inc-controls">
          <div class="inc-search" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-owns="inc-sugg">
            ${icon('search')}
            <label class="sr-only" for="inc-q">${esc(t('incidents.searchLabel'))}</label>
            <input class="input" id="inc-q" type="search" autocomplete="off" placeholder="${esc(t('incidents.searchPlaceholder'))}"
              aria-autocomplete="list" aria-controls="inc-sugg" value="${f.at ? esc(cityLabel(f.at)) : ''}">
            <ul class="inc-sugg" id="inc-sugg" role="listbox" hidden></ul>
          </div>
          <button type="button" class="chip inc-kz" id="inc-kz" aria-pressed="${!f.at}">${icon('kz')}${esc(t('incidents.allKz'))}</button>
          <label class="sr-only" for="inc-act">${esc(t('incidents.activity'))}</label>
          <select class="select inc-act" id="inc-act" title="${esc(t('incidents.activity'))}">
            ${['any', 'active', 'resolved'].map((a) => `<option value="${a}" ${a === f.activity ? 'selected' : ''}>${esc(t(`incidents.activityOpt.${a}`))}</option>`).join('')}
          </select>
          ${isCoord ? `<label class="checkbox inc-pending"><input type="checkbox" id="inc-pending" ${f.pending ? 'checked' : ''}> <span>${esc(t('incidents.showPending'))}</span></label>` : ''}
        </div>
        <div class="inc-groups" role="group" aria-label="${esc(t('incidents.groupsAria'))}" id="inc-groups"></div>
      </div>
    </div>
    <div class="inc-body" data-view="map">
      <section class="inc-list" aria-labelledby="inc-list-h" aria-label="${esc(t('incidents.listAria'))}">
        <div class="alert alert-emergency inc-emerg" role="note">${icon('siren')}<div>${esc(t('incidents.emergency'))}</div></div>
        <div class="inc-list-head"><h2 id="inc-list-h">…</h2></div>
        <p class="hint inc-demo-note">${icon('info').replace('<svg class=""', '<svg class="ico-inline"')} ${esc(t('incidents.demoNote'))}</p>
        <div id="inc-items" aria-live="polite">${skeletonCards(3)}</div>
      </section>
      <section class="inc-map-wrap" aria-label="${esc(t('incidents.mapAria'))}">
        <div id="inc-map" class="inc-map"></div>
        <div class="inc-map-loading" id="inc-loading" role="status"><div class="spinner"></div><span>${esc(t('incidents.loading'))}</span></div>
        <div class="inc-overlay-top" id="inc-top"></div>
        <button type="button" class="inc-map-btn inc-reset" id="inc-reset" title="${esc(t('incidents.resetView'))}" aria-label="${esc(t('incidents.resetView'))}">${icon('kz')}</button>
        <div class="inc-legend" aria-hidden="true">
          <span><i class="lg-ev ok"></i>${esc(t('incidents.legendVerified'))}</span>
          <span><i class="lg-ev q"></i>${esc(t('incidents.legendUnverified'))}</span>
          <span><i class="lg-mine"></i>${esc(t('incidents.legendMine'))}</span>
          <span><b class="lg-demo">i</b>${esc(t('incidents.legendDemo'))}</span>
        </div>
      </section>
    </div>
    <div class="view-switch inc-switch" role="group" aria-label="${esc(t('map.view'))}">
      <button type="button" data-view="map" aria-pressed="true">${icon('map')}${esc(t('incidents.viewMap'))}</button>
      <button type="button" data-view="list" aria-pressed="false">${icon('list')}${esc(t('incidents.viewList'))}</button>
    </div>
  </div>`;
  const R = ctx.root;
  const body = $('.inc-body', R);

  let map = null, evLayer = null, repLayer = null, areaLayer = null, pickMarker = null, picking = false;
  let events = [], reports = [], localReports = [];
  const markers = new Map();
  let offline = false, noteHidden = false;

  function syncUrl() {
    const u = new URL(location.href);
    const set = (k, v) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set('g', f.group === 'all' ? '' : f.group);
    set('act', f.activity === 'any' ? '' : f.activity);
    set('at', f.at ? String(f.at) : '');
    history.replaceState(history.state, '', u);
  }

  // ───── Карта ─────
  function topNote(html) { $('#inc-top', R).innerHTML = html || ''; }
  function offlineNote() {
    offline = true;
    if (noteHidden) return;
    topNote(`<div class="inc-note" role="status" id="inc-offline">${icon('alert')}<div><b>${esc(t('incidents.offlineBadge'))}.</b> <span class="inc-note-more">${esc(t('incidents.tilesFailed'))}</span><span class="inc-note-short">${esc(t('incidents.offlineHint'))}</span>
      <br><button type="button" class="btn btn-sm btn-ghost" id="inc-retry">${icon('refresh')}${esc(t('incidents.retryTiles'))}</button></div>
      <button type="button" class="inc-note-x" id="inc-note-x" aria-label="${esc(t('common.close'))}">${icon('x')}</button></div>`);
    $('#inc-retry', R)?.addEventListener('click', () => { offline = false; topNote(''); map?.qmRetryTiles?.(); });
    $('#inc-note-x', R)?.addEventListener('click', () => { noteHidden = true; topNote(''); });
  }
  function initMap() {
    if (!hasLeaflet()) {
      $('#inc-loading', R).innerHTML = `${icon('alert')}<span>${esc(t('incidents.loadFailed'))}</span>`;
      return;
    }
    const c = f.at ? state.citiesById.get(f.at) : null;
    map = createMap($('#inc-map', R), {
      center: c ? [c.lat, c.lng] : KZ_VIEW.center, zoom: c ? 10 : KZ_VIEW.zoom,
      onTilesFailed: offlineNote,
    });
    map.options.zoomSnap = 0.5;
    map.setMinZoom(3);
    map.setMaxBounds(L.latLngBounds([[33, 36], [60, 98]]));
    if (!c) map.fitBounds(KZ_BOUNDS, { padding: [10, 10] });
    areaLayer = L.layerGroup().addTo(map);
    evLayer = L.layerGroup().addTo(map);
    repLayer = L.layerGroup().addTo(map);
    map.on('click', (e) => { if (picking) pickAt(e.latlng.lat, e.latlng.lng); });
    map.on('popupclose', () => areaLayer.clearLayers());
    ctx.onCleanup(watchResize(map, $('#inc-map', R)));
    ctx.onCleanup(() => map.remove());
  }

  function eventMarkerIcon(e) {
    return L.divIcon({
      className: 'qm-event-marker',
      html: `<div class="qm-event${e.activity_status === 'resolved' ? ' is-resolved' : ''}${e.verification_status === 'verified' ? ' is-verified' : ''}" style="--ev:${esc(e.type_color)}">
        <span class="qm-event-inner">${icon(DISASTER_ICON[e.type_code] || 'alert')}</span>${e.is_demo ? '<span class="qm-event-demo">i</span>' : ''}</div>`,
      iconSize: [46, 46], iconAnchor: [23, 23], popupAnchor: [0, -20],
    });
  }
  function reportIcon(r) {
    return L.divIcon({
      className: 'qm-report-marker',
      html: `<div class="qm-report${r.mine ? ' is-mine' : ''}" style="--ev:${esc(typeColor(r.type_code))}">${icon(DISASTER_ICON[r.type_code] || 'alert')}<b>?</b></div>`,
      iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -18],
    });
  }

  function eventPopup(e) {
    const areas = (e.areas || []).map((a) => (a.city_id ? cityLabel(a.city_id) : '')).filter(Boolean);
    return `<div class="inc-pop" data-pop-event="${e.id}">
      <div class="inc-pop-tags">
        <span class="badge badge-ev" style="--ev:${esc(e.type_color)}">${icon(DISASTER_ICON[e.type_code] || 'alert')}${esc(t(`dtype.${e.type_code}`))}</span>
        ${verificationBadge(e.verification_status)}${activityBadge(e.activity_status)}
      </div>
      ${e.is_demo ? `<p class="inc-pop-demo">${icon('info')}${esc(t('demo.eventBanner'))}</p>` : ''}
      <h3 data-ugc lang="${esc(e.content_lang || 'kk')}">${esc(e.title)}</h3>
      ${e.summary ? `<p class="inc-pop-text" data-ugc lang="${esc(e.content_lang || 'kk')}">${esc(e.summary)}</p>` : ''}
      <ul class="inc-pop-meta">
        ${areas.length ? `<li>${icon('pin')}${esc(areas.join(', '))}</li>` : ''}
        ${e.location_note ? `<li>${icon('map')}<span data-ugc>${esc(e.location_note)}</span></li>` : ''}
        <li>${icon('clock')}${esc(t('incidents.started', { time: fmtDate(e.started_at) }))}</li>
        <li>${icon('inbox')}${esc(t('event.requestsCount', { count: e.requests_count || 0 }))}</li>
      </ul>
      <p class="inc-pop-hint">${esc(t('event.mapHint'))}</p>
      <a class="btn btn-primary btn-sm" href="${withCity(`/events/${e.id}`)}">${esc(t('incidents.open'))}${icon('chevRight')}</a>
    </div>`;
  }
  function reportPopup(r) {
    return `<div class="inc-pop">
      <div class="inc-pop-tags"><span class="badge badge-ev" style="--ev:${esc(typeColor(r.type_code))}">${esc(t(`dtype.${r.type_code}`))}</span>
        <span class="badge badge-unverified">${esc(t(r.mine ? 'incidents.mine' : 'incidents.pending'))}</span>
        ${r.local ? `<span class="badge badge-demo">${esc(t('demo.badge'))}</span>` : ''}</div>
      <p class="inc-pop-text" data-ugc>${esc(r.description)}</p>
      <ul class="inc-pop-meta">
        ${r.city_id ? `<li>${icon('pin')}${esc(cityLabel(r.city_id))}</li>` : ''}
        ${r.reporter_name ? `<li>${icon('user')}${esc(t('incidents.reporter'))}: <span data-ugc>${esc(r.reporter_name)}</span></li>` : ''}
        <li>${icon('clock')}${esc(timeAgo(r.created_at))}</li>
      </ul>
      <p class="inc-pop-hint">${esc(t('incidents.formIntro'))}</p>
    </div>`;
  }

  function shownEvents() { return events.filter((e) => f.group === 'all' || groupOfType(e.type_code) === f.group); }
  function shownReports() {
    const all = [...localReports, ...reports];
    return all.filter((r) => r.lat != null && (f.group === 'all' || groupOfType(r.type_code) === f.group));
  }

  function drawGroups() {
    const counts = { all: events.length };
    for (const e of events) { const g = groupOfType(e.type_code); counts[g] = (counts[g] || 0) + 1; }
    $('#inc-groups', R).innerHTML = ['all', ...groupsOf().map((g) => g.code)].map((g) => `
      <button type="button" class="chip inc-chip" data-group="${g}" id="inc-g-${g}" aria-pressed="${f.group === g}">
        ${g === 'all' ? icon('layers') : icon(GROUP_ICON[g])}<span>${esc(t(`incidents.groups.${g}`))}</span><b class="inc-chip-n">${counts[g] || 0}</b>
      </button>`).join('');
    $$('[data-group]', R).forEach((b) => b.addEventListener('click', () => {
      f.group = b.dataset.group;
      syncUrl();
      drawGroups();
      drawAll({ fit: false });
    }));
  }

  function drawList() {
    const list = shownEvents();
    const reps = shownReports();
    $('#inc-list-h', R).textContent = `${f.at ? cityLabel(f.at) : t('incidents.allKz')}: ${t('incidents.listTitle', { count: list.length })}`;
    const box = $('#inc-items', R);
    if (!list.length && !reps.length) {
      box.innerHTML = `<div class="card">${emptyState({ title: t('incidents.empty'), text: t('incidents.emptyHint'), ico: 'map' })}</div>`;
      return;
    }
    box.innerHTML = `<div class="inc-cards">${reps.map((r) => `
      <article class="inc-card is-report" data-rep="${esc(r.key)}" style="--ev:${esc(typeColor(r.type_code))}">
        <div class="inc-card-ico">${icon(DISASTER_ICON[r.type_code] || 'alert')}</div>
        <div class="inc-card-b">
          <div class="inc-card-tags"><span class="badge badge-unverified">${esc(t(r.mine ? 'incidents.mine' : 'incidents.pending'))}</span>
            <span class="muted">${esc(t(`dtype.${r.type_code}`))}</span></div>
          <p class="inc-card-title" data-ugc>${esc(r.description.slice(0, 120))}</p>
          <div class="inc-card-meta">${r.city_id ? `<span>${icon('pin')}${esc(cityLabel(r.city_id))}</span>` : ''}<span>${icon('clock')}${esc(timeAgo(r.created_at))}</span></div>
          <button type="button" class="btn btn-sm btn-ghost" data-zoom-rep="${esc(r.key)}">${icon('target')}${esc(t('incidents.zoom'))}</button>
        </div>
      </article>`).join('')}
      ${list.map((e) => `
      <article class="inc-card${e.activity_status === 'resolved' ? ' is-resolved' : ''}" data-ev="${e.id}" style="--ev:${esc(e.type_color)}">
        <div class="inc-card-ico">${icon(DISASTER_ICON[e.type_code] || 'alert')}</div>
        <div class="inc-card-b">
          <div class="inc-card-tags">
            <span class="badge badge-ev" style="--ev:${esc(e.type_color)}">${esc(t(`dtype.${e.type_code}`))}</span>
            ${verificationBadge(e.verification_status)}${e.is_demo ? `<span class="badge badge-demo">${esc(t('incidents.demoBadge'))}</span>` : ''}
          </div>
          <h3 class="inc-card-title"><a href="${withCity(`/events/${e.id}`)}" data-ugc lang="${esc(e.content_lang || 'kk')}">${esc(e.title)}</a></h3>
          <div class="inc-card-meta">
            ${(e.areas || []).filter((a) => a.city_id).slice(0, 2).map((a) => `<span>${icon('pin')}${esc(cityLabel(a.city_id))}</span>`).join('')}
            <span>${icon('refresh')}${esc(t('event.updated', { time: timeAgo(e.updated_at) }))}</span>
            ${activityBadge(e.activity_status)}
          </div>
          <button type="button" class="btn btn-sm btn-ghost" data-zoom-ev="${e.id}">${icon('target')}${esc(t('incidents.zoom'))}</button>
        </div>
      </article>`).join('')}</div>`;
    $$('[data-zoom-ev]', box).forEach((b) => b.addEventListener('click', () => focusEvent(Number(b.dataset.zoomEv))));
    $$('[data-zoom-rep]', box).forEach((b) => b.addEventListener('click', () => focusReport(b.dataset.zoomRep)));
  }

  function drawMarkers({ fit }) {
    if (!map) return;
    evLayer.clearLayers();
    repLayer.clearLayers();
    markers.clear();
    const pts = [];
    for (const e of shownEvents()) {
      const p = eventPoint(e);
      if (!p) continue;
      const m = L.marker(p, { icon: eventMarkerIcon(e), title: e.title, alt: e.title, keyboard: true, riseOnHover: true })
        .bindPopup(eventPopup(e), { maxWidth: 320, minWidth: 240, autoPanPadding: [16, 16], className: 'inc-popup' })
        .on('popupopen', () => {
          areaLayer.clearLayers();
          if (e.radius_km) L.circle(p, { radius: e.radius_km * 1000, color: e.type_color, weight: 1.5, dashArray: '6 6', fillOpacity: 0.08, interactive: false }).addTo(areaLayer);
        })
        .addTo(evLayer);
      markers.set(`e:${e.id}`, m);
      pts.push(p);
    }
    for (const r of shownReports()) {
      const m = L.marker([r.lat, r.lng], { icon: reportIcon(r), title: t(`dtype.${r.type_code}`), alt: t(r.mine ? 'incidents.mine' : 'incidents.pending'), keyboard: true })
        .bindPopup(reportPopup(r), { maxWidth: 300, minWidth: 220, className: 'inc-popup' })
        .addTo(repLayer);
      markers.set(`r:${r.key}`, m);
      pts.push([r.lat, r.lng]);
    }
    if (fit) {
      if (f.at) {
        const c = state.citiesById.get(f.at);
        map.flyTo([c.lat, c.lng], Math.min(c.zoom || 11, 11), { duration: 0.6 });
      } else {
        map.invalidateSize({ pan: false });
        map.fitBounds(KZ_BOUNDS, { padding: [10, 10], animate: false });
      }
    }
  }

  function drawAll({ fit = false } = {}) {
    drawList();
    drawMarkers({ fit });
  }

  function showMapView() {
    if (body.dataset.view !== 'map') setView('map');
  }
  function focusEvent(id) {
    const m = markers.get(`e:${id}`);
    if (!m) return;
    showMapView();
    setTimeout(() => {
      map.invalidateSize();
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 9), { duration: 0.5 });
      map.once('moveend', () => m.openPopup());
    }, 30);
  }
  function focusReport(key) {
    const m = markers.get(`r:${key}`);
    if (!m) return;
    showMapView();
    setTimeout(() => { map.invalidateSize(); map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 10), { duration: 0.5 }); map.once('moveend', () => m.openPopup()); }, 30);
  }

  // ───── Деректер ─────
  async function load({ fit = false } = {}) {
    $('#inc-items', R).innerHTML = skeletonCards(3);
    const loading = $('#inc-loading', R);
    if (loading) loading.hidden = false;
    try {
      const query = { limit: 200, city_id: f.at || undefined, activity: f.activity === 'any' ? undefined : f.activity };
      const [ev, mine, pend] = await Promise.all([
        api('/events', { query }),
        state.user && !STATIC ? api('/me/disaster-reports').catch(() => ({ items: [] })) : { items: [] },
        isCoord && f.pending && !STATIC ? api('/coordinator/disaster-reports', { query: { status: 'pending' } }).catch(() => ({ items: [] })) : { items: [] },
      ]);
      events = ev.items;
      const mineItems = mine.items.filter((r) => r.status === 'pending').map((r) => ({ ...r, mine: true, key: `m${r.id}` }));
      const pendItems = pend.items.filter((r) => !mineItems.some((m) => m.id === r.id)).map((r) => ({ ...r, key: `p${r.id}` }));
      const near = (r) => !f.at || !r.city_id || r.city_id === f.at || (r.lat != null && distKm(r.lat, r.lng, state.citiesById.get(f.at).lat, state.citiesById.get(f.at).lng) <= 60);
      reports = [...mineItems, ...pendItems].filter(near);
    } catch (err) {
      $('#inc-items', R).innerHTML = errorState(err);
      $('#inc-items [data-retry]', R)?.addEventListener('click', () => load({ fit }));
      if (loading) loading.hidden = true;
      return;
    }
    if (loading) loading.hidden = true;
    drawGroups();
    drawAll({ fit });
  }

  // ───── Қала іздеу ─────
  const qInput = $('#inc-q', R);
  const sugg = $('#inc-sugg', R);
  const combo = $('.inc-search', R);
  let active = -1, found = [];
  function closeSugg() { sugg.hidden = true; combo.setAttribute('aria-expanded', 'false'); active = -1; qInput.removeAttribute('aria-activedescendant'); }
  function renderSugg() {
    found = citySearch(qInput.value);
    if (!qInput.value.trim()) return closeSugg();
    sugg.innerHTML = found.length
      ? found.map((c, i) => `<li role="option" id="inc-opt-${c.id}" data-city="${c.id}" aria-selected="${i === active}"><b>${esc(cityLabel(c))}</b><small>${esc(cityRegionLabel(c))}</small></li>`).join('')
      : `<li class="inc-sugg-empty" role="option" aria-disabled="true">${esc(t('incidents.noCity'))}</li>`;
    sugg.hidden = false;
    combo.setAttribute('aria-expanded', 'true');
    if (active >= 0 && found[active]) qInput.setAttribute('aria-activedescendant', `inc-opt-${found[active].id}`);
  }
  function chooseCity(id) {
    f.at = id;
    qInput.value = id ? cityLabel(id) : '';
    closeSugg();
    $('#inc-kz', R).setAttribute('aria-pressed', String(!id));
    syncUrl();
    if (id) setCity(id); // тақырыптағы қала да ауысады — бүкіл сайт бір қаламен жұмыс істейді
    load({ fit: true });
  }
  qInput.addEventListener('input', () => { active = -1; renderSugg(); });
  qInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, found.length - 1); renderSugg(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); renderSugg(); }
    else if (e.key === 'Enter') { e.preventDefault(); const c = found[active >= 0 ? active : 0]; if (c) chooseCity(c.id); }
    else if (e.key === 'Escape') closeSugg();
  });
  sugg.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-city]');
    if (li) { e.preventDefault(); chooseCity(Number(li.dataset.city)); }
  });
  qInput.addEventListener('blur', () => setTimeout(closeSugg, 120));
  $('#inc-kz', R).addEventListener('click', () => chooseCity(null));
  $('#inc-reset', R).addEventListener('click', () => (f.at ? chooseCity(null) : map?.fitBounds(KZ_BOUNDS, { padding: [10, 10] })));
  $('#inc-act', R).addEventListener('change', (e) => { f.activity = e.target.value; syncUrl(); load(); });
  $('#inc-pending', R)?.addEventListener('change', (e) => { f.pending = e.target.checked; load(); });

  // ───── Карта / Тізім (телефон) ─────
  function setView(v) {
    body.dataset.view = v;
    $$('.inc-switch [data-view]', R).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    if (v === 'map') setTimeout(() => map?.invalidateSize(), 30);
  }
  $$('.inc-switch [data-view]', R).forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  // ───── Жаңа хабарлама: картадан орын таңдау ─────
  function stopPicking() {
    picking = false;
    $('#inc-map', R).classList.remove('is-picking');
    if (!offline) topNote('');
    else offlineNote();
  }
  function startPicking() {
    if (!state.user && !STATIC) {
      toast(t('incidents.loginToAdd'), { link: { href: withCity(`/login?next=${encodeURIComponent('/incidents')}`), text: t('nav.login') } });
      navigate(`/login?next=${encodeURIComponent('/incidents')}`);
      return;
    }
    if (!map) return;
    showMapView();
    picking = true;
    $('#inc-map', R).classList.add('is-picking');
    topNote(`<div class="inc-note is-pick" role="status">${icon('target')}<div><b>${esc(t('incidents.pickHint'))}</b>
      <span class="inc-note-actions">
        <button type="button" class="btn btn-sm" id="inc-locate">${icon('locate')}${esc(t('incidents.myLocation'))}</button>
        <button type="button" class="btn btn-sm btn-ghost" id="inc-pick-cancel">${icon('x')}${esc(t('incidents.pickCancel'))}</button>
      </span></div></div>`);
    $('#inc-pick-cancel', R).addEventListener('click', () => { stopPicking(); pickMarker?.remove(); pickMarker = null; });
    $('#inc-locate', R).addEventListener('click', (e) => {
      if (!navigator.geolocation) return toast(t('incidents.geoFailed'), { type: 'error' });
      e.currentTarget.disabled = true;
      toast(t('incidents.locating'));
      navigator.geolocation.getCurrentPosition(
        (pos) => { map.flyTo([pos.coords.latitude, pos.coords.longitude], 13); pickAt(pos.coords.latitude, pos.coords.longitude); },
        () => { toast(t('incidents.geoFailed'), { type: 'error' }); const b = $('#inc-locate', R); if (b) b.disabled = false; },
        { timeout: 10000, maximumAge: 60000 },
      );
    });
  }
  $('#inc-add', R).addEventListener('click', startPicking);

  function pickAt(lat, lng) {
    if (!inKz(lat, lng)) { toast(t('incidents.pointOutside'), { type: 'error' }); return; }
    stopPicking();
    pickMarker?.remove();
    pickMarker = L.marker([lat, lng], {
      draggable: true, keyboard: true, title: t('incidents.picked'),
      icon: L.divIcon({ className: 'qm-pick-marker', html: `<div class="qm-pick">${icon('pin')}</div>`, iconSize: [40, 48], iconAnchor: [20, 46] }),
    }).addTo(map);
    openReportForm(lat, lng);
  }

  function openReportForm(lat, lng) {
    let point = { lat, lng };
    const near = nearestCity(lat, lng);
    const natural = state.disasterTypes.filter((d) => (d.kind || 'natural') === 'natural');
    const incident = state.disasterTypes.filter((d) => d.kind === 'incident');
    const opt = (d) => `<option value="${d.code}">${esc(t(`dtype.${d.code}`))}</option>`;
    const preset = f.group !== 'all' ? groupsOf().find((g) => g.code === f.group)?.types.find((c) => state.disasterTypes.some((d) => d.code === c)) : '';
    const { dlg, close } = openDialog({
      title: t('incidents.formTitle'),
      className: 'inc-dialog',
      body: `<form class="stack" novalidate id="inc-form">
        <div class="alert alert-info">${icon('info')}<div>${esc(t('incidents.formIntro'))}${STATIC ? `<br><b>${esc(t('incidents.staticSent'))}</b>` : ''}</div></div>
        <div class="inc-point" id="inc-point">${icon('pin')}<span><b>${esc(t('incidents.picked'))}:</b> <span id="inc-point-v"></span></span>
          <button type="button" class="btn btn-sm btn-ghost" id="inc-repick">${icon('target')}${esc(t('incidents.changePoint'))}</button></div>
        ${field({ name: 'type', label: t('incidents.type'), required: true, control: `<select class="select" id="f-type" name="type"><option value="">${esc(t('disaster.chooseType'))}</option>
          <optgroup label="${esc(t('dir.disaster'))}">${natural.map(opt).join('')}</optgroup>
          ${incident.length ? `<optgroup label="${esc(t('incidents.groups.misc'))}">${incident.map(opt).join('')}</optgroup>` : ''}</select>` })}
        ${field({ name: 'city_id', label: t('disaster.nearestCity'), required: true, control: `<select class="select" id="f-city_id" name="city_id">
          ${[...state.cities].sort((a, b) => cityLabel(a).localeCompare(cityLabel(b))).map((c) => `<option value="${c.id}" ${c.id === near?.id ? 'selected' : ''}>${esc(cityLabel(c))}</option>`).join('')}</select>` })}
        ${field({ name: 'description', label: t('incidents.desc'), required: true, hint: t('incidents.descHint'), control: '<textarea class="textarea" id="f-description" name="description" maxlength="2000" rows="4"></textarea>' })}
        ${field({ name: 'source_name', label: t('event.source'), hint: t('disaster.sourceHint'), control: '<input class="input" id="f-source_name" name="source_name" maxlength="160">' })}
        <div class="form-alert" tabindex="-1"></div>
      </form>`,
      actions: [
        { label: t('common.cancel'), cls: 'btn-ghost', onClick: ({ close: c }) => { pickMarker?.remove(); pickMarker = null; c(); } },
        { label: t('incidents.send'), cls: 'btn-primary', icon: 'send', onClick: async ({ close: c, dlg: d }) => {
          const form = d.querySelector('form');
          const v = formData(form);
          const errs = {};
          if (!v.type) errs.type = { code: 'REQUIRED' };
          if (!v.city_id) errs.city_id = { code: 'REQUIRED' };
          if (!v.description || v.description.trim().length < 20) errs.description = { code: v.description ? 'MIN_LENGTH' : 'REQUIRED', params: { min: 20 } };
          if (Object.keys(errs).length) return showErrors(form, { message: t('errors.VALIDATION'), fields: errs });
          try {
            const res = await api('/disaster-reports', { method: 'POST', body: {
              type: v.type, city_id: Number(v.city_id), lat: +point.lat.toFixed(5), lng: +point.lng.toFixed(5),
              description: v.description.trim(), source_name: v.source_name || '', content_lang: getLang(),
            } });
            sent = true;
            c();
            pickMarker?.remove();
            pickMarker = null;
            localReports.unshift({
              id: res.id, key: `n${res.id}`, mine: true, local: !!res.static, type_code: v.type, city_id: Number(v.city_id),
              lat: point.lat, lng: point.lng, description: v.description.trim(), created_at: res.created_at || new Date().toISOString(), status: 'pending',
            });
            toast(res.static ? t('incidents.staticSent') : t('incidents.sent'), { type: 'success', timeout: 8000 });
            if (f.group !== 'all' && groupOfType(v.type) !== f.group) { f.group = 'all'; syncUrl(); drawGroups(); }
            drawAll();
            setTimeout(() => focusReport(`n${res.id}`), 50);
          } catch (err) { showErrors(form, err); }
        } },
      ],
    });
    let sent = false;
    dlg.addEventListener('close', () => { if (!sent && !picking) { pickMarker?.remove(); pickMarker = null; } });
    const showPoint = () => { $('#inc-point-v', dlg).textContent = `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`; };
    showPoint();
    if (preset) dlg.querySelector('#f-type').value = preset;
    pickMarker?.on('dragend', () => {
      const ll = pickMarker.getLatLng();
      if (inKz(ll.lat, ll.lng)) { point = { lat: ll.lat, lng: ll.lng }; showPoint(); }
    });
    $('#inc-repick', dlg).addEventListener('click', () => { close(); startPicking(); });
    setTimeout(() => dlg.querySelector('#f-type')?.focus(), 30);
    void errText;
  }

  ctx.on('city', () => {
    // Тақырыптан қала ауысса — картаны сол қалаға апарамыз
    if (state.cityId && state.cityId !== f.at) { f.at = state.cityId; qInput.value = cityLabel(f.at); $('#inc-kz', R).setAttribute('aria-pressed', 'false'); syncUrl(); load({ fit: true }); }
  });
  ctx.on('event-changed', () => load());

  initMap();
  // Деректер келгенде картаны қайта сыйдырамыз (бет жүктелгенде контейнер өлшемі өзгеруі мүмкін)
  await load({ fit: true });
}
