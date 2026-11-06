import { api } from '../api.js';
import { state, cityName, regionLabel } from '../state.js';
import { icon, DISASTER_ICON } from '../icons.js';
import { esc, skeletonCards, emptyState, errorState, openDialog, field, showErrors, formData, toast, $, $$ } from '../ui.js';
import { t, getLang } from '../i18n.js';
import { eventCard, emergencyNotice } from '../components.js';
import { withCity, navigate } from '../router.js';
import { citySelect, regions as regionCodes } from '../city-picker.js';

export default async function disasters(ctx) {
  document.title = `${t('dir.disaster')} — QamqorMap`;
  const q = ctx.query;
  const f = {
    type: q.get('type') || '',
    activity: ['active', 'resolved', 'any'].includes(q.get('activity')) ? q.get('activity') : 'active',
    verif: ['verified', 'unverified'].includes(q.get('verif')) ? q.get('verif') : '',
    region: q.get('region') || '',
  };
  const R = ctx.root;
  R.innerHTML = `
  <div class="container">
    <div class="page-head dash-head">
      <div><span class="eyebrow" style="color:#B42318">${esc(t('dir.disaster'))}</span><h1>${esc(t('disaster.pageTitle'))}</h1>
        <p class="lead">${esc(t('disaster.pageLead'))}</p></div>
      <div class="row">
        <button class="btn btn-lg" type="button" id="report-btn">${icon('flag')}${esc(t('disaster.reportBtn'))}</button>
        ${state.user?.is_coordinator ? `<a class="btn btn-lg btn-primary" href="${withCity('/events/new')}">${icon('plus')}${esc(t('coord.newEvent'))}</a>` : ''}
      </div>
    </div>
    ${emergencyNotice()}
    <div class="dis-explain">
      <div class="dis-explain-item">${icon('alert')}<div><strong>${esc(t('disaster.explainEventTitle'))}</strong><p>${esc(t('disaster.explainEvent'))}</p></div></div>
      <div class="dis-explain-item">${icon('hand')}<div><strong>${esc(t('disaster.explainRequestTitle'))}</strong><p>${esc(t('disaster.explainRequest'))}</p></div></div>
      <div class="dis-explain-item">${icon('shield')}<div><strong>${esc(t('disaster.explainVerifyTitle'))}</strong><p>${esc(t('disaster.explainVerify'))}</p></div></div>
    </div>
    <form class="mt-row dis-filters" id="dis-filters" aria-label="${esc(t('map.filtersAria'))}">
      <label class="sr-only" for="dtype">${esc(t('disaster.type'))}</label>
      <select class="select" id="dtype" name="type"><option value="">${esc(t('disaster.anyType'))}</option>
        ${state.disasterTypes.map((d) => `<option value="${d.code}" ${d.code === f.type ? 'selected' : ''}>${esc(t(`dtype.${d.code}`))}</option>`).join('')}</select>
      <label class="sr-only" for="dact">${esc(t('disaster.activity'))}</label>
      <select class="select" id="dact" name="activity">${['active', 'resolved', 'any'].map((a) => `<option value="${a}" ${a === f.activity ? 'selected' : ''}>${esc(t(`disaster.activityOpt.${a}`))}</option>`).join('')}</select>
      <label class="sr-only" for="dverif">${esc(t('disaster.verification'))}</label>
      <select class="select" id="dverif" name="verif"><option value="">${esc(t('disaster.anyVerification'))}</option>
        <option value="verified" ${f.verif === 'verified' ? 'selected' : ''}>${esc(t('verify.verified'))}</option>
        <option value="unverified" ${f.verif === 'unverified' ? 'selected' : ''}>${esc(t('verify.unverified'))}</option></select>
      <span id="dregion-wrap" ${state.cityId ? 'hidden' : ''}><label class="sr-only" for="dregion">${esc(t('disaster.region'))}</label>
        <select class="select" id="dregion" name="region"><option value="">${esc(t('city.allRegions'))}</option>
        ${regionCodes().filter((r) => r !== 'rep').map((r) => `<option value="${r}" ${r === f.region ? 'selected' : ''}>${esc(regionLabel(r))}</option>`).join('')}</select></span>
      <a class="btn btn-sm" href="${withCity('/map?dir=disaster')}">${icon('map')}${esc(t('disaster.onMap'))}</a>
    </form>
    <div class="map-list-head" style="margin-top:8px"><h2 id="dis-h" style="font-size:1.4rem">…</h2></div>
    <div class="ev-grid" id="ev-grid" aria-live="polite">${skeletonCards(3)}</div>
  </div>`;

  const form = $('#dis-filters', R);
  function syncUrl() {
    const u = new URL(location.href);
    const set = (k, v) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set('type', f.type);
    set('activity', f.activity !== 'active' ? f.activity : '');
    set('verif', f.verif);
    set('region', state.cityId ? '' : f.region);
    history.replaceState(history.state, '', u);
  }

  async function load() {
    syncUrl();
    const grid = $('#ev-grid', R);
    grid.innerHTML = skeletonCards(3);
    try {
      const { items } = await api('/events', { query: {
        city_id: state.cityId, region: state.cityId ? '' : f.region, type: f.type,
        activity: f.activity === 'any' ? '' : f.activity, verification: f.verif,
      } });
      $('#dis-h', R).textContent = t('disaster.listTitle', { city: cityName(), count: items.length });
      grid.innerHTML = items.length
        ? items.map((e) => eventCard(e)).join('')
        : `<div class="card" style="grid-column:1/-1">${emptyState({ title: t('disaster.noEventsFilter'), text: t('disaster.noEventsFilterHint'), ico: 'shield' })}</div>`;
    } catch (err) {
      grid.innerHTML = `<div style="grid-column:1/-1">${errorState(err)}</div>`;
      grid.querySelector('[data-retry]')?.addEventListener('click', load);
    }
  }
  form.addEventListener('change', () => {
    const d = formData(form);
    Object.assign(f, { type: d.type, activity: d.activity, verif: d.verif, region: d.region || '' });
    load();
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  $('#report-btn', R).addEventListener('click', () => {
    if (!state.user) {
      navigate(`/login?next=${encodeURIComponent('/disasters')}`);
      return;
    }
    openReportDialog();
  });

  ctx.on('city', () => { $('#dregion-wrap', R).hidden = !!state.cityId; load(); });
  ctx.on('event-changed', load);
  await load();
}

/** Ықтимал апат туралы хабар: жария етілмейді, координатор тексереді */
export function openReportDialog() {
  const { dlg } = openDialog({
    title: t('disaster.reportTitle'),
    body: `<form class="stack" novalidate id="report-form">
      <div class="alert alert-info">${icon('info')}<div>${esc(t('disaster.reportIntro'))}</div></div>
      ${emergencyNotice()}
      ${field({ name: 'type', label: t('disaster.type'), required: true, control: `<select class="select" id="f-type" name="type"><option value="">${esc(t('disaster.chooseType'))}</option>
        ${state.disasterTypes.map((d) => `<option value="${d.code}">${esc(t(`dtype.${d.code}`))}</option>`).join('')}</select>` })}
      ${field({ name: 'city_id', label: t('disaster.nearestCity'), required: true, control: citySelect('city_id', state.cityId, { required: false }) })}
      ${field({ name: 'description', label: t('disaster.reportDesc'), required: true, hint: t('disaster.reportDescHint'), control: '<textarea class="textarea" id="f-description" name="description" maxlength="2000"></textarea>' })}
      ${field({ name: 'source_name', label: t('event.source'), hint: t('disaster.sourceHint'), control: '<input class="input" id="f-source_name" name="source_name" maxlength="160">' })}
      ${field({ name: 'source_url', label: t('event.sourceLink'), control: '<input class="input" id="f-source_url" name="source_url" type="url" maxlength="300" placeholder="https://">' })}
      <div class="form-alert" tabindex="-1"></div>
    </form>`,
    actions: [
      { label: t('common.cancel'), cls: 'btn-ghost' },
      { label: t('disaster.reportSend'), cls: 'btn-primary', icon: 'send', onClick: async ({ close, dlg: d }) => {
        const form = d.querySelector('form');
        const v = formData(form);
        const errs = {};
        if (!v.type) errs.type = { code: 'REQUIRED' };
        if (!v.city_id) errs.city_id = { code: 'REQUIRED' };
        if (!v.description || v.description.trim().length < 20) errs.description = { code: v.description ? 'MIN_LENGTH' : 'REQUIRED', params: { min: 20 } };
        if (Object.keys(errs).length) return showErrors(form, { message: t('errors.VALIDATION'), fields: errs });
        try {
          await api('/disaster-reports', { method: 'POST', body: { ...v, city_id: Number(v.city_id), content_lang: getLang() } });
          close();
          toast(t('disaster.reportSent'), { type: 'success', timeout: 7000 });
        } catch (err) { showErrors(form, err); }
      } },
    ],
  });
  setTimeout(() => dlg.querySelector('select')?.focus(), 30);
  void $$; void DISASTER_ICON;
}
