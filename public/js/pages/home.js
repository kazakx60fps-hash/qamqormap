import { api } from '../api.js';
import { state, cityName, city } from '../state.js';
import { icon, CATEGORY_ICON } from '../icons.js';
import { esc, statusBadge, catBadge, skeletonCards, emptyState, errorState, fmtNum, fmtDecimal, neededHtml, catLabel, $, cityLabel } from '../ui.js';
import { t, th } from '../i18n.js';
import { requestCard, eventCard } from '../components.js';
import { withCity } from '../router.js';
import { createMap, cityView, markerIcon, hasLeaflet } from '../mapkit.js';

export default async function home(ctx) {
  document.title = `QamqorMap — ${t('home.titleTag')}`;
  const everyday = state.categories.filter((c) => c.direction !== 'disaster');
  ctx.root.innerHTML = `
  <section class="hero">
    <div class="container hero-grid">
      <div class="reveal">
        <span class="hero-kicker"><span class="pill">${icon('heart')}</span><span id="hero-city-line">${esc(t('home.kicker', { city: cityName() }))}</span></span>
        <h1>${th('home.heroTitle')}</h1>
        <p class="lead">${esc(t('home.heroLead'))}</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="${withCity('/requests/new')}">${icon('plus')}${esc(t('home.ctaAsk'))}</a>
          <a class="btn btn-lg" href="${withCity('/map?status=open')}">${icon('hand')}${esc(t('home.ctaHelp'))}</a>
        </div>
        <div class="hero-trust">
          <span>${icon('shield')}${esc(t('home.trustAddress'))}</span>
          <span>${icon('checkCircle')}${esc(t('home.trustModeration'))}</span>
        </div>
      </div>
      <div class="hero-visual" aria-label="${esc(t('home.mapAria'))}">
        <div class="hero-map-card"><div class="hero-map-fallback"></div><div class="hero-map" id="hero-map"></div>
          <span class="hero-city-tag">${icon('pin')}<span id="hero-city">${esc(cityName())}</span></span>
          <a class="btn btn-primary hero-open-map" href="${withCity('/map')}">${icon('map')}${esc(t('home.openMap'))}</a>
        </div>
        <div id="hero-floats"></div>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:24px" aria-labelledby="cats-h">
    <div class="container">
      <div class="section-head"><div><span class="eyebrow">${esc(t('home.catsEyebrow'))}</span><h2 id="cats-h">${esc(t('home.catsTitle'))} <span class="soft">${esc(t('home.catsTitleSoft'))}</span></h2></div></div>
      <div class="cat-grid" id="cat-grid">
        ${everyday.map((c) => `
          <a class="cat-card" style="--cat:${esc(c.color)}" href="${withCity(`/map?category=${c.id}`)}">
            <span class="ci">${icon(CATEGORY_ICON[c.code] || 'heart')}</span>
            <h3>${esc(catLabel(c.code))}</h3><p>${esc(t(`catText.${c.code}`))}</p>
          </a>`).join('')}
      </div>
    </div>
  </section>

  <section class="section" style="background:#fff;border-block:1px solid var(--c-border)" aria-labelledby="how-h">
    <div class="container">
      <div class="section-head"><div><span class="eyebrow">${esc(t('home.howEyebrow'))}</span><h2 id="how-h">${esc(t('home.howTitle'))}</h2></div></div>
      <div class="steps">
        <div class="step"><span class="badge badge-pending step-tag">${esc(t('moderation.pending'))}</span><div class="num">01</div><h3>${esc(t('home.step1Title'))}</h3><p>${esc(t('home.step1Text'))}</p></div>
        <div class="step"><span class="badge badge-assigned step-tag">${esc(t('status.assigned'))}</span><div class="num">02</div><h3>${esc(t('home.step2Title'))}</h3><p>${esc(t('home.step2Text'))}</p></div>
        <div class="step"><span class="badge badge-completed step-tag">${esc(t('status.completed'))}</span><div class="num">03</div><h3>${esc(t('home.step3Title'))}</h3><p>${esc(t('home.step3Text'))}</p></div>
      </div>
    </div>
  </section>

  <section class="section" aria-labelledby="cur-h">
    <div class="container">
      <div class="section-head">
        <div><span class="eyebrow">${esc(t('home.currentEyebrow'))}</span><h2 id="cur-h">${esc(t('home.currentTitle', { city: cityName() }))}</h2></div>
        <a class="btn" href="${withCity('/map')}">${esc(t('home.seeAllOnMap'))}${icon('arrowRight')}</a>
      </div>
      <div class="rq-grid" id="cur-list">${skeletonCards(3)}</div>
    </div>
  </section>

  <section class="section" style="padding-top:0" aria-labelledby="dis-h">
    <div class="container">
      <div class="disaster-teaser">
        <div>
          <span class="eyebrow" style="color:#B42318">${esc(t('dir.disaster'))}</span>
          <h2 id="dis-h" style="margin-top:10px">${esc(t('home.disasterTitle'))}</h2>
          <p class="lead" style="margin-top:12px">${esc(t('home.disasterLead'))}</p>
          <div class="hero-actions" style="margin-top:22px">
            <a class="btn btn-lg btn-primary" href="${withCity('/disasters')}">${icon('alert')}${esc(t('home.disasterOpen'))}</a>
          </div>
        </div>
        <div id="dis-events" class="ev-mini-list">${skeletonCards(2)}</div>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0" aria-labelledby="stats-h">
    <div class="container">
      <div class="stats-band">
        <span class="eyebrow">${esc(t('home.statsEyebrow'))}</span>
        <h2 id="stats-h">${esc(t('home.statsTitle'))}</h2>
        <div id="stats-body"><div class="stats-grid">${skeletonCards(4).replaceAll('skel-card', 'skel-card" style="height:110px;opacity:.15')}</div></div>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0" aria-labelledby="vol-h">
    <div class="container">
      <div class="cta-volunteer">
        <div>
          <span class="eyebrow" style="color:var(--c-coral-600)">${esc(t('home.volEyebrow'))}</span>
          <h2 id="vol-h" style="margin-top:10px">${esc(t('home.volTitle'))}</h2>
          <ul>
            <li>${icon('check')}${esc(t('home.volPoint1'))}</li>
            <li>${icon('check')}${esc(t('home.volPoint2'))}</li>
            <li>${icon('check')}${esc(t('home.volPoint3'))}</li>
          </ul>
          <div class="hero-actions" style="margin-top:26px">
            <a class="btn btn-coral btn-lg" href="${withCity(state.user ? '/dashboard?tab=profile' : '/register?volunteer=1')}">${icon('hand')}${esc(t('home.volCta'))}</a>
            <a class="btn btn-lg" href="${withCity('/map?status=open')}">${esc(t('home.openRequests'))}</a>
          </div>
        </div>
        <div class="cta-art" aria-hidden="true">
          <div class="mini">${icon('basket')}<div><strong>${esc(catLabel('food'))}</strong><br><small class="muted">${esc(t('home.miniArt1'))}</small></div></div>
          <div class="mini">${icon('truck')}<div><strong>${esc(catLabel('transport'))}</strong><br><small class="muted">${esc(t('home.miniArt2'))}</small></div></div>
          <div class="mini">${icon('checkCircle')}<div><strong>${esc(t('home.miniArt3'))}</strong><br><small class="muted">${esc(t('home.miniArt3b'))}</small></div></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0" aria-labelledby="about-h">
    <div class="container about-teaser">
      <div><span class="eyebrow">${esc(t('nav.about'))}</span><h2 id="about-h" style="margin-top:10px">${esc(t('home.aboutTitle'))}</h2></div>
      <div class="stack">
        <p class="lead">${esc(t('home.aboutLead'))}</p>
        <p class="muted">${th('about.team', { names: t('about.names') }, { ugc: ['names'] })}</p>
        <a class="btn" href="${withCity('/about')}">${esc(t('common.more'))}${icon('arrowRight')}</a>
      </div>
    </div>
  </section>`;

  // ───── Мини-карта ─────
  let map = null, layer = null;
  if (hasLeaflet()) {
    try {
      const v = cityView(city());
      map = createMap($('#hero-map', ctx.root), { center: v.center, zoom: v.zoom - 1, interactive: false });
      layer = L.layerGroup().addTo(map);
      ctx.onCleanup(() => map.remove());
    } catch { map = null; }
  }

  async function load() {
    const cid = state.cityId;
    $('#hero-city', ctx.root).textContent = cityName();
    $('#hero-city-line', ctx.root).textContent = t('home.kicker', { city: cityName() });
    $('#cur-h', ctx.root).textContent = t('home.currentTitle', { city: cityName() });
    const list = $('#cur-list', ctx.root);
    list.innerHTML = skeletonCards(3);
    try {
      const [res, stats, evs] = await Promise.all([
        api('/requests', { query: { city_id: cid, status: 'active', limit: 40 } }),
        api('/stats', { query: { city_id: cid } }),
        api('/events', { query: { city_id: cid, activity: 'active', limit: 3 } }).catch(() => ({ items: [] })),
      ]);
      if (cid !== state.cityId) return;
      drawHero(res.items);
      drawList(res.items);
      drawStats(stats);
      drawEvents(evs.items);
    } catch (err) {
      list.innerHTML = `<div style="grid-column:1/-1">${errorState(err)}</div>`;
      list.querySelector('[data-retry]')?.addEventListener('click', load);
      $('#stats-body', ctx.root).innerHTML = `<p class="stats-note">${esc(t('home.statsFailed'))}</p>`;
    }
  }

  function drawHero(items) {
    const floats = $('#hero-floats', ctx.root);
    if (map) {
      const v = cityView(city());
      map.setView(v.center, state.cityId ? v.zoom - 1 : v.zoom, { animate: false });
      layer.clearLayers();
      for (const r of items) L.marker([r.approx_lat, r.approx_lng], { icon: markerIcon(r), keyboard: false }).addTo(layer);
      if (items.length > 1) map.fitBounds(L.latLngBounds(items.map((r) => [r.approx_lat, r.approx_lng])).pad(0.35), { maxZoom: 13, animate: false });
    }
    if (!items.length) {
      floats.innerHTML = `<a class="hero-float f1" href="${withCity('/requests/new')}"><div class="hf-top"><span class="badge badge-open">${icon('plus')}${esc(t('home.emptyBadge'))}</span></div>
        <strong>${esc(t('home.emptyFloat', { city: cityName() }))}</strong><small>${esc(t('home.emptyFloatHint'))}</small></a>`;
      return;
    }
    floats.innerHTML = items.slice(0, 3).map((r, i) => `
      <a class="hero-float f${i + 1}" href="${withCity(`/requests/${r.id}`)}">
        <div class="hf-top">${catBadge(r, { short: true })}${statusBadge(r.status)}</div>
        <strong data-ugc lang="${esc(r.content_lang)}">${esc(r.title)}</strong>
        <small>${esc(cityLabel(r.city_id))} · ${neededHtml(r)}</small>
      </a>`).join('');
  }

  function drawList(items) {
    const list = $('#cur-list', ctx.root);
    if (!items.length) {
      list.innerHTML = `<div class="card" style="grid-column:1/-1">${emptyState({
        title: t('home.emptyTitle', { city: cityName() }),
        text: t('home.emptyText'),
        ico: 'map',
        action: `<a class="btn btn-primary" href="${withCity('/requests/new')}">${icon('plus')}${esc(t('common.addRequest'))}</a>`,
      })}</div>`;
      return;
    }
    list.innerHTML = items.slice(0, 6).map((r) => requestCard(r)).join('');
  }

  function drawEvents(items) {
    const box = $('#dis-events', ctx.root);
    box.innerHTML = items.length
      ? items.map((e) => eventCard(e, { compact: true })).join('')
      : `<div class="card">${emptyState({ title: t('disaster.noActive', { city: cityName() }), text: t('disaster.noActiveHint'), ico: 'shield' })}</div>`;
  }

  function drawStats(s) {
    const max = Math.max(1, ...s.by_category.map((c) => c.completed));
    $('#stats-body', ctx.root).innerHTML = `
      <div class="stats-grid">
        <div class="stat"><div class="stat-num">${fmtNum(s.completed)}</div><div class="stat-label">${esc(t('stats.completed'))}</div></div>
        <div class="stat"><div class="stat-num">${fmtNum(s.active)}</div><div class="stat-label">${esc(t('stats.active'))}</div></div>
        <div class="stat"><div class="stat-num">${fmtNum(s.volunteers)}</div><div class="stat-label">${esc(t('stats.volunteers'))}</div></div>
        <div class="stat"><div class="stat-num">${s.avg_hours_to_assign != null ? esc(t('unit.hoursShort', { n: fmtDecimal(s.avg_hours_to_assign) })) : '—'}</div><div class="stat-label">${esc(t('stats.avgAssign'))}</div></div>
      </div>
      <div class="cat-bars" aria-label="${esc(t('stats.byCategory'))}">
        ${s.by_category.filter((c) => c.completed || state.categoriesByCode.get(c.code)?.direction !== 'disaster').map((c) => `<div class="cat-bar" style="--cat:${esc(c.color)}"><span>${esc(catLabel(c.code, true))}</span><span class="track"><span class="fill" style="width:${(c.completed / max) * 100}%;display:block"></span></span><b>${c.completed}</b></div>`).join('')}
      </div>
      <p class="stats-note">${esc(t('stats.note', { city: cityName() }))}${s.completed_demo ? ' ' + esc(t('stats.demoPart', { count: s.completed_demo })) : ''}</p>`;
  }

  ctx.on('city', load);
  ctx.on('request-changed', (e) => { if (!state.cityId || e.city_id === state.cityId) load(); });
  await load();
}
