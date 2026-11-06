// «Қажеттіліктер» тақтасы (оқиға беті): жарияланған өтініштер қала/аудан және санат бойынша,
// күйлер бойынша сандар (басқанда тізім ашылады), ресурс мөлшері бірлігімен бөлек, сүзгілер, шамамен нүктелер картасы.
import { api } from './api.js';
import { state, cityLabel } from './state.js';
import { icon, CATEGORY_ICON } from './icons.js';
import { esc, $, $$, emptyState, errorState, loadingState, timeAgo, catLabel } from './ui.js';
import { t } from './i18n.js';
import { requestCard, qtyText } from './components.js';
import { createMap, markerIcon, hasLeaflet } from './mapkit.js';

const STATES = ['need_executor', 'assigned', 'awaiting', 'confirmed'];
const STATE_CLS = { need_executor: 'is-need', assigned: 'is-assigned', awaiting: 'is-awaiting', confirmed: 'is-confirmed' };

export function mountNeeds(el, eventId, { query, onCleanup }) {
  // Сүзгі URL-де сақталады — тіл ауысқанда да жоғалмайды
  const f = { area: query.get('n_area') || '', cat: query.get('n_cat') || '', state: query.get('n_state') || '' };
  let map = null;
  onCleanup?.(() => map?.remove());

  function syncUrl() {
    const u = new URL(location.href);
    for (const [k, v] of [['n_area', f.area], ['n_cat', f.cat], ['n_state', f.state]]) (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    history.replaceState(history.state, '', u);
  }
  const areaKey = (a) => `${a.city_id}|${a.district || ''}`;
  const areaText = (a) => `${cityLabel(a.city_id)} · ${a.district ? a.district : t('needs.noDistrict')}`;

  async function load({ scrollToList = false } = {}) {
    syncUrl();
    el.innerHTML = loadingState();
    let d;
    try {
      const [cityId, district] = f.area ? f.area.split('|') : [null, undefined];
      d = await api(`/events/${eventId}/needs`, { query: { city_id: cityId, district: f.area ? district : undefined, category: f.cat, state: f.state } });
    } catch (err) {
      el.innerHTML = errorState(err);
      el.querySelector('[data-retry]')?.addEventListener('click', () => load());
      return;
    }
    draw(d);
    if (scrollToList) $('#needs-list', el)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function countBtn(n, st, g) {
    if (!n) return `<span class="needs-zero">0</span>`;
    return `<button type="button" class="needs-count ${STATE_CLS[st]}" data-state="${st}" ${g ? `data-area="${esc(areaKey(g))}" data-cat="${esc(g.category_code)}"` : ''}
      aria-label="${esc(`${t(`needs.states.${st}`)}: ${n}`)}">${n}</button>`;
  }

  function draw(d) {
    const e = d.event;
    const filtered = f.area || f.cat || f.state;
    el.innerHTML = `
      <div class="needs-head">
        <div><h2 id="needs-h">${icon('list')}${esc(t('needs.title'))}</h2><p class="muted">${esc(t('needs.lead'))}</p></div>
        ${e.is_demo ? `<span class="badge badge-demo needs-demo" id="needs-demo">${esc(t('demo.eventBadge'))}</span>` : ''}
      </div>
      <p class="hint">${icon('shield').replace('<svg class=""', '<svg class="ico-inline"')} ${esc(t('needs.publicNote'))}</p>
      <div class="needs-tiles" role="group" aria-label="${esc(t('needs.requests'))}">
        ${STATES.map((st) => `<button type="button" class="needs-tile ${STATE_CLS[st]} ${f.state === st ? 'is-on' : ''}" data-state="${st}" id="needs-tile-${st}">
          <b>${d.totals[st]}</b><span>${esc(t(`needs.states.${st}`))}</span></button>`).join('')}
        <div class="needs-tile is-total"><b>${d.totals.total}</b><span>${esc(t('needs.requests'))}</span></div>
      </div>
      <form class="mt-row needs-filters" id="needs-filters">
        <label class="sr-only" for="n-area">${esc(t('needs.area'))}</label>
        <select class="select" id="n-area" name="area"><option value="">${esc(t('needs.area'))}: ${esc(t('needs.any'))}</option>
          ${d.facets.areas.map((a) => `<option value="${esc(areaKey(a))}" ${a.district ? 'data-ugc' : ''} ${areaKey(a) === f.area ? 'selected' : ''}>${esc(areaText(a))}</option>`).join('')}</select>
        <label class="sr-only" for="n-cat">${esc(t('needs.category'))}</label>
        <select class="select" id="n-cat" name="cat"><option value="">${esc(t('needs.category'))}: ${esc(t('needs.any'))}</option>
          ${d.facets.categories.map((c) => `<option value="${c}" ${c === f.cat ? 'selected' : ''}>${esc(catLabel(c))}</option>`).join('')}</select>
        <label class="sr-only" for="n-state">${esc(t('needs.state'))}</label>
        <select class="select" id="n-state" name="state"><option value="">${esc(t('needs.state'))}: ${esc(t('needs.any'))}</option>
          ${STATES.map((st) => `<option value="${st}" ${st === f.state ? 'selected' : ''}>${esc(t(`needs.states.${st}`))}</option>`).join('')}</select>
        ${filtered ? `<button class="btn btn-sm btn-ghost" type="button" id="n-reset">${icon('x')}${esc(t('needs.reset'))}</button>` : ''}
      </form>
      ${d.groups.length ? `<div class="table-wrap"><table class="needs-table" id="needs-table">
        <thead><tr><th>${esc(t('needs.area'))}</th><th>${esc(t('needs.category'))}</th>
          ${STATES.map((st) => `<th class="num">${esc(t(`needs.states.${st}`))}</th>`).join('')}<th>${esc(t('needs.resources'))}</th></tr></thead>
        <tbody>${d.groups.map((g) => `<tr>
          <td>${esc(cityLabel(g.city_id))}<div class="muted" ${g.district ? 'data-ugc' : ''}>${esc(g.district || t('needs.noDistrict'))}</div></td>
          <td><span class="needs-cat">${icon(CATEGORY_ICON[g.category_code] || 'heart')}${esc(catLabel(g.category_code))}</span></td>
          ${STATES.map((st) => `<td class="num">${countBtn(g.counts[st], st, g)}</td>`).join('')}
          <td>${g.resources.length ? g.resources.map((x) => `<span class="needs-res">${esc(qtyText(x.amount, x.unit))}</span>`).join(' ') : '<span class="muted">—</span>'}</td>
        </tr>`).join('')}</tbody></table></div>
        <p class="hint">${esc(t('needs.resourcesHint'))}</p>`
        : `<div class="card">${emptyState({ title: filtered ? t('needs.empty') : t('needs.emptyAll'), ico: 'inbox' })}</div>`}
      ${d.items.length ? `<div class="needs-split" id="needs-list">
        <div><h3 class="needs-list-h">${esc(t('needs.listTitle', { count: d.items.length }))}</h3>
          <div class="rq-list">${d.items.map((r) => `<div class="needs-item" data-need-state="${r.need_state}">
            <div class="needs-item-meta"><span class="badge ${STATE_CLS[r.need_state]}">${esc(t(`needs.states.${r.need_state}`))}</span>
              <span class="badge badge-completed">${icon('shield').replace('<svg class=""', '<svg class="ico-sm"')}${esc(t('needs.checked'))}</span>
              <span class="muted">${icon('refresh').replace('<svg class=""', '<svg class="ico-inline"')} ${esc(t('event.updated', { time: timeAgo(r.updated_at) }))}</span></div>
            ${requestCard(r, { compact: true })}</div>`).join('')}</div></div>
        <div><div class="mini-map needs-map" id="needs-map" aria-label="${esc(t('needs.showOnMap'))}"></div>
          <p class="hint" style="margin-top:6px">${esc(t('request.mapApprox'))}</p></div>
      </div>` : ''}`;

    $$('[data-state]', el).forEach((b) => b.addEventListener('click', () => {
      f.state = b.dataset.state;
      if (b.dataset.area) f.area = b.dataset.area;
      if (b.dataset.cat) f.cat = b.dataset.cat;
      if (b.classList.contains('needs-tile') && b.classList.contains('is-on')) f.state = '';
      load({ scrollToList: true });
    }));
    const form = $('#needs-filters', el);
    form.addEventListener('change', () => { f.area = form.area.value; f.cat = form.cat.value; f.state = form.state.value; load(); });
    $('#n-reset', el)?.addEventListener('click', () => { f.area = ''; f.cat = ''; f.state = ''; load(); });
    drawMap(d.items);
  }

  function drawMap(items) {
    map?.remove();
    map = null;
    const box = $('#needs-map', el);
    if (!box) return;
    const pts = items.filter((r) => r.approx_lat != null);
    if (!hasLeaflet() || !pts.length) { box.hidden = true; return; }
    try {
      map = createMap(box, { center: [pts[0].approx_lat, pts[0].approx_lng], zoom: 12 });
      const ll = pts.map((r) => {
        L.marker([r.approx_lat, r.approx_lng], { icon: markerIcon(r), title: r.title, alt: r.title }).addTo(map)
          .on('click', () => document.querySelector(`.needs-item .rq-card[data-id="${r.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        return [r.approx_lat, r.approx_lng];
      });
      if (ll.length > 1) map.fitBounds(L.latLngBounds(ll).pad(0.3), { maxZoom: 14 });
    } catch { box.hidden = true; }
  }

  void state;
  load();
}
