import { api } from '../api.js';
import { state, cityName, city, regionLabel } from '../state.js';
import { icon } from '../icons.js';
import { esc, skeletonCards, emptyState, errorState, $, $$, toast, catLabel } from '../ui.js';
import { t, th } from '../i18n.js';
import { requestCard, eventCard, emergencyNotice } from '../components.js';
import { withCity } from '../router.js';
import { regions as regionCodes } from '../city-picker.js';
import { createMap, cityView, markerIcon, eventIcon, eventPoint, meIcon, hasLeaflet, watchResize } from '../mapkit.js';

const PAGE = 30;

export default async function mapPage(ctx) {
  document.title = `${t('map.title')} — QamqorMap`;
  const q = ctx.query;
  const f = {
    dir: ['everyday', 'disaster'].includes(q.get('dir')) ? q.get('dir') : 'all',
    category: q.get('category') || '',
    status: q.get('status') || 'active',
    urgency: q.get('urgency') || '',
    district: q.get('district') || '',
    q: q.get('q') || '',
    near: q.get('near') ? q.get('near').split(',').map(Number) : null,
    radius: q.get('radius') || '5',
    dtype: q.get('dtype') || '',
    activity: ['active', 'resolved', 'any'].includes(q.get('activity')) ? q.get('activity') : 'active',
    verif: ['verified', 'unverified'].includes(q.get('verif')) ? q.get('verif') : '',
    region: q.get('region') || '',
    event: Number(q.get('event')) || null,
  };
  if (f.near && (f.near.length !== 2 || !f.near.every(Number.isFinite))) f.near = null;

  const catChips = () => state.categories
    .filter((c) => f.dir === 'all' || c.direction === f.dir)
    .map((c) => `<button type="button" class="chip" style="--cat:${esc(c.color)}" data-cat="${c.id}" aria-pressed="${String(c.id) === f.category}"><span class="sw"></span>${esc(catLabel(c.code, true))}</button>`).join('');

  ctx.root.innerHTML = `
  <div class="map-page">
    <div class="map-toolbar">
      <div class="container">
        <div class="mt-row">
          <div class="seg" role="group" aria-label="${esc(t('dir.label'))}" id="dir-seg">
            ${['all', 'everyday', 'disaster'].map((d) => `<button type="button" data-dir="${d}" aria-pressed="${f.dir === d}">${d === 'disaster' ? icon('alert') : ''}${esc(t(`dir.${d}`))}</button>`).join('')}
          </div>
        </div>
        <form class="mt-row" id="filters" role="search" aria-label="${esc(t('map.filtersAria'))}">
          <div class="mt-search">${icon('search')}<label class="sr-only" for="fq">${esc(t('map.searchLabel'))}</label>
            <input class="input" id="fq" name="q" type="search" placeholder="${esc(t('map.searchPlaceholder'))}" value="${esc(f.q)}" /></div>
          <button type="button" class="btn mt-filters-btn" id="toggle-extra" aria-expanded="false" aria-controls="mt-extra">${icon('filter')}${esc(t('map.filters'))}</button>
          <div class="mt-row mt-extra" id="mt-extra">
            <label class="sr-only" for="fstatus">${esc(t('map.status'))}</label>
            <select class="select" id="fstatus" name="status">
              ${['active', 'open', 'progress', 'completed', 'all'].map((s) => `<option value="${s}">${esc(t(`map.statusOpt.${s}`))}</option>`).join('')}
            </select>
            <label class="sr-only" for="furg">${esc(t('map.urgency'))}</label>
            <select class="select" id="furg" name="urgency">
              <option value="">${esc(t('map.anyUrgency'))}</option>
              ${['high', 'normal', 'low'].map((u) => `<option value="${u}">${esc(t(`urgency.${u}`))}</option>`).join('')}
            </select>
            <label class="sr-only" for="fdist">${esc(t('map.district'))}</label>
            <input class="input" id="fdist" name="district" placeholder="${esc(t('map.district'))}" value="${esc(f.district)}" style="max-width:170px" />
            <button type="button" class="btn btn-sm" id="pick-point" aria-pressed="${!!f.near}" title="${esc(t('map.pointHint'))}">${icon('target')}<span>${esc(f.near ? t('map.pointSelected') : t('map.myPoint'))}</span></button>
            <label class="sr-only" for="fradius">${esc(t('map.radius'))}</label>
            <select class="select" id="fradius" name="radius" ${f.near ? '' : 'disabled'}>
              ${[1, 2, 3, 5, 10, 25].map((k) => `<option value="${k}" ${String(k) === f.radius ? 'selected' : ''}>${esc(t('map.withinKm', { n: k }))}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-ghost btn-sm" id="reset-filters">${icon('x')}${esc(t('map.reset'))}</button>
          </div>
          <div class="mt-row mt-disaster" id="mt-disaster" ${f.dir === 'everyday' ? 'hidden' : ''}>
            <span class="mt-label">${icon('alert')}${esc(t('dir.disaster'))}:</span>
            <label class="sr-only" for="fdtype">${esc(t('disaster.type'))}</label>
            <select class="select" id="fdtype" name="dtype">
              <option value="">${esc(t('disaster.anyType'))}</option>
              ${state.disasterTypes.map((d) => `<option value="${d.code}" ${d.code === f.dtype ? 'selected' : ''}>${esc(t(`dtype.${d.code}`))}</option>`).join('')}
            </select>
            <label class="sr-only" for="factivity">${esc(t('disaster.activity'))}</label>
            <select class="select" id="factivity" name="activity">
              ${['active', 'resolved', 'any'].map((a) => `<option value="${a}" ${a === f.activity ? 'selected' : ''}>${esc(t(`disaster.activityOpt.${a}`))}</option>`).join('')}
            </select>
            <label class="sr-only" for="fverif">${esc(t('disaster.verification'))}</label>
            <select class="select" id="fverif" name="verif">
              <option value="">${esc(t('disaster.anyVerification'))}</option>
              <option value="verified" ${f.verif === 'verified' ? 'selected' : ''}>${esc(t('verify.verified'))}</option>
              <option value="unverified" ${f.verif === 'unverified' ? 'selected' : ''}>${esc(t('verify.unverified'))}</option>
            </select>
            <span id="region-wrap" ${state.cityId ? 'hidden' : ''}>
              <label class="sr-only" for="fregion">${esc(t('disaster.region'))}</label>
              <select class="select" id="fregion" name="region">
                <option value="">${esc(t('city.allRegions'))}</option>
                ${regionCodes().filter((r) => r !== 'rep').map((r) => `<option value="${r}" ${r === f.region ? 'selected' : ''}>${esc(regionLabel(r))}</option>`).join('')}
              </select>
            </span>
          </div>
        </form>
        <div class="mt-cats" role="group" aria-label="${esc(t('map.category'))}" id="mt-cats">
          <button type="button" class="chip" data-cat="" aria-pressed="${!f.category}">${esc(t('map.allCategories'))}</button>
          ${catChips()}
        </div>
      </div>
    </div>
    <div class="map-body" data-view="list">
      <section class="map-list" aria-labelledby="list-h">
        <div id="dis-note"></div>
        <div id="event-filter"></div>
        <div id="ev-list-box"></div>
        <div class="map-list-head"><h1 id="list-h">…</h1><span class="muted" id="list-sub"></span></div>
        <div id="list-alert"></div>
        <div class="rq-list" id="rq-list" aria-live="polite">${skeletonCards(4)}</div>
        <div class="pager" id="pager"></div>
      </section>
      <section class="map-canvas" aria-label="${esc(t('map.mapAria'))}">
        <div id="map"></div>
        <div id="map-note"></div>
        <div class="map-legend" aria-hidden="true">
          <span><i class="lg-pin"></i>${esc(t('map.legendRequest'))}</span>
          <span><i class="lg-event"></i>${esc(t('map.legendEvent'))}</span>
        </div>
        <div class="ev-panel" id="ev-panel" hidden></div>
        <div class="sheet" id="sheet" hidden></div>
      </section>
    </div>
    <div class="view-switch" role="group" aria-label="${esc(t('map.view'))}">
      <button type="button" data-view="map" aria-pressed="false">${icon('map')}${esc(t('map.viewMap'))}</button>
      <button type="button" data-view="list" aria-pressed="true">${icon('list')}${esc(t('map.viewList'))}</button>
    </div>
  </div>`;
  const R = ctx.root;
  const form = $('#filters', R);
  form.status.value = f.status;
  form.urgency.value = f.urgency;
  const body = $('.map-body', R);

  // ───── Карта ─────
  let map = null, cluster = null, evLayer = null, meMarker = null, meCircle = null, picking = false;
  const markers = new Map();
  const evMarkers = new Map();
  let items = [];
  let events = [];
  let selected = null;
  let selectedEvent = null;
  let shown = PAGE;

  if (hasLeaflet()) {
    try {
      const v = cityView(city());
      map = createMap($('#map', R), {
        center: v.center, zoom: v.zoom,
        onTilesFailed: () => note(t('map.tilesFailed'), 'alert'),
      });
      cluster = typeof L.markerClusterGroup === 'function'
        ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 44, spiderfyOnMaxZoom: true })
        : L.layerGroup();
      cluster.addTo(map);
      evLayer = L.layerGroup().addTo(map);
      map.on('click', (e) => {
        if (!picking) return;
        setNear([+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5)]);
        picking = false;
        $('#map', R).style.cursor = '';
        note('');
      });
      ctx.onCleanup(watchResize(map, $('.map-canvas', R)));
      ctx.onCleanup(() => map.remove());
    } catch { map = null; }
  }
  if (!map) {
    $('#map', R).innerHTML = `<div class="map-unavailable">${emptyState({ title: t('map.unavailable'), text: t('map.unavailableText'), ico: 'map' })}</div>`;
  }

  function note(text, ico = 'info') {
    $('#map-note', R).innerHTML = text ? `<div class="map-overlay-note" role="status">${icon(ico)}${esc(text)}</div>` : '';
  }

  function syncUrl() {
    const u = new URL(location.href);
    const set = (k, v) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set('dir', f.dir !== 'all' ? f.dir : '');
    set('category', f.category);
    set('status', f.status !== 'active' ? f.status : '');
    set('urgency', f.urgency);
    set('district', f.district);
    set('q', f.q);
    set('near', f.near ? f.near.join(',') : '');
    set('radius', f.near ? f.radius : '');
    set('dtype', f.dtype);
    set('activity', f.activity !== 'active' ? f.activity : '');
    set('verif', f.verif);
    set('region', state.cityId ? '' : f.region);
    set('event', f.event || '');
    history.replaceState(history.state, '', u);
  }

  function setNear(pt) {
    f.near = pt;
    form.radius.disabled = !pt;
    const b = $('#pick-point', R);
    b.setAttribute('aria-pressed', String(!!pt));
    b.querySelector('span').textContent = pt ? t('map.pointSelected') : t('map.myPoint');
    drawMe();
    reload();
  }

  function drawMe() {
    if (!map) return;
    meMarker?.remove();
    meCircle?.remove();
    meMarker = meCircle = null;
    if (!f.near) return;
    meMarker = L.marker(f.near, { icon: meIcon(), title: t('map.selectedPoint') }).addTo(map);
    meCircle = L.circle(f.near, { radius: Number(f.radius) * 1000, color: '#FF7856', weight: 2, fillOpacity: 0.06 }).addTo(map);
  }

  // ───── Деректер ─────
  let ctrl = null;
  async function reload({ fit = true } = {}) {
    syncUrl();
    ctrl?.abort();
    ctrl = new AbortController();
    const list = $('#rq-list', R);
    list.innerHTML = skeletonCards(4);
    $('#pager', R).innerHTML = '';
    $('#list-h', R).textContent = t('map.loadingTitle', { city: cityName() });
    $('#dis-note', R).innerHTML = f.dir === 'disaster' ? emergencyNotice() : '';
    const region = state.cityId ? '' : f.region;
    const wantEvents = f.dir !== 'everyday';
    try {
      const [res, ev] = await Promise.all([
        api('/requests', {
          signal: ctrl.signal,
          query: {
            city_id: state.cityId, region, category_id: f.category, status: f.status, urgency: f.urgency,
            district: f.district, q: f.q, limit: 200, direction: f.dir === 'all' ? '' : f.dir,
            disaster_type: f.dir !== 'everyday' ? f.dtype : '', event_id: f.event || '',
            near_lat: f.near?.[0], near_lng: f.near?.[1], radius_km: f.near ? f.radius : '',
          },
        }),
        wantEvents ? api('/events', {
          signal: ctrl.signal,
          query: { city_id: state.cityId, region, type: f.dtype, activity: f.activity === 'any' ? '' : f.activity, verification: f.verif },
        }) : Promise.resolve({ items: [] }),
      ]);
      items = res.items;
      events = ev.items;
      shown = PAGE;
      $('#list-h', R).textContent = t('map.listTitle', { city: cityName(), count: res.total });
      $('#list-sub', R).textContent = f.near ? t('map.sortNear') : t('map.sortDefault');
      $('#list-alert', R).innerHTML = res.total > res.items.length
        ? `<div class="alert alert-info" style="margin-bottom:14px">${icon('info')}<div>${esc(t('map.truncated', { count: res.items.length }))}</div></div>` : '';
      drawEventFilter();
      drawEventList();
      drawList();
      drawMarkers(fit);
    } catch (err) {
      if (err.name === 'AbortError') return;
      $('#list-h', R).textContent = cityName();
      list.innerHTML = errorState(err);
      list.querySelector('[data-retry]')?.addEventListener('click', () => reload());
    }
  }

  function drawEventFilter() {
    const box = $('#event-filter', R);
    if (!f.event) { box.innerHTML = ''; return; }
    const e = events.find((x) => x.id === f.event);
    box.innerHTML = `<div class="alert alert-info" style="margin-bottom:14px">${icon('filter')}<div class="grow">${e ? th('map.eventFilterNamed', { title: e.title }, { ugc: ['title'] }) : esc(t('map.eventFilter', { id: f.event }))}</div>
      <button type="button" class="btn btn-sm" id="clear-event">${icon('x')}${esc(t('common.clear'))}</button></div>`;
    $('#clear-event', box).addEventListener('click', () => { f.event = null; reload(); });
  }

  function drawEventList() {
    const box = $('#ev-list-box', R);
    if (f.dir === 'everyday') { box.innerHTML = ''; return; }
    box.innerHTML = events.length
      ? `<section class="ev-strip" aria-labelledby="ev-strip-h"><div class="map-list-head"><h2 id="ev-strip-h">${esc(t('disaster.eventsTitle', { count: events.length }))}</h2>
          <a href="${withCity('/disasters')}" class="muted">${esc(t('disaster.allEvents'))}</a></div>
          <div class="ev-strip-list">${events.slice(0, 6).map((e) => eventCard(e, { compact: true, selected: e.id === selectedEvent })).join('')}</div></section>`
      : (f.dir === 'disaster' ? `<div class="card" style="margin-bottom:18px">${emptyState({ title: t('disaster.noEventsFilter'), text: t('disaster.noEventsFilterHint'), ico: 'shield' })}</div>` : '');
  }

  function drawList() {
    const list = $('#rq-list', R);
    if (!items.length) {
      const filtered = f.category || f.urgency || f.district || f.q || f.near || f.status !== 'active' || f.dir !== 'all' || f.event || f.dtype || f.region;
      list.innerHTML = `<div class="card" style="grid-column:1/-1">${emptyState({
        title: filtered ? t('map.emptyFiltered') : t('home.emptyTitle', { city: cityName() }),
        text: filtered ? t('map.emptyFilteredHint') : t('home.emptyText'),
        ico: filtered ? 'filter' : 'map',
        action: filtered
          ? `<button class="btn" type="button" data-reset>${esc(t('map.reset'))}</button>`
          : `<a class="btn btn-primary" href="${withCity('/requests/new')}">${icon('plus')}${esc(t('common.addRequest'))}</a>`,
      })}</div>`;
      list.querySelector('[data-reset]')?.addEventListener('click', resetFilters);
      return;
    }
    list.innerHTML = items.slice(0, shown).map((r) => requestCard(r, { selected: r.id === selected })).join('');
    $('#pager', R).innerHTML = items.length > shown
      ? `<button class="btn" type="button" id="more">${esc(t('map.showMore', { count: items.length - shown }))}</button>` : '';
    $('#more', R)?.addEventListener('click', () => { shown += PAGE; drawList(); });
  }

  function drawMarkers(fit) {
    if (!map) return;
    cluster.clearLayers();
    evLayer.clearLayers();
    markers.clear();
    evMarkers.clear();
    for (const r of items) {
      const m = L.marker([r.approx_lat, r.approx_lng], { icon: markerIcon(r, { selected: r.id === selected }), title: r.title, alt: r.title });
      m.on('click', () => select(r.id, { from: 'map' }));
      markers.set(r.id, m);
      cluster.addLayer(m);
    }
    for (const e of events) {
      const pt = eventPoint(e);
      if (!pt) continue;
      if (e.radius_km && e.lat != null) {
        L.circle(pt, { radius: e.radius_km * 1000, color: e.type_color, weight: 1.5, dashArray: '6 6', fillOpacity: 0.07, interactive: false }).addTo(evLayer);
      }
      const m = L.marker(pt, { icon: eventIcon(e, { selected: e.id === selectedEvent }), title: e.title, alt: e.title, zIndexOffset: 1000 });
      m.on('click', () => selectEvent(e.id));
      evMarkers.set(e.id, m);
      m.addTo(evLayer);
    }
    if (fit) {
      const pts = [...items.map((r) => [r.approx_lat, r.approx_lng]), ...events.map(eventPoint).filter(Boolean)];
      if (f.near) map.setView(f.near, Number(f.radius) <= 2 ? 14 : Number(f.radius) <= 5 ? 13 : 11);
      else if (pts.length > 1 && (state.cityId || f.region || f.event)) map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 14 });
      else if (pts.length === 1 && f.event) map.setView(pts[0], 11);
      else {
        const v = cityView(city());
        map.setView(v.center, v.zoom);
      }
    }
  }

  function select(id, { from } = {}) {
    const prev = selected;
    selected = id;
    for (const pid of [prev, id]) {
      const r = items.find((x) => x.id === pid);
      const m = markers.get(pid);
      if (r && m) m.setIcon(markerIcon(r, { selected: pid === selected }));
    }
    $$('.rq-card', R).forEach((c) => c.classList.toggle('is-selected', Number(c.dataset.id) === id));
    const r = items.find((x) => x.id === id);
    if (!r) return;
    if (from === 'map') {
      closeEventPanel();
      const card = $(`.rq-card[data-id="${id}"]`, R);
      if (card && body.dataset.view !== 'map') card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const sheet = $('#sheet', R);
      if (matchMedia('(max-width: 960px)').matches) {
        sheet.hidden = false;
        sheet.innerHTML = `<button class="btn btn-icon btn-ghost sheet-close" type="button" aria-label="${esc(t('common.close'))}">${icon('x')}</button>${requestCard(r)}`;
        sheet.querySelector('.sheet-close').addEventListener('click', () => { sheet.hidden = true; });
      }
    } else if (map && from === 'list') {
      const m = markers.get(id);
      if (m && cluster.zoomToShowLayer) cluster.zoomToShowLayer(m, () => {});
    }
  }

  /** Оқиға таңдалғанда: түрі, орны, соңғы жаңартуы, тексеру мәртебесі және байланысты өтініштер */
  function selectEvent(id) {
    const prev = selectedEvent;
    selectedEvent = id;
    for (const pid of [prev, id]) {
      const e = events.find((x) => x.id === pid);
      const m = evMarkers.get(pid);
      if (e && m) m.setIcon(eventIcon(e, { selected: pid === selectedEvent }));
    }
    $$('.ev-card', R).forEach((c) => c.classList.toggle('is-selected', Number(c.dataset.eventId) === id));
    const e = events.find((x) => x.id === id);
    if (!e) return;
    $('#sheet', R).hidden = true;
    const panel = $('#ev-panel', R);
    panel.hidden = false;
    panel.innerHTML = `<button class="btn btn-icon btn-ghost sheet-close" type="button" aria-label="${esc(t('common.close'))}">${icon('x')}</button>
      ${eventCard(e)}
      <div class="ev-panel-related" id="ev-related">${esc(t('common.loading'))}</div>
      <div class="row ev-panel-actions">
        <a class="btn btn-primary btn-sm" href="${withCity(`/events/${e.id}`)}">${esc(t('event.open'))}${icon('arrowRight')}</a>
        <button class="btn btn-sm" type="button" id="ev-filter-btn">${icon('filter')}${esc(t('event.showRequests'))}</button>
      </div>`;
    panel.querySelector('.sheet-close').addEventListener('click', closeEventPanel);
    $('#ev-filter-btn', panel).addEventListener('click', () => {
      f.event = e.id;
      if (f.dir === 'everyday') f.dir = 'all';
      closeEventPanel();
      if (matchMedia('(max-width: 960px)').matches) setView('list');
      reload();
    });
    api(`/events/${e.id}`).then((d) => {
      const box = $('#ev-related', panel);
      if (!box) return;
      box.innerHTML = d.requests.length
        ? `<strong>${esc(t('event.relatedTitle', { count: d.requests.length }))}</strong><ul>${d.requests.slice(0, 4).map((r) => `<li><a href="${withCity(`/requests/${r.id}`)}" data-ugc lang="${esc(r.content_lang)}">${esc(r.title)}</a> <span class="muted">· ${esc(catLabel(r.category_code, true))} · ${esc(t(`status.${r.status}`))}</span></li>`).join('')}</ul>`
        : `<span class="muted">${esc(t('event.noRelated'))}</span>`;
    }).catch(() => { const box = $('#ev-related', panel); if (box) box.textContent = ''; });
  }
  function closeEventPanel() {
    const panel = $('#ev-panel', R);
    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
  }

  // ───── Оқиғалар ─────
  let tmr = null;
  const debounced = () => { clearTimeout(tmr); tmr = setTimeout(() => reload(), 350); };
  form.addEventListener('submit', (e) => { e.preventDefault(); reload(); });
  form.q.addEventListener('input', () => { f.q = form.q.value.trim(); debounced(); });
  form.district.addEventListener('input', () => { f.district = form.district.value.trim(); debounced(); });
  form.status.addEventListener('change', () => { f.status = form.status.value; reload(); });
  form.urgency.addEventListener('change', () => { f.urgency = form.urgency.value; reload(); });
  form.radius.addEventListener('change', () => { f.radius = form.radius.value; drawMe(); reload(); });
  form.dtype.addEventListener('change', () => { f.dtype = form.dtype.value; reload(); });
  form.activity.addEventListener('change', () => { f.activity = form.activity.value; reload(); });
  form.verif.addEventListener('change', () => { f.verif = form.verif.value; reload(); });
  form.region.addEventListener('change', () => { f.region = form.region.value; reload(); });
  $('#dir-seg', R).addEventListener('click', (e) => {
    const b = e.target.closest('[data-dir]');
    if (!b || b.dataset.dir === f.dir) return;
    f.dir = b.dataset.dir;
    $$('#dir-seg [data-dir]', R).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('#mt-disaster', R).hidden = f.dir === 'everyday';
    // Санат басқа бағытқа жатса — тазалаймыз
    const cat = state.categoriesById.get(Number(f.category));
    if (cat && f.dir !== 'all' && cat.direction !== f.dir) f.category = '';
    if (f.dir === 'everyday') { f.event = null; closeEventPanel(); }
    $('#mt-cats', R).innerHTML = `<button type="button" class="chip" data-cat="" aria-pressed="${!f.category}">${esc(t('map.allCategories'))}</button>${catChips()}`;
    reload();
  });
  $('#mt-cats', R).addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    f.category = b.dataset.cat;
    $$('#mt-cats .chip', R).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    reload();
  });
  $('#ev-list-box', R).addEventListener('click', (e) => {
    const card = e.target.closest('.ev-card');
    if (!card || e.target.closest('a')) return;
    const id = Number(card.dataset.eventId);
    if (matchMedia('(max-width: 960px)').matches) setView('map');
    const m = evMarkers.get(id);
    if (map && m) map.setView(m.getLatLng(), Math.max(map.getZoom(), 9));
    selectEvent(id);
  });
  $('#pick-point', R).addEventListener('click', () => {
    if (f.near) { setNear(null); return; }
    if (!map) {
      toast(t('map.pointUnavailable'), { type: 'error' });
      return;
    }
    if (body.dataset.view !== 'map' && matchMedia('(max-width: 960px)').matches) setView('map');
    picking = true;
    $('#map', R).style.cursor = 'crosshair';
    note(t('map.pickPointNote'));
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!picking) return;
          picking = false;
          $('#map', R).style.cursor = '';
          note('');
          setNear([+pos.coords.latitude.toFixed(5), +pos.coords.longitude.toFixed(5)]);
        },
        () => {},
        { timeout: 6000, maximumAge: 60000 },
      );
    }
  });
  function resetFilters() {
    Object.assign(f, { dir: 'all', category: '', status: 'active', urgency: '', district: '', q: '', near: null, radius: '5', dtype: '', activity: 'active', verif: '', region: '', event: null });
    form.reset();
    form.status.value = 'active';
    form.radius.value = '5';
    form.activity.value = 'active';
    $$('#dir-seg [data-dir]', R).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.dir === 'all')));
    $('#mt-disaster', R).hidden = false;
    $('#mt-cats', R).innerHTML = `<button type="button" class="chip" data-cat="" aria-pressed="true">${esc(t('map.allCategories'))}</button>${catChips()}`;
    closeEventPanel();
    setNear(null);
  }
  $('#reset-filters', R).addEventListener('click', resetFilters);
  $('#toggle-extra', R).addEventListener('click', (e) => {
    const box = $('#mt-extra', R);
    const open = !box.classList.contains('is-open');
    box.classList.toggle('is-open', open);
    $('#mt-disaster', R).classList.toggle('is-open', open);
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  $('#rq-list', R).addEventListener('mouseover', (e) => {
    const c = e.target.closest('.rq-card');
    if (c && Number(c.dataset.id) !== selected) select(Number(c.dataset.id), { from: 'hover' });
  });
  $('#rq-list', R).addEventListener('focusin', (e) => {
    const c = e.target.closest('.rq-card');
    if (c) select(Number(c.dataset.id), { from: 'list' });
  });
  function setView(v) {
    body.dataset.view = v;
    $$('.view-switch button', R).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    // Жасырын болған картаның өлшемін қайта есептеп, белгілерді қайта орналастыру
    if (v === 'map' && map) setTimeout(() => { map.invalidateSize(); drawMarkers(!selected && !selectedEvent); }, 60);
    if (v === 'list') { $('#sheet', R).hidden = true; closeEventPanel(); }
  }
  $('.view-switch', R).addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) setView(b.dataset.view);
  });

  ctx.on('city', () => {
    selected = null;
    selectedEvent = null;
    closeEventPanel();
    $('#region-wrap', R).hidden = !!state.cityId;
    if (f.near) { f.near = null; form.radius.disabled = true; drawMe(); }
    reload();
  });
  ctx.on('request-changed', (e) => {
    if (!state.cityId || e.city_id === state.cityId) reload({ fit: false });
  });
  ctx.on('event-changed', () => { if (f.dir !== 'everyday') reload({ fit: false }); });

  drawMe();
  await reload();
}
