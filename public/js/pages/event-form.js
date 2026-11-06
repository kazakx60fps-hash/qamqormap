import { api, ApiError } from '../api.js';
import { state, cityLabel, regionLabel } from '../state.js';
import { icon } from '../icons.js';
import {
  esc, field, showErrors, clearErrors, withBusy, toast, formData, localInputToIso, isoToLocalInput,
  loadingState, errorState, $, $$,
} from '../ui.js';
import { t, getLang } from '../i18n.js';
import { navigate, withCity } from '../router.js';
import { citySelect, regions as regionCodes } from '../city-picker.js';
import { createMap, hasLeaflet, meIcon, watchResize, KZ_VIEW } from '../mapkit.js';

export default async function eventForm(ctx) {
  const editId = ctx.params.id || null;
  const reportId = Number(ctx.query.get('report')) || null;
  document.title = `${t(editId ? 'event.editTitle' : 'event.newTitle')} — QamqorMap`;
  const R = ctx.root;
  if (!state.user.is_coordinator) {
    R.innerHTML = `<div class="container" style="padding-top:32px">${errorState(new ApiError(403, '', { code: 'COORDINATOR_ONLY' }))}</div>`;
    return;
  }
  R.innerHTML = `<div class="container">${loadingState()}</div>`;

  let e = { type_code: '', title: '', description: '', started_at: new Date(), activity_status: 'active', verification_status: 'unverified', areas: [], lat: null, lng: null, radius_km: null, location_note: '', source_name: '', source_url: '' };
  let report = null;
  try {
    if (editId) e = (await api(`/events/${editId}`)).event;
    else if (reportId) {
      report = (await api('/coordinator/disaster-reports')).items.find((x) => x.id === reportId) || null;
      if (report) {
        e = { ...e, type_code: report.type_code, description: report.description, lat: report.lat, lng: report.lng,
          source_name: report.source_name, source_url: report.source_url, areas: report.city_id ? [{ city_id: report.city_id }] : [] };
      }
    } else if (state.cityId) e.areas = [{ city_id: state.cityId }];
  } catch (err) {
    R.innerHTML = `<div class="container">${errorState(err)}</div>`;
    return;
  }
  let cities = e.areas.filter((a) => a.city_id).map((a) => a.city_id);
  const regs = e.areas.filter((a) => a.region_code).map((a) => a.region_code);

  R.innerHTML = `
  <div class="container">
    <div class="page-head">
      <nav class="crumbs" aria-label="${esc(t('common.breadcrumbs'))}"><a href="${withCity('/disasters')}">${esc(t('dir.disaster'))}</a>${icon('chevRight')}<span>${esc(t(editId ? 'event.editTitle' : 'event.newTitle'))}</span></nav>
      <h1>${esc(t(editId ? 'event.editTitle' : 'event.newTitle'))}</h1>
      <p class="lead">${esc(t('event.formLead'))}</p>
    </div>
    ${report ? `<div class="alert alert-info" style="margin-bottom:20px">${icon('flag')}<div><strong>${esc(t('event.fromReport', { id: report.id }))}</strong>${esc(t('event.fromReportHint'))}</div></div>` : ''}
    <div class="form-layout">
      <form class="card card-pad" id="ev-form" novalidate>
        <section class="form-section">
          <h2>${esc(t('event.s1'))}</h2>
          <div class="form-grid">
            ${field({ name: 'type', label: t('disaster.type'), required: true, control: `<select class="select" id="f-type" name="type"><option value="">${esc(t('disaster.chooseType'))}</option>
              ${state.disasterTypes.map((d) => `<option value="${d.code}" ${d.code === e.type_code ? 'selected' : ''}>${esc(t(`dtype.${d.code}`))}</option>`).join('')}</select>` })}
            ${field({ name: 'started_at', label: t('event.f.started_at'), required: true, control: `<input class="input" id="f-started_at" name="started_at" type="datetime-local" value="${isoToLocalInput(e.started_at)}">` })}
            ${field({ name: 'title', label: t('form.title'), required: true, span: true, hint: t('event.titleHint'), control: `<input class="input" id="f-title" name="title" maxlength="140" value="${esc(e.title)}">` })}
            ${field({ name: 'description', label: t('form.description'), required: true, span: true, hint: t('event.descHint'), control: `<textarea class="textarea" id="f-description" name="description" maxlength="3000">${esc(e.description)}</textarea>` })}
          </div>
        </section>
        <section class="form-section">
          <h2>${esc(t('event.s2'))}</h2><p class="muted">${esc(t('event.s2hint'))}</p>
          <div class="form-grid">
            <div class="field span-2" data-field="city_ids">
              <label for="f-city-add">${esc(t('event.f.cities'))}</label>
              <div class="row">${citySelect('city_add', null, { required: false, id: 'f-city-add' })}<button type="button" class="btn" id="add-city">${icon('plus')}${esc(t('common.add'))}</button></div>
              <div class="chip-list" id="city-chips" aria-live="polite"></div>
              <input type="hidden" id="f-city-ids" value="">
              <span class="field-error" aria-live="polite"></span>
            </div>
            <div class="field span-2" data-field="region_codes">
              <span class="label">${esc(t('event.f.regions'))}</span>
              <div class="toggle-group">${regionCodes().filter((r) => r !== 'rep').map((r) => `<label><input type="checkbox" name="region_codes" data-multi="1" value="${r}" ${regs.includes(r) ? 'checked' : ''}><span class="chip">${esc(regionLabel(r))}</span></label>`).join('')}</div>
              <span class="field-error" aria-live="polite"></span>
            </div>
            <div class="field span-2" data-field="lat">
              <span class="label">${esc(t('event.f.point'))}</span>
              <div class="pick-map" id="ev-pick-map" role="application" aria-label="${esc(t('event.f.point'))}"></div>
              <div class="row" style="justify-content:space-between"><span class="hint">${esc(t('event.pointHint'))}</span>
                <button type="button" class="btn btn-sm btn-ghost" id="clear-point">${esc(t('vol.clearBase'))}</button></div>
              <span class="field-error" aria-live="polite"></span>
              <input type="hidden" name="lat" value="${e.lat ?? ''}"><input type="hidden" name="lng" value="${e.lng ?? ''}">
            </div>
            ${field({ name: 'radius_km', label: t('event.f.radius_km'), hint: t('event.radiusHint'), control: `<input class="input" id="f-radius_km" name="radius_km" type="number" min="0.1" max="500" step="0.1" value="${e.radius_km ?? ''}">` })}
            ${field({ name: 'location_note', label: t('event.f.location_note'), hint: t('event.locationNoteHint'), control: `<input class="input" id="f-location_note" name="location_note" maxlength="200" value="${esc(e.location_note)}">` })}
            <div class="field span-2" data-field="areas"><span class="field-error" aria-live="polite"></span></div>
          </div>
        </section>
        <section class="form-section">
          <h2>${esc(t('event.s3'))}</h2><p class="muted">${esc(t('event.s3hint'))}</p>
          <div class="form-grid">
            ${field({ name: 'source_name', label: t('event.source'), control: `<input class="input" id="f-source_name" name="source_name" maxlength="160" value="${esc(e.source_name)}">` })}
            ${field({ name: 'source_url', label: t('event.sourceLink'), control: `<input class="input" id="f-source_url" name="source_url" type="url" maxlength="300" value="${esc(e.source_url)}" placeholder="https://">` })}
            ${field({ name: 'verification_status', label: t('disaster.verification'), control: `<select class="select" id="f-verification_status" name="verification_status">
              <option value="unverified">${esc(t('verify.unverified'))}</option><option value="verified" ${e.verification_status === 'verified' ? 'selected' : ''}>${esc(t('verify.verified'))}</option></select>` })}
            ${field({ name: 'activity_status', label: t('disaster.activity'), control: `<select class="select" id="f-activity_status" name="activity_status">
              <option value="active">${esc(t('activity.active'))}</option><option value="resolved" ${e.activity_status === 'resolved' ? 'selected' : ''}>${esc(t('activity.resolved'))}</option></select>` })}
            <p class="hint span-2">${esc(t('verify.verifiedExplain'))}</p>
          </div>
        </section>
        <div class="form-alert" tabindex="-1"></div>
        <div class="form-actions">
          <a class="btn btn-ghost" href="${withCity(editId ? `/events/${editId}` : '/disasters')}">${esc(t('common.cancel'))}</a>
          <button class="btn btn-primary btn-lg" type="submit">${icon('check')}${esc(t(editId ? 'common.save' : 'event.create'))}</button>
        </div>
      </form>
      <aside class="form-aside">
        <div class="card card-pad"><h3 style="font-size:1.1rem">${esc(t('event.rulesTitle'))}</h3>
          <ul class="privacy-list" style="margin-top:14px">
            <li>${icon('shield')}<span>${esc(t('event.rule1'))}</span></li>
            <li>${icon('ban')}<span>${esc(t('event.rule2'))}</span></li>
            <li>${icon('bell')}<span>${esc(t('event.rule3'))}</span></li>
            <li>${icon('lock')}<span>${esc(t('event.rule4'))}</span></li>
          </ul></div>
      </aside>
    </div>
  </div>`;

  const form = $('#ev-form', R);
  function drawChips() {
    $('#f-city-ids', R).value = cities.join(',');
    $('#city-chips', R).innerHTML = cities.map((c) => `<span class="chip is-active">${esc(cityLabel(c))}<button type="button" class="chip-x" data-rm="${c}" aria-label="${esc(t('common.remove'))}: ${esc(cityLabel(c))}">${icon('x')}</button></span>`).join('')
      || `<span class="hint">${esc(t('event.noCities'))}</span>`;
  }
  drawChips();
  $('#add-city', R).addEventListener('click', () => {
    const v = Number($('#f-city-add', R).value);
    if (v && !cities.includes(v)) cities.push(v);
    $('#f-city-add', R).value = '';
    drawChips();
  });
  $('#city-chips', R).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-rm]');
    if (!b) return;
    cities = cities.filter((c) => c !== Number(b.dataset.rm));
    drawChips();
  });

  // Нүкте (міндетті емес): елді мекеннен тыс аумақ үшін
  let map = null, marker = null, circle = null;
  const setPoint = (lat, lng) => {
    form.lat.value = lat == null ? '' : (+lat).toFixed(5);
    form.lng.value = lng == null ? '' : (+lng).toFixed(5);
    if (!map) return;
    marker?.remove(); circle?.remove(); marker = circle = null;
    if (lat == null) return;
    marker = L.marker([lat, lng], { icon: meIcon(), draggable: true }).addTo(map);
    marker.on('dragend', () => { const ll = marker.getLatLng(); setPoint(ll.lat, ll.lng); });
    const rad = Number(form.radius_km.value);
    if (rad > 0) circle = L.circle([lat, lng], { radius: rad * 1000, color: '#DC2626', weight: 2, dashArray: '6 6', fillOpacity: 0.08 }).addTo(map);
  };
  if (hasLeaflet()) {
    try {
      const c0 = state.citiesById.get(cities[0]);
      map = createMap($('#ev-pick-map', R), { center: e.lat != null ? [e.lat, e.lng] : c0 ? [c0.lat, c0.lng] : KZ_VIEW.center, zoom: e.lat != null ? 9 : c0 ? 9 : KZ_VIEW.zoom });
      map.on('click', (ev) => setPoint(ev.latlng.lat, ev.latlng.lng));
      if (e.lat != null) setPoint(e.lat, e.lng);
      ctx.onCleanup(watchResize(map, $('#ev-pick-map', R)));
      ctx.onCleanup(() => map.remove());
    } catch { map = null; }
  }
  if (!map) $('#ev-pick-map', R).innerHTML = `<div class="map-unavailable"><p class="muted">${esc(t('map.unavailable'))}</p></div>`;
  form.radius_km.addEventListener('input', () => { if (form.lat.value) setPoint(Number(form.lat.value), Number(form.lng.value)); });
  $('#clear-point', R).addEventListener('click', () => setPoint(null, null));
  const onRestored = () => {
    if (form.lat.value) setPoint(Number(form.lat.value), Number(form.lng.value));
    const v = $('#f-city-ids', R).value;
    cities = v ? v.split(',').map(Number).filter(Boolean) : [];
    drawChips();
  };
  document.addEventListener('qm:restored', onRestored);
  ctx.onCleanup(() => document.removeEventListener('qm:restored', onRestored));

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    clearErrors(form);
    const d = formData(form);
    const body = {
      type: d.type, title: d.title, description: d.description, started_at: localInputToIso(d.started_at),
      city_ids: cities, region_codes: d.region_codes || [],
      lat: d.lat ? Number(d.lat) : null, lng: d.lng ? Number(d.lng) : null, radius_km: d.radius_km ? Number(d.radius_km) : null,
      location_note: d.location_note, source_name: d.source_name, source_url: d.source_url,
      verification_status: d.verification_status, activity_status: d.activity_status,
      content_lang: e.content_lang || getLang(), report_id: report?.id || undefined,
    };
    const errs = {};
    if (!body.type) errs.type = { code: 'REQUIRED' };
    if (!body.title || body.title.trim().length < 5) errs.title = { code: body.title ? 'MIN_LENGTH' : 'REQUIRED', params: { min: 5 } };
    if (!body.description || body.description.trim().length < 10) errs.description = { code: body.description ? 'MIN_LENGTH' : 'REQUIRED', params: { min: 10 } };
    if (!body.started_at) errs.started_at = { code: 'REQUIRED' };
    if (!body.city_ids.length && !body.region_codes.length && body.lat == null) errs.areas = { code: 'AREA_REQUIRED' };
    if (body.radius_km && body.lat == null) errs.lat = { code: 'POINT_INCOMPLETE' };
    if (Object.keys(errs).length) return showErrors(form, { message: t('errors.VALIDATION'), fields: errs });
    withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const res = editId
          ? await api(`/events/${editId}`, { method: 'PUT', body })
          : await api('/events', { method: 'POST', body });
        toast(t('event.saved'), { type: 'success' });
        navigate(`/events/${res.id}`);
      } catch (err) { showErrors(form, err); }
    });
  });
  void $$;
}
