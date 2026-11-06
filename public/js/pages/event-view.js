import { api } from '../api.js';
import { state, cityLabel, regionLabel } from '../state.js';
import { icon, DISASTER_ICON } from '../icons.js';
import {
  esc, fmtDate, timeAgo, ugc, originalNote, loadingState, errorState, emptyState, toast, toastError, withBusy,
  reasonDialog, verificationBadge, activityBadge, $, $$, fmtKm, cityLabel as cl,
} from '../ui.js';
import { t } from '../i18n.js';
import { requestCard, emergencyNotice, eventAreaText } from '../components.js';
import { withCity } from '../router.js';
import { createMap, hasLeaflet, eventIcon, eventPoint } from '../mapkit.js';

const HIST_ICON = { created: 'plus', updated: 'edit', verified: 'shield', unverified: 'info', resolved: 'checkCircle', reopened: 'refresh', report_linked: 'flag' };

import { mountNeeds } from '../needs-board.js';

export default async function eventView(ctx) {
  const id = ctx.params.id;
  const R = ctx.root;
  let d = null;
  let map = null;
  R.innerHTML = `<div class="container">${loadingState()}</div>`;

  async function load({ keepScroll = false } = {}) {
    const y = scrollY;
    try {
      d = await api(`/events/${id}`);
    } catch (err) {
      R.innerHTML = `<div class="container" style="padding-top:32px">${errorState(err)}
        <div style="text-align:center"><a class="btn" href="${withCity('/disasters')}">${esc(t('event.back'))}</a></div></div>`;
      R.querySelector('[data-retry]')?.addEventListener('click', () => load());
      return;
    }
    draw();
    if (keepScroll) window.scrollTo({ top: y });
  }

  function changeText(k, v) {
    if (k === 'city_ids') return `${t('event.f.cities')}: ${(v[1] || []).map((c) => cl(c)).join(', ') || '—'}`;
    if (k === 'region_codes') return `${t('event.f.regions')}: ${(v[1] || []).map((c) => regionLabel(c)).join(', ') || '—'}`;
    if (k === 'verification_status' && Array.isArray(v)) return `${t('disaster.verification')}: ${t(`verify.${v[1]}`)}`;
    if (k === 'activity_status' && Array.isArray(v)) return `${t('disaster.activity')}: ${t(`activity.${v[1]}`)}`;
    if (k === 'report_id') return t('event.hist.reportId', { id: v });
    return t(`event.f.${k}`);
  }

  function draw() {
    const e = d.event;
    const coord = d.viewer.is_coordinator;
    document.title = `${e.title} — QamqorMap`;
    map?.remove();
    map = null;
    const areas = eventAreaText(e);
    const resolved = e.activity_status === 'resolved';
    R.innerHTML = `
    <div class="container">
      <div class="page-head" style="padding-bottom:18px">
        <nav class="crumbs" aria-label="${esc(t('common.breadcrumbs'))}"><a href="${withCity('/')}">${esc(t('nav.home'))}</a>${icon('chevRight')}<a href="${withCity('/disasters')}">${esc(t('dir.disaster'))}</a>${icon('chevRight')}<span>${esc(t('event.number', { id: e.id }))}</span></nav>
      </div>
      ${e.is_demo ? `<div class="demo-banner" role="note">${icon('info')}<div><strong>${esc(t('demo.eventBadge'))}</strong>${esc(t('demo.eventBannerLong'))}</div></div>` : ''}
      <div class="rq-layout">
        <div class="rq-main">
          <div>
            <div class="row" style="gap:8px">
              <span class="badge badge-ev" style="--ev:${esc(e.type_color)}">${icon(DISASTER_ICON[e.type_code] || 'alert').replace('<svg class=""', '<svg class="ico-sm"')}${esc(t(`dtype.${e.type_code}`))}</span>
              ${verificationBadge(e.verification_status)}${activityBadge(e.activity_status)}
            </div>
            <h1 class="rq-title" data-ugc lang="${esc(e.content_lang)}">${esc(e.title)}</h1>
            <div class="rq-meta" style="margin-top:14px;font-size:var(--fs-md)">
              ${areas.length ? `<span>${icon('pin')}${esc(areas.join(', '))}</span>` : ''}
              <span>${icon('calendar')}${esc(t('event.startedAt', { date: fmtDate(e.started_at) }))}</span>
              <span>${icon('refresh')}${esc(t('event.updated', { time: timeAgo(e.updated_at) }))}</span>
            </div>
          </div>
          ${emergencyNotice()}
          <div class="verify-explain ${e.verification_status === 'verified' ? 'is-verified' : ''}">
            ${icon(e.verification_status === 'verified' ? 'shield' : 'info')}
            <div><strong>${esc(t(`verify.${e.verification_status}`))}</strong>${esc(t(e.verification_status === 'verified' ? 'verify.verifiedExplain' : 'verify.unverifiedExplain'))}</div>
          </div>
          <section class="card card-pad">
            ${originalNote(e.content_lang)}
            <p class="rq-desc" data-ugc lang="${esc(e.content_lang)}">${esc(e.description)}</p>
          </section>
          <section class="event-cta" aria-labelledby="cta-h">
            <h2 id="cta-h" class="sr-only">${esc(t('request.actions'))}</h2>
            <a class="btn btn-coral btn-lg ${resolved ? 'is-disabled' : ''}" ${resolved ? 'aria-disabled="true" tabindex="-1"' : ''} href="${resolved ? '#' : withCity(`/requests/new?event=${e.id}`)}" id="need-help">${icon('plus')}${esc(t('event.needHelp'))}</a>
            <a class="btn btn-lg" href="#related" id="want-help">${icon('hand')}${esc(t('event.wantHelp'))}</a>
            ${resolved ? `<p class="hint">${esc(t('event.resolvedNoNew'))}</p>` : `<p class="hint">${esc(t('event.ctaHint'))}</p>`}
          </section>
          <section class="needs-board" id="needs-board" aria-labelledby="needs-h"></section>
          <section aria-labelledby="related-h" id="related">
            <div class="map-list-head"><h2 id="related-h" style="font-size:1.35rem">${esc(t('event.relatedTitle', { count: d.requests.length }))}</h2>
              <a class="muted" href="${withCity(`/map?dir=disaster&event=${e.id}`)}">${esc(t('event.showOnMap'))}</a></div>
            <div class="alert alert-warn" style="margin-bottom:14px">${icon('shield')}<div><strong>${esc(t('disaster.safetyTitle'))}</strong>${esc(t('disaster.safetyText'))}</div></div>
            <div class="rq-list ev-related-grid">${d.requests.length ? d.requests.map((r) => requestCard(r)).join('')
              : `<div class="card" style="grid-column:1/-1">${emptyState({ title: t('event.noRelated'), text: t('event.noRelatedText'), ico: 'inbox' })}</div>`}</div>
          </section>
          ${coord && d.history ? `<section class="panel" aria-labelledby="eh-h">
            <div class="panel-head"><h2 id="eh-h">${esc(t('event.historyTitle'))}</h2></div>
            <div class="panel-body"><ol class="timeline">${d.history.map((h) => `<li class="tl-item ${h.action === 'verified' || h.action === 'resolved' ? 'ok' : 'info'}"><span class="tl-ico">${icon(HIST_ICON[h.action] || 'info')}</span>
              <div class="tl-text"><b>${esc(t(`event.hist.${h.action}`))}</b> <span class="muted">· ${h.actor_name ? ugc(h.actor_name) : ''}</span><time>${esc(fmtDate(h.created_at))}</time>
              ${h.action === 'updated' && h.changes ? `<div class="tl-note">${Object.entries(h.changes).map(([k, v]) => esc(changeText(k, v))).join('<br>')}</div>` : ''}
              ${h.action === 'report_linked' ? `<div class="tl-note">${esc(changeText('report_id', h.changes.report_id))}</div>` : ''}
              ${h.note ? `<div class="tl-note">${ugc(h.note)}</div>` : ''}</div></li>`).join('')}</ol></div></section>` : ''}
        </div>
        <aside class="rq-side">
          ${coord ? `<section class="panel"><div class="panel-head"><h2>${esc(t('request.actions'))}</h2><span class="badge badge-assigned">${esc(t('role.coordinator'))}</span></div>
            <div class="panel-body action-stack">
              <a class="btn btn-block" href="${withCity(`/events/${e.id}/edit`)}">${icon('edit')}${esc(t('event.edit'))}</a>
              ${e.verification_status === 'verified'
                ? `<button class="btn btn-block" data-ev-act="unverify">${icon('info')}${esc(t('event.markUnverified'))}</button>`
                : `<button class="btn btn-success btn-block" data-ev-act="verify">${icon('shield')}${esc(t('event.markVerified'))}</button>`}
              ${resolved
                ? `<button class="btn btn-block" data-ev-act="reopen">${icon('refresh')}${esc(t('event.reopen'))}</button>`
                : `<button class="btn btn-block" data-ev-act="resolve">${icon('checkCircle')}${esc(t('event.resolve'))}</button>`}
              <p class="hint">${esc(t('event.noMassNotify'))}</p>
            </div></section>` : ''}
          <section class="panel">
            <div class="panel-head"><h2>${esc(t('request.details'))}</h2></div>
            <div class="panel-body">
              <dl class="kv">
                <dt>${esc(t('disaster.type'))}</dt><dd>${esc(t(`dtype.${e.type_code}`))}</dd>
                <dt>${esc(t('disaster.activity'))}</dt><dd>${esc(t(`activity.${e.activity_status}`))}</dd>
                <dt>${esc(t('disaster.verification'))}</dt><dd>${esc(t(`verify.${e.verification_status}`))}${e.verified_at ? `<br><span class="muted">${esc(fmtDate(e.verified_at))}${e.verified_by_name ? ' · ' : ''}</span>${e.verified_by_name ? ugc(e.verified_by_name) : ''}` : ''}</dd>
                <dt>${esc(t('event.f.started_at'))}</dt><dd>${esc(fmtDate(e.started_at))}</dd>
                ${e.ended_at ? `<dt>${esc(t('event.endedAt'))}</dt><dd>${esc(fmtDate(e.ended_at))}</dd>` : ''}
                <dt>${esc(t('event.lastUpdate'))}</dt><dd>${esc(fmtDate(e.updated_at))}</dd>
                ${areas.length ? `<dt>${esc(t('event.area'))}</dt><dd>${esc(areas.join(', '))}</dd>` : ''}
                ${e.location_note ? `<dt>${esc(t('event.f.location_note'))}</dt><dd>${ugc(e.location_note, e.content_lang)}</dd>` : ''}
                ${e.radius_km ? `<dt>${esc(t('event.f.radius_km'))}</dt><dd>≈ ${esc(fmtKm(e.radius_km))} ${esc(t('unit.km'))}</dd>` : ''}
                <dt>${esc(t('event.source'))}</dt><dd>${e.source_name ? ugc(e.source_name, e.content_lang) : esc(t('event.noSource'))}${e.source_url ? `<br><a href="${esc(e.source_url)}" target="_blank" rel="noopener nofollow">${icon('external').replace('<svg class=""', '<svg class="ico-inline"')} ${esc(t('event.sourceLink'))}</a>` : ''}</dd>
              </dl>
              <div class="mini-map" id="ev-map" style="margin-top:18px;height:260px" aria-label="${esc(t('event.mapAria'))}"></div>
              <p class="hint" style="margin-top:8px">${esc(t('event.mapHint'))}</p>
            </div>
          </section>
        </aside>
      </div>
    </div>`;
    drawMap();
    mountNeeds($('#needs-board', R), id, { query: ctx.query, onCleanup: ctx.onCleanup });
    $('#want-help', R).addEventListener('click', (ev) => { ev.preventDefault(); $('#related', R).scrollIntoView({ behavior: 'smooth' }); });
    $('#need-help', R).addEventListener('click', (ev) => { if (resolved) ev.preventDefault(); });
    $$('[data-ev-act]', R).forEach((b) => b.addEventListener('click', () => onAct(b)));
  }

  function drawMap() {
    const el = $('#ev-map', R);
    const e = d.event;
    if (!hasLeaflet()) { el.innerHTML = `<div class="map-unavailable"><p class="muted">${esc(t('map.unavailable'))}</p></div>`; return; }
    const pt = eventPoint(e);
    if (!pt) { el.hidden = true; return; }
    try {
      map = createMap(el, { center: pt, zoom: e.radius_km ? 9 : 10 });
      const pts = [pt];
      if (e.radius_km && e.lat != null) {
        const c = L.circle(pt, { radius: e.radius_km * 1000, color: e.type_color, weight: 2, dashArray: '6 6', fillOpacity: 0.1 }).addTo(map);
        map.fitBounds(c.getBounds().pad(0.1));
      }
      L.marker(pt, { icon: eventIcon(e) }).addTo(map);
      for (const a of e.areas || []) {
        const c = a.city_id && state.citiesById.get(a.city_id);
        if (c) {
          L.circleMarker([c.lat, c.lng], { radius: 7, color: e.type_color, weight: 2, fillOpacity: 0.5 }).bindTooltip(cityLabel(c)).addTo(map);
          pts.push([c.lat, c.lng]);
        }
      }
      if (pts.length > 1 && !e.radius_km) map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 11 });
    } catch { el.innerHTML = `<div class="map-unavailable"><p class="muted">${esc(t('map.unavailable'))}</p></div>`; }
  }

  async function onAct(b) {
    const act = b.dataset.evAct;
    const endpoint = act === 'verify' || act === 'unverify' ? 'verification' : 'activity';
    const status = { verify: 'verified', unverify: 'unverified', resolve: 'resolved', reopen: 'active' }[act];
    reasonDialog({
      title: b.textContent.trim(), label: t('common.comment'), required: false, min: 0, okLabel: t('common.confirm'), fieldName: 'note',
      text: act === 'verify' ? t('event.verifyText') : '',
      onSubmit: async (note) => {
        await api(`/events/${id}/${endpoint}`, { method: 'POST', body: { status, note } });
        toast(t('event.saved'), { type: 'success' });
        await load({ keepScroll: true });
      },
    });
    void withBusy; void toastError;
  }

  ctx.on('event-changed', (e) => { if (e.id === id) load({ keepScroll: true }); });
  ctx.onCleanup(() => map?.remove());
  await load();
}
