import { api, ApiError } from '../api.js';
import { state, cityName, setCity, cityLabel } from '../state.js';
import { icon } from '../icons.js';
import {
  esc, stateBadges, catBadge, urgencyBadge, demoBadge, disasterBadge, fmtDate, timeAgo, fmtNum, fmtDecimal, ugc, catLabel, fmtKm,
  loadingState, errorState, emptyState, toast, toastError, withBusy, reasonDialog, openDialog, field, showErrors, $, $$,
} from '../ui.js';
import { t, th } from '../i18n.js';
import { withCity, navigate } from '../router.js';
import { openCityPicker } from '../city-picker.js';

const VIEWS = [
  ['queue', 'pending'], ['disputes', 'disputes'], ['active', 'active'], ['open', 'open'],
  ['completed', 'completed'], ['rejected', 'rejected'], ['cancelled', 'cancelled'], ['reports', 'reports'],
];

function reasonParams(p = {}) {
  const out = { ...p };
  if (p.category) out.category = catLabel(p.category);
  if (p.km != null) out.km = fmtKm(p.km);
  return out;
}

export default async function coordinator(ctx) {
  document.title = `${t('nav.coordPanel')} — QamqorMap`;
  const R = ctx.root;
  if (!state.user.is_coordinator) {
    R.innerHTML = `<div class="container" style="padding-top:32px">${errorState(new ApiError(403, '', { code: 'COORDINATOR_ONLY' }))}</div>`;
    return;
  }
  let view = VIEWS.some(([k]) => k === ctx.query.get('view')) ? ctx.query.get('view') : 'queue';
  let category = ctx.query.get('category') || '';
  let direction = ['everyday', 'disaster'].includes(ctx.query.get('direction')) ? ctx.query.get('direction') : '';

  R.innerHTML = `
  <div class="container">
    <div class="page-head dash-head">
      <div><span class="eyebrow">${esc(t('nav.coordPanel'))}</span><h1>${esc(t('coord.title'))}</h1>
        <p class="lead">${esc(t('coord.lead'))}</p></div>
      <div class="row">
        <a class="btn btn-lg btn-primary" href="${withCity('/events/new')}">${icon('plus')}${esc(t('coord.newEvent'))}</a>
        <button class="btn btn-lg" type="button" id="coord-city">${icon('pin')}<span id="coord-city-name">${esc(cityName())}</span>${icon('chevDown')}</button>
        <label class="sr-only" for="coord-dir">${esc(t('dir.label'))}</label>
        <select class="select" id="coord-dir" style="width:auto;min-height:56px">
          <option value="">${esc(t('dir.all'))}</option>
          <option value="everyday" ${direction === 'everyday' ? 'selected' : ''}>${esc(t('dir.everyday'))}</option>
          <option value="disaster" ${direction === 'disaster' ? 'selected' : ''}>${esc(t('dir.disaster'))}</option>
        </select>
        <label class="sr-only" for="coord-cat">${esc(t('form.category'))}</label>
        <select class="select" id="coord-cat" style="width:auto;min-height:56px">
          <option value="">${esc(t('map.allCategories'))}</option>
          ${state.categories.map((c) => `<option value="${c.id}" ${String(c.id) === category ? 'selected' : ''}>${esc(catLabel(c.code))}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="tabs" role="tablist" aria-label="${esc(t('coord.tabsAria'))}">
      ${VIEWS.map(([k, ck]) => `<button class="tab" role="tab" data-view="${k}" aria-selected="${k === view}" tabindex="${k === view ? 0 : -1}" id="ctab-${k}" aria-controls="cpanel">${esc(t(`coord.views.${k}`))}<span class="count" data-c="${ck}">…</span></button>`).join('')}
    </div>
    <div class="coord-grid" style="margin-top:22px">
      <div id="cpanel" role="tabpanel" aria-labelledby="ctab-${view}"></div>
      <aside class="stack">
        <section class="panel"><div class="panel-head"><h2>${esc(t('coord.statsTitle'))}</h2><span class="muted" style="font-size:var(--fs-sm)" id="st-city"></span></div>
          <div class="panel-body" id="coord-stats">${loadingState()}</div></section>
        <section class="panel"><div class="panel-head"><h2>${esc(t('coord.recent'))}</h2></div>
          <div class="panel-body" id="coord-events">${loadingState()}</div></section>
      </aside>
    </div>
  </div>`;

  const filt = () => ({ city_id: state.cityId, category_id: category, direction });

  async function loadSide() {
    try {
      const [ov, st] = await Promise.all([api('/coordinator/overview', { query: filt() }), api('/stats', { query: { city_id: state.cityId } })]);
      for (const [, ck] of VIEWS) {
        const el = $(`[data-c="${ck}"]`, R);
        if (el) el.textContent = ov.counts[ck] ?? 0;
      }
      $('#st-city', R).textContent = cityName();
      $('#coord-stats', R).innerHTML = `
        <dl class="kv">
          <dt>${esc(t('stats.completed'))}</dt><dd>${fmtNum(st.completed)}</dd>
          <dt>${esc(t('stats.active'))}</dt><dd>${fmtNum(st.active)}</dd>
          <dt>${esc(t('stats.helpers'))}</dt><dd>${fmtNum(st.helpers)}</dd>
          <dt>${esc(t('stats.volunteers'))}</dt><dd>${fmtNum(st.volunteers)}</dd>
          <dt>${esc(t('stats.avgAssignShort'))}</dt><dd>${st.avg_hours_to_assign != null ? esc(t('unit.hoursAvg', { n: fmtDecimal(st.avg_hours_to_assign) })) : '—'}</dd>
        </dl>
        ${st.by_district.length ? `<hr class="divider"><p style="font-weight:700;font-size:var(--fs-sm)">${esc(t('coord.byDistrict'))}</p><dl class="kv" style="margin-top:8px">${st.by_district.map((x) => `<dt>${x.district ? ugc(x.district) : esc(t('coord.noDistrict'))}</dt><dd>${x.completed}</dd>`).join('')}</dl>` : ''}
        ${st.top_cities.length ? `<hr class="divider"><p style="font-weight:700;font-size:var(--fs-sm)">${esc(t('coord.topCities'))}</p><dl class="kv" style="margin-top:8px">${st.top_cities.map((x) => `<dt>${esc(cityLabel(x.id))}</dt><dd>${x.completed}</dd>`).join('')}</dl>` : ''}`;
      $('#coord-events', R).innerHTML = ov.recent.length
        ? `<ul class="ev-list">${ov.recent.map((e) => `<li><a href="${withCity(`/requests/${e.request_id}`)}">№${e.request_id} <span data-ugc>${esc(e.title)}</span></a> — ${esc(t(`reqEvent.${e.event_type}`))}${e.actor_name ? ` <span class="muted">(${ugc(e.actor_name)})</span>` : ''}<time>${esc(timeAgo(e.created_at))}</time></li>`).join('')}</ul>`
        : `<p class="muted">${esc(t('coord.noEvents'))}</p>`;
    } catch (err) {
      $('#coord-stats', R).innerHTML = errorState(err, { retry: false });
    }
  }

  async function loadPanel() {
    const p = $('#cpanel', R);
    p.innerHTML = `<div class="panel">${loadingState()}</div>`;
    try {
      if (view === 'reports') {
        const { items } = await api('/coordinator/disaster-reports');
        p.innerHTML = `<div class="alert alert-info" style="margin-bottom:14px">${icon('info')}<div>${esc(t('coord.reportsHint'))}</div></div>` + (items.length
          ? `<div class="panel">${items.map(reportCard).join('')}</div>`
          : `<div class="panel">${emptyState({ title: t('coord.noReports'), ico: 'shield' })}</div>`);
      } else if (view === 'queue') {
        const { items } = await api('/coordinator/queue', { query: filt() });
        p.innerHTML = items.length ? `<div class="panel">${items.map(queueCard).join('')}</div>`
          : `<div class="panel">${emptyState({ title: t('coord.queueEmpty'), text: t('coord.queueEmptyText', { city: cityName() }), ico: 'checkCircle' })}</div>`;
      } else {
        const { items } = await api('/coordinator/requests', { query: { ...filt(), view } });
        p.innerHTML = items.length ? `<div class="panel list-rows">${items.map(rowCard).join('')}</div>`
          : `<div class="panel">${emptyState({ title: t('coord.listEmpty'), text: t('coord.listEmptyText', { city: cityName() }), ico: 'inbox' })}</div>`;
      }
      bind(p);
    } catch (err) {
      p.innerHTML = `<div class="panel">${errorState(err)}</div>`;
      p.querySelector('[data-retry]')?.addEventListener('click', loadPanel);
    }
  }

  function queueCard(r) {
    return `<article class="q-card">
      <div class="row" style="gap:8px">${catBadge(r)}${disasterBadge(r)}${stateBadges(r)}${urgencyBadge(r.urgency)}${demoBadge(r)}</div>
      <h3 style="margin-top:10px"><a href="${withCity(`/requests/${r.id}`)}">№${r.id} <span data-ugc lang="${esc(r.content_lang)}">${esc(r.title)}</span></a></h3>
      <div class="lmeta rq-meta" style="margin-top:6px"><span>${icon('user')}${ugc(r.author_name)}</span><span>${icon('pin')}${esc(cityLabel(r.city_id))}${r.district ? ' · ' + ugc(r.district) : ''}</span><span>${icon('clock')}${esc(fmtDate(r.submitted_at || r.created_at))}</span></div>
      <p class="q-desc" data-ugc lang="${esc(r.content_lang)}">${esc(r.summary)}${r.summary.length >= 220 ? '…' : ''}</p>
      ${r.duplicates?.length ? `<div class="dup-box"><h4>${icon('copy')}${esc(t('coord.possibleDup', { count: r.duplicates.length }))}</h4>
        ${r.duplicates.map((x) => `<div class="dup-item"><a href="${withCity(`/requests/${x.id}`)}"><b>№${x.id} <span data-ugc>${esc(x.title)}</span></b></a>
          <ul>${x.reasons.map((y) => `<li>${th(`dup.${y.code}`, reasonParams(y.params), { ugc: ['district', 'words'] })}</li>`).join('')}</ul>
          <button class="btn btn-sm" data-dup="${x.id}" data-id="${r.id}">${icon('copy')}${esc(t('request.dup.mark'))}</button></div>`).join('')}
        <p class="hint" style="margin-top:8px">${esc(t('coord.dupDecision'))}</p></div>` : ''}
      <div class="row" style="margin-top:16px">
        <button class="btn btn-success" data-approve="${r.id}">${icon('checkCircle')}${esc(t('coord.approve'))}</button>
        <button class="btn" data-reject="${r.id}">${icon('edit')}${esc(t('request.act.reject'))}</button>
        <a class="btn btn-ghost" href="${withCity(`/requests/${r.id}`)}">${esc(t('common.more'))}${icon('arrowRight')}</a>
      </div></article>`;
  }

  function rowCard(r) {
    const action = r.disputed ? 'coord.resolve' : ['assigned', 'in_progress'].includes(r.status) ? 'coord.manageAssignee' : 'common.open';
    return `<div class="lrow"><div class="grow">
      <h3><a href="${withCity(`/requests/${r.id}`)}" style="color:inherit">№${r.id} <span data-ugc lang="${esc(r.content_lang)}">${esc(r.title)}</span></a></h3>
      <div class="lmeta">${catBadge(r)}${disasterBadge(r)}${stateBadges(r)}${demoBadge(r)}${r.disputed ? `<span class="badge badge-rejected">${esc(t('dash.dispute'))}</span>` : ''}
        <span>${esc(cityLabel(r.city_id))}</span><span>${esc(t('coord.author'))}: ${ugc(r.author_name)}</span>
        ${r.assignee_name ? `<span>${esc(t('request.assignee'))}: <b>${ugc(r.assignee_name)}</b></span>` : ''}
        ${r.applications_count ? `<span>${esc(t('card.offers', { count: r.applications_count }))}</span>` : ''}
        <span>${esc(timeAgo(r.updated_at))}</span></div>
      ${r.disputed && r.dispute_note ? `<p class="hint" style="margin-top:6px;color:var(--c-red)">${esc(t('dash.dispute'))}: ${ugc(r.dispute_note)}</p>` : ''}
      ${r.moderation_status === 'rejected' && (r.rejection_reason || r.duplicate_of) ? `<p class="hint" style="margin-top:6px">${esc(t('common.reason'))}: ${r.rejection_reason ? ugc(r.rejection_reason) : esc(t('request.duplicateOf', { id: r.duplicate_of }))}</p>` : ''}
    </div><div class="lactions"><a class="btn btn-sm ${r.disputed ? 'btn-primary' : 'btn-ghost'}" href="${withCity(`/requests/${r.id}`)}">${esc(t(action))}${icon('arrowRight')}</a></div></div>`;
  }

  function reportCard(x) {
    return `<article class="q-card">
      <div class="row" style="gap:8px"><span class="badge badge-ev">${esc(t(`dtype.${x.type_code}`))}</span><span class="badge badge-report-${esc(x.status)}">${esc(t(`report.status.${x.status}`))}</span>${state.citiesById.get(x.city_id) ? `<span class="badge">${esc(cityLabel(x.city_id))}</span>` : ''}</div>
      <p class="q-desc" data-ugc lang="${esc(x.content_lang)}" style="margin-top:10px">${esc(x.description)}</p>
      <div class="lmeta rq-meta" style="margin-top:6px"><span>${icon('user')}${ugc(x.reporter_name)}</span><span>${icon('clock')}${esc(fmtDate(x.created_at))}</span>
        ${x.source_name ? `<span>${icon('info')}${esc(t('event.source'))}: ${ugc(x.source_name)}</span>` : ''}
        ${x.source_url ? `<a href="${esc(x.source_url)}" target="_blank" rel="noopener nofollow">${icon('external')}${esc(t('event.sourceLink'))}</a>` : ''}
        ${x.lat != null ? `<span>${icon('pin')}${x.lat.toFixed(3)}, ${x.lng.toFixed(3)}</span>` : ''}</div>
      ${x.handle_note ? `<p class="hint">${esc(t('common.comment'))}: ${ugc(x.handle_note)}</p>` : ''}
      ${x.event_id ? `<p style="margin-top:8px"><a href="${withCity(`/events/${x.event_id}`)}">${esc(t('event.open'))} №${x.event_id}</a></p>` : ''}
      ${x.status === 'pending' ? `<div class="row" style="margin-top:14px">
        <button class="btn btn-primary btn-sm" data-rep-create="${x.id}">${icon('plus')}${esc(t('coord.report.create'))}</button>
        <button class="btn btn-sm" data-rep-link="${x.id}">${icon('copy')}${esc(t('coord.report.link'))}</button>
        <button class="btn btn-ghost btn-sm" data-rep-dismiss="${x.id}" style="color:var(--c-red)">${icon('ban')}${esc(t('coord.report.dismiss'))}</button>
      </div>` : ''}
    </article>`;
  }

  function bind(p) {
    const after = async (msg) => { toast(msg, { type: 'success' }); await Promise.all([loadPanel(), loadSide()]); };
    $$('[data-approve]', p).forEach((b) => b.addEventListener('click', () => withBusy(b, async () => {
      try {
        await api(`/requests/${b.dataset.approve}/review`, { method: 'POST', body: { decision: 'approve' } });
        await after(t('request.done.approved'));
      } catch (err) { toastError(err); loadPanel(); }
    })));
    $$('[data-reject]', p).forEach((b) => b.addEventListener('click', () => reasonDialog({
      title: t('request.act.reject'), label: t('request.dlg.rejectLabel'), okLabel: t('request.dlg.rejectOk'), okCls: 'btn-danger', placeholder: t('request.dlg.rejectPh'),
      onSubmit: async (reason) => { await api(`/requests/${b.dataset.reject}/review`, { method: 'POST', body: { decision: 'reject', reason } }); await after(t('request.done.rejected')); },
    })));
    $$('[data-dup]', p).forEach((b) => b.addEventListener('click', () => reasonDialog({
      title: t('request.dlg.dupTitle', { id: b.dataset.dup }), label: t('common.comment'), required: false, min: 0, okLabel: t('request.dup.mark'), okCls: 'btn-danger',
      text: t('request.dlg.dupText'),
      onSubmit: async (reason) => { await api(`/requests/${b.dataset.id}/duplicate`, { method: 'POST', body: { duplicate_of: Number(b.dataset.dup), reason } }); await after(t('request.done.duplicate')); },
    })));
    $$('[data-rep-create]', p).forEach((b) => b.addEventListener('click', () => navigate(`/events/new?report=${b.dataset.repCreate}`)));
    $$('[data-rep-dismiss]', p).forEach((b) => b.addEventListener('click', () => reasonDialog({
      title: t('coord.report.dismiss'), label: t('common.comment'), min: 3, okLabel: t('coord.report.dismiss'), okCls: 'btn-danger', fieldName: 'note',
      text: t('coord.report.dismissText'),
      onSubmit: async (note) => { await api(`/coordinator/disaster-reports/${b.dataset.repDismiss}/dismiss`, { method: 'POST', body: { note } }); await after(t('coord.report.dismissed')); },
    })));
    $$('[data-rep-link]', p).forEach((b) => b.addEventListener('click', async () => {
      let events = [];
      try { events = (await api('/events', { query: { limit: 100 } })).items; } catch (err) { return toastError(err); }
      openDialog({
        title: t('coord.report.link'),
        body: `<form class="stack" novalidate>${field({ name: 'event_id', label: t('form.event'), required: true, control: `<select class="select" id="f-event_id" name="ev"><option value="">${esc(t('form.chooseEvent'))}</option>
          ${events.map((e) => `<option data-ugc value="${e.id}">${esc(t(`dtype.${e.type_code}`))} — ${esc(e.title)}</option>`).join('')}</select>` })}<div class="form-alert" tabindex="-1"></div></form>`,
        actions: [
          { label: t('common.cancel'), cls: 'btn-ghost' },
          { label: t('coord.report.link'), cls: 'btn-primary', onClick: async ({ close, dlg }) => {
            const form = dlg.querySelector('form');
            try {
              await api(`/coordinator/disaster-reports/${b.dataset.repLink}/link`, { method: 'POST', body: { event_id: Number(form.ev.value) || null } });
              close();
              await after(t('coord.report.linked'));
            } catch (err) { showErrors(form, err); }
          } },
        ],
      });
    }));
  }

  const tablist = $('[role=tablist]', R);
  function selectView(k) {
    view = k;
    $$('[data-view]', R).forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.view === k)); b.tabIndex = b.dataset.view === k ? 0 : -1; });
    $('#cpanel', R).setAttribute('aria-labelledby', `ctab-${k}`);
    const url = new URL(location.href);
    url.searchParams.set('view', k);
    history.replaceState(history.state, '', url);
    loadPanel();
  }
  tablist.addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) selectView(b.dataset.view); });
  tablist.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const keys = VIEWS.map(([k]) => k);
    const i = (keys.indexOf(view) + (e.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
    selectView(keys[i]);
    $(`#ctab-${keys[i]}`, R).focus();
  });
  const syncUrl = () => {
    const url = new URL(location.href);
    if (category) url.searchParams.set('category', category); else url.searchParams.delete('category');
    if (direction) url.searchParams.set('direction', direction); else url.searchParams.delete('direction');
    history.replaceState(history.state, '', url);
  };
  $('#coord-cat', R).addEventListener('change', (e) => { category = e.target.value; syncUrl(); loadPanel(); loadSide(); });
  $('#coord-dir', R).addEventListener('change', (e) => { direction = e.target.value; syncUrl(); loadPanel(); loadSide(); });
  $('#coord-city', R).addEventListener('click', () => openCityPicker({ onPick: (id) => setCity(id) }));
  ctx.on('city', () => { $('#coord-city-name', R).textContent = cityName(); loadPanel(); loadSide(); });
  ctx.on('notification', () => { loadPanel(); loadSide(); });

  await Promise.all([loadPanel(), loadSide()]);
}
