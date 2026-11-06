// «Ұйым кабинеті»: команда, кіріс өтініштер, жұмыстағы және аяқталған көмек, тексеру кезегі, көмек нәтижелері.
// Барлық рұқсатты сервер тексереді: координатор тек өз ұйымының тапсырмаларын басқарады.
import { api, ApiError } from '../api.js';
import { state, cityLabel } from '../state.js';
import { icon } from '../icons.js';
import { esc, catLabel, timeAgo, fmtDate, ugc, avatar, loadingState, errorState, emptyState, toast, toastError, withBusy, confirmDialog, $, $$ } from '../ui.js';
import { t, getLang, num } from '../i18n.js';
import { withCity } from '../router.js';
import { requestCard } from '../components.js';
import { citySelect } from '../city-picker.js';

const TABS = ['incoming', 'active', 'done', 'review', 'team', 'report'];
const ACTIVE_STATUSES = ['open', 'assigned', 'in_progress', 'awaiting_confirmation'];
const DAY = 864e5;
const ymd = (d) => new Date(d.getTime() + 5 * 3600e3).toISOString().slice(0, 10);

export default async function orgPage(ctx) {
  document.title = `${t('org.title')} — QamqorMap`;
  const R = ctx.root;
  const q = ctx.query;
  const orgs = state.user?.orgs || [];
  if (!orgs.length) {
    R.innerHTML = `<div class="container" style="padding-top:32px"><div class="card">${emptyState({ title: t('org.noOrg'), text: t('org.noOrgText'), ico: 'users' })}</div></div>`;
    return;
  }
  const orgId = Number(q.get('org')) && orgs.some((o) => o.id === Number(q.get('org'))) ? Number(q.get('org')) : orgs[0].id;
  const my = orgs.find((o) => o.id === orgId);
  const isCoord = my.role === 'coordinator';
  const f = {
    tab: TABS.includes(q.get('tab')) ? q.get('tab') : 'incoming',
    city: q.get('city_f') ?? String(my.city_id || ''),
    cat: q.get('cat') || '', status: q.get('status') || '', event: q.get('event') || '',
    preset: ['7', '30', '90', 'custom'].includes(q.get('preset')) ? q.get('preset') : '30',
    from: q.get('from') || '', to: q.get('to') || '',
  };
  let events = [];
  let info = null;

  function syncUrl() {
    const u = new URL(location.href);
    const set = (k, v) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set('org', orgs.length > 1 ? String(orgId) : '');
    set('tab', f.tab); u.searchParams.set('city_f', f.city); set('cat', f.cat); set('status', f.status); set('event', f.event);
    set('preset', f.tab === 'report' ? f.preset : ''); set('from', f.preset === 'custom' ? f.from : ''); set('to', f.preset === 'custom' ? f.to : '');
    history.replaceState(history.state, '', u);
  }

  R.innerHTML = `<div class="container">${loadingState()}</div>`;
  try {
    [info, { items: events }] = await Promise.all([api(`/orgs/${orgId}`), api('/events', { query: { limit: 200 } })]);
  } catch (err) {
    R.innerHTML = `<div class="container" style="padding-top:32px">${errorState(err)}</div>`;
    R.querySelector('[data-retry]')?.addEventListener('click', () => orgPage(ctx));
    return;
  }

  R.innerHTML = `
  <div class="container">
    <div class="page-head dash-head">
      <div><span class="eyebrow">${esc(t('org.title'))}</span>
        <h1 data-ugc>${esc(info.org.name)}</h1>
        <p class="lead">${esc(t('org.lead'))}</p>
        <div class="row" style="gap:8px;margin-top:6px">
          <span class="badge badge-assigned">${esc(t(`org.roles.${info.role}`))}</span>
          ${info.org.is_demo ? `<span class="badge badge-demo" id="org-demo">${esc(t('orgReport.demo'))}</span>` : ''}
          <span class="badge">${icon('users').replace('<svg class=""', '<svg class="ico-sm"')}${info.counts.members}</span>
        </div></div>
      ${orgs.length > 1 ? `<div><label class="sr-only" for="org-pick">${esc(t('org.selectOrg'))}</label><select class="select" id="org-pick">${orgs.map((o) => `<option value="${o.id}" ${o.id === orgId ? 'selected' : ''} data-ugc>${esc(o.name)}</option>`).join('')}</select></div>` : ''}
    </div>
    <div class="tabs" role="tablist" aria-label="${esc(t('org.title'))}">
      ${TABS.map((k) => `<button class="tab" role="tab" data-tab="${k}" id="otab-${k}" aria-selected="${k === f.tab}" tabindex="${k === f.tab ? 0 : -1}" aria-controls="opanel">${esc(t(`org.tabs.${k}`))}</button>`).join('')}
    </div>
    <form class="mt-row org-filters" id="org-filters" style="margin-top:16px"></form>
    <div id="opanel" role="tabpanel" style="margin-top:16px"></div>
  </div>`;

  $('#org-pick', R)?.addEventListener('change', (e) => { location.href = withCity(`/org?org=${e.target.value}`); });
  $$('[data-tab]', R).forEach((b) => b.addEventListener('click', () => { f.tab = b.dataset.tab; f.status = ''; drawTabs(); load(); }));

  function drawTabs() {
    $$('[data-tab]', R).forEach((b) => { const on = b.dataset.tab === f.tab; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  }

  function filtersHtml() {
    if (f.tab === 'team') return '';
    const evOpts = events.map((e) => `<option value="${e.id}" ${String(e.id) === f.event ? 'selected' : ''} data-ugc>${esc(e.title)}${e.is_demo ? ` (${esc(t('demo.eventBadge'))})` : ''}</option>`).join('');
    const city = `<span class="field-inline"><label for="of-city">${esc(t('org.filters.city'))}</label>${citySelect('city', f.city ? Number(f.city) : '', { required: false, id: 'of-city' }).replace(`>${esc(t('city.choose'))}<`, `>${esc(t('city.all'))}<`)}</span>`;
    const event = `<span class="field-inline"><label for="of-event">${esc(t('org.filters.event'))}</label><select class="select" id="of-event" name="event"><option value="">${esc(t('org.filters.noEvent'))}</option>${evOpts}</select></span>`;
    if (f.tab === 'report') {
      return `${['7', '30', '90'].map((p) => `<button type="button" class="chip ${f.preset === p ? 'is-on' : ''}" data-preset="${p}" aria-pressed="${f.preset === p}">${esc(t(`orgReport.last${p}`))}</button>`).join('')}
        <span class="field-inline"><label for="of-from">${esc(t('orgReport.from'))}</label><input class="input" type="date" id="of-from" name="from" value="${esc(f.from)}"></span>
        <span class="field-inline"><label for="of-to">${esc(t('orgReport.to'))}</label><input class="input" type="date" id="of-to" name="to" value="${esc(f.to)}"></span>
        ${city}${event}`;
    }
    return `${city}
      <span class="field-inline"><label for="of-cat">${esc(t('org.filters.category'))}</label><select class="select" id="of-cat" name="cat"><option value="">${esc(t('org.filters.any'))}</option>
        ${state.categories.map((c) => `<option value="${c.id}" ${String(c.id) === f.cat ? 'selected' : ''}>${esc(catLabel(c.code))}</option>`).join('')}</select></span>
      ${f.tab === 'active' ? `<span class="field-inline"><label for="of-status">${esc(t('org.filters.status'))}</label><select class="select" id="of-status" name="status"><option value="">${esc(t('org.filters.any'))}</option>
        ${ACTIVE_STATUSES.map((s) => `<option value="${s}" ${s === f.status ? 'selected' : ''}>${esc(t(`status.${s}`))}</option>`).join('')}</select></span>` : ''}
      ${event}`;
  }

  function bindFilters() {
    const form = $('#org-filters', R);
    form.innerHTML = filtersHtml();
    form.onchange = (e) => {
      const el = e.target;
      if (el.name === 'city') f.city = el.value;
      if (el.name === 'cat') f.cat = el.value;
      if (el.name === 'status') f.status = el.value;
      if (el.name === 'event') f.event = el.value;
      if (el.name === 'from' || el.name === 'to') { f[el.name] = el.value; f.preset = 'custom'; }
      load();
    };
    $$('[data-preset]', form).forEach((b) => b.addEventListener('click', () => { f.preset = b.dataset.preset; f.from = ''; f.to = ''; load(); }));
  }

  function period() {
    if (f.preset === 'custom' && f.from && f.to) return { from: f.from, to: f.to };
    const days = Number(f.preset === 'custom' ? 30 : f.preset);
    return { from: ymd(new Date(Date.now() - (days - 1) * DAY)), to: ymd(new Date()) };
  }

  async function load() {
    syncUrl();
    bindFilters();
    const P = $('#opanel', R);
    if (!isCoord) { P.innerHTML = `<div class="card">${errorState(new ApiError(403, '', { code: 'ORG_COORDINATOR_ONLY' }), { retry: false })}</div>`; return; }
    P.innerHTML = loadingState();
    try {
      if (f.tab === 'team') return drawTeam(P, (await api(`/orgs/${orgId}/members`)).items);
      if (f.tab === 'report') return drawReport(P);
      const { items } = await api(`/orgs/${orgId}/requests`, { query: { view: f.tab, city_id: f.city, category_id: f.cat, status: f.status, event_id: f.event } });
      drawRequests(P, items);
    } catch (err) {
      P.innerHTML = errorState(err);
      P.querySelector('[data-retry]')?.addEventListener('click', load);
    }
  }

  function drawTeam(P, items) {
    P.innerHTML = items.length ? `<div class="org-team">${items.map((m) => `<div class="card card-pad org-member" data-member="${m.id}">
      <div class="row" style="gap:12px">${avatar(m.full_name)}<div class="grow"><strong data-ugc>${esc(m.full_name)}</strong>
        <div class="muted">${esc(t(`org.roles.${m.role}`))}${m.city_id ? ' · ' + esc(cityLabel(m.city_id)) : ''}${m.district ? ' · ' + ugc(m.district) : ''}</div></div></div>
      ${m.categories.length ? `<div class="row" style="gap:6px;margin-top:10px">${m.categories.map((c) => `<span class="badge">${esc(catLabel(c, true))}</span>`).join('')}</div>` : ''}
      <div class="muted" style="margin-top:8px;font-size:var(--fs-sm)">${esc(t('org.activeTasks', { count: m.active_tasks }))} · ${esc(t('org.completed', { count: m.completed }))}
        ${m.disaster_support ? ` · <span class="badge badge-open">${esc(t('org.disasterReady'))}</span>` : ''}</div>
      ${m.phone ? `<div style="margin-top:6px">${icon('phone').replace('<svg class=""', '<svg class="ico-inline"')} <a href="tel:${esc(m.phone.replace(/[^\d+]/g, ''))}">${esc(m.phone)}</a></div>` : ''}
    </div>`).join('')}</div>` : `<div class="card">${emptyState({ title: t('org.empty.team'), ico: 'users' })}</div>`;
  }

  function offersHtml(r) {
    if (!r.team_offers) return '';
    const canChoose = r.org_id === orgId && r.status === 'open';
    return `<div class="org-offers">
      <strong>${esc(t('org.teamOffers', { count: r.team_offers.length }))}</strong>
      ${r.team_offers.length ? r.team_offers.map((o) => `<div class="org-offer">
        <div class="grow"><b data-ugc>${esc(o.full_name)}</b>
          <div class="row" style="gap:6px;margin-top:4px">
            <span class="badge">${icon('pin').replace('<svg class=""', '<svg class="ico-sm"')}${esc(o.volunteer_city_id ? cityLabel(o.volunteer_city_id) : '—')}</span>
            <span class="badge ${o.category_match ? 'badge-completed' : 'badge-pending'}">${esc(t(o.category_match ? 'org.categoryMatch' : 'org.categoryNo'))}</span>
            ${o.categories.slice(0, 4).map((c) => `<span class="badge">${esc(catLabel(c, true))}</span>`).join('')}
          </div>
          ${o.message ? `<p class="muted" data-ugc style="margin:6px 0 0">${esc(o.message)}</p>` : ''}</div>
        ${canChoose ? `<button class="btn btn-primary btn-sm" type="button" data-assign="${o.application_id}" data-rid="${r.request_id}" data-name="${esc(o.full_name)}">${icon('check')}${esc(t('org.choose'))}</button>` : ''}
      </div>`).join('') : `<p class="muted">${esc(t('org.noTeamOffers'))}</p>`}
      ${r.other_offers ? `<p class="hint">${esc(t('org.otherOffers', { count: r.other_offers }))}</p>` : ''}
    </div>`;
  }

  function drawRequests(P, items) {
    if (!items.length) {
      P.innerHTML = `<div class="card">${emptyState({ title: t(`org.empty.${f.tab}`), text: t('org.empty.hint'), ico: 'inbox' })}</div>`;
      return;
    }
    P.innerHTML = `${f.tab === 'review' ? `<div class="alert alert-info" style="margin-bottom:14px">${icon('info')}<div>${esc(t('org.reviewHint'))}</div></div>` : ''}
      ${f.tab === 'incoming' ? `<p class="hint" style="margin-bottom:12px">${esc(t('org.acceptHint'))}</p>` : ''}
      <div class="org-list">${items.map((r) => `<div class="org-row" data-org-request="${r.id}">
        ${requestCard(r, { compact: true })}
        <div class="org-side">
          ${r.org_accepted_at ? `<div class="muted">${icon('checkCircle').replace('<svg class=""', '<svg class="ico-inline"')} ${esc(t('org.acceptedAt', { time: fmtDate(r.org_accepted_at) }))}</div>` : ''}
          ${r.assignee_name ? `<div>${icon('hand').replace('<svg class=""', '<svg class="ico-inline"')} <span data-ugc>${esc(t('org.assignee', { name: r.assignee_name }))}</span></div>` : ''}
          ${r.disaster_event_id ? `<a class="muted" href="${withCity(`/events/${r.disaster_event_id}?n_state=need_executor`)}">${icon('list').replace('<svg class=""', '<svg class="ico-inline"')} ${esc(t('org.needsLink'))}</a>` : ''}
          ${f.tab === 'incoming' ? `<button class="btn btn-primary btn-sm" type="button" data-accept="${r.id}">${icon('plus')}${esc(t('org.accept'))}</button>` : ''}
          ${f.tab !== 'review' ? `<a class="btn btn-sm" href="${withCity(`/requests/${r.id}`)}">${esc(t('org.openRequest'))}</a>` : ''}
          ${offersHtml({ ...r, request_id: r.id })}
        </div></div>`).join('')}</div>`;
    $$('[data-accept]', P).forEach((b) => b.addEventListener('click', () => withBusy(b, async () => {
      try {
        await api(`/orgs/${orgId}/requests/${b.dataset.accept}/accept`, { method: 'POST' });
        toast(t('org.acceptedDone'), { type: 'success' });
        f.tab = 'active'; drawTabs(); await load();
      } catch (err) { toastError(err); await load(); }
    })));
    $$('[data-assign]', P).forEach((b) => b.addEventListener('click', () => confirmDialog({
      title: t('request.dlg.assignTitle'), text: t('request.dlg.assignText', { name: b.dataset.name }), okLabel: t('request.dlg.assignOk'),
      onConfirm: async () => {
        try {
          await api(`/requests/${b.dataset.rid}/assign`, { method: 'POST', body: { application_id: Number(b.dataset.assign) } });
          toast(t('org.assignedDone'), { type: 'success' });
        } catch (err) { toastError(err); }
        await load();
      },
    })));
  }

  async function drawReport(P) {
    const per = period();
    const query = { ...per, city_id: f.city, event_id: f.event };
    const rep = await api(`/orgs/${orgId}/report`, { query });
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)), lang: getLang() });
    const empty = !rep.accepted && !rep.confirmed && !rep.open_need && !rep.median_n;
    const metric = (id, label, hint, value, extra = '') => `<div class="card card-pad org-metric" id="m-${id}">
      <span class="org-metric-val">${value}</span><strong>${esc(label)}</strong><p class="muted">${esc(hint)}</p>${extra}</div>`;
    P.innerHTML = `
      <div class="row" style="justify-content:space-between;gap:12px;margin-bottom:12px">
        <div><h2 style="font-size:1.4rem">${esc(t('orgReport.title'))}</h2>
          <p class="muted">${esc(t('orgReport.period'))}: ${esc(fmtDate(per.from + 'T00:00:00+05:00', { time: false }))} — ${esc(fmtDate(per.to + 'T00:00:00+05:00', { time: false }))} · ${esc(t('orgReport.source'))}</p></div>
        <div class="row" style="gap:8px">${rep.demo ? `<span class="badge badge-demo" id="report-demo">${esc(t('orgReport.demo'))}</span>` : ''}
          <a class="btn btn-primary" id="csv-link" href="/api/orgs/${orgId}/report.csv?${qs}" download>${icon('external')}${esc(t('orgReport.csv'))}</a></div>
      </div>
      <p class="hint" style="margin-bottom:12px">${esc(t('orgReport.csvHint'))}</p>
      ${empty ? `<div class="card" id="report-empty">${emptyState({ title: t('orgReport.empty'), text: t('orgReport.emptyText'), ico: 'inbox' })}</div>` : `
      <div class="org-metrics">
        ${metric('accepted', t('orgReport.accepted'), t('orgReport.acceptedHint'), num(rep.accepted))}
        ${metric('confirmed', t('orgReport.confirmed'), t('orgReport.confirmedHint'), num(rep.confirmed))}
        ${metric('open', t('orgReport.openNeed'), t('orgReport.openNeedHint'), num(rep.open_need))}
        ${metric('median', t('orgReport.median'), t('orgReport.medianHint'),
          rep.median_hours == null ? '—' : esc(t('orgReport.hours', { n: num(rep.median_hours, { maximumFractionDigits: 1 }) })),
          `<p class="hint">${esc(rep.median_n ? t('orgReport.medianN', { count: rep.median_n }) : t('orgReport.medianEmpty'))}</p>`)}
      </div>
      ${rep.by_category.length ? `<h3 style="margin:20px 0 10px">${esc(t('orgReport.byCategory'))}</h3>
      <div class="table-wrap"><table class="needs-table" id="report-cats"><thead><tr><th>${esc(t('orgReport.category'))}</th>
        <th class="num">${esc(t('orgReport.accepted'))}</th><th class="num">${esc(t('orgReport.confirmed'))}</th><th class="num">${esc(t('orgReport.openNeed'))}</th></tr></thead>
        <tbody>${rep.by_category.map((c) => `<tr><td>${esc(catLabel(c.code))}</td><td class="num">${c.accepted}</td><td class="num">${c.confirmed}</td><td class="num">${c.open_need}</td></tr>`).join('')}</tbody></table></div>` : ''}`}`;
  }

  drawTabs();
  load();
  void timeAgo;
}
