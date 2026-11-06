import { api, ApiError } from '../api.js';
import { state, cityLabel } from '../state.js';
import { icon } from '../icons.js';
import {
  esc, field, showErrors, clearErrors, withBusy, toast, formData, localInputToIso, isoToLocalInput,
  loadingState, errorState, $, catLabel, ugc, toastError,
} from '../ui.js';
import { t, getLang } from '../i18n.js';
import { navigate, withCity } from '../router.js';
import { citySelect } from '../city-picker.js';
import { emergencyNotice } from '../components.js';
import { createMap, hasLeaflet, meIcon, watchResize } from '../mapkit.js';

export default async function requestForm(ctx) {
  const editId = ctx.params.id || null;
  document.title = `${t(editId ? 'form.editTitle' : 'form.newTitle')} — QamqorMap`;
  ctx.root.innerHTML = `<div class="container">${loadingState()}</div>`;

  let data = null;
  if (editId) {
    try {
      data = await api(`/requests/${editId}`);
    } catch (err) {
      ctx.root.innerHTML = `<div class="container">${errorState(err)}</div>`;
      return;
    }
    if (!data.viewer.is_author) {
      ctx.root.innerHTML = `<div class="container">${errorState(new ApiError(403, '', { code: 'ONLY_AUTHOR_EDIT' }))}</div>`;
      return;
    }
    if (data.request.moderation_status === 'approved' || data.request.status !== 'open') {
      ctx.root.innerHTML = `<div class="container">${errorState(new ApiError(409, '', { code: 'PUBLISHED_LOCKED' }), { retry: false })}
        <div style="text-align:center"><a class="btn" href="${withCity(`/requests/${editId}`)}">${esc(t('form.backToRequest'))}</a></div></div>`;
      return;
    }
  }
  const r = data?.request || {};
  const p = data?.private || {};
  const presetEvent = r.disaster_event_id || Number(ctx.query.get('event')) || null;
  const cityId = r.city_id || state.cityId || state.user.city_id || 1;
  const nowLocal = isoToLocalInput(new Date());

  // Белсенді апат оқиғалары (өтінішті байланыстыру үшін, міндетті емес)
  let events = [];
  try {
    events = (await api('/events', { query: { activity: 'active', limit: 100 } })).items;
    if (presetEvent && !events.some((e) => e.id === presetEvent)) {
      const one = await api(`/events/${presetEvent}`).catch(() => null);
      if (one) events.unshift(one.event);
    }
  } catch { events = []; }

  const catOptions = (sel, onlyDisaster) => ['everyday', 'disaster'].filter((d) => !onlyDisaster || d === 'disaster').map((d) => `
    <optgroup label="${esc(t(`dir.${d}`))}">${state.categories.filter((c) => c.direction === d).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(catLabel(c.code))}</option>`).join('')}</optgroup>`).join('');

  ctx.root.innerHTML = `
  <div class="container">
    <div class="page-head">
      <nav class="crumbs" aria-label="${esc(t('common.breadcrumbs'))}"><a href="${withCity('/')}">${esc(t('nav.home'))}</a>${icon('chevRight')}${editId ? `<a href="${withCity(`/requests/${editId}`)}">${esc(t('request.number', { id: editId }))}</a>${icon('chevRight')}<span>${esc(t('common.edit'))}</span>` : `<span>${esc(t('form.newTitle'))}</span>`}</nav>
      <h1>${esc(t(editId ? 'form.editTitle' : 'form.newTitle'))}</h1>
      <p class="lead">${esc(t(editId ? 'form.editLead' : 'form.newLead'))}</p>
    </div>
    ${r.moderation_status === 'rejected' && (r.rejection_reason || r.duplicate_of) ? `<div class="alert alert-warn" style="margin-bottom:22px">${icon('alert')}<div><strong>${esc(t('form.coordNote'))}</strong>${r.rejection_reason ? ugc(r.rejection_reason) : esc(t('request.duplicateOf', { id: r.duplicate_of }))}</div></div>` : ''}
    ${editId ? `<div class="alert alert-info" style="margin-bottom:22px">${icon('info')}<div>${esc(t('form.currentState'))}: <b>${esc(t(`moderation.${r.moderation_status}`))}</b></div></div>` : ''}
    <div class="form-layout">
      <form class="card card-pad" id="rq-form" novalidate>
        <section class="form-section">
          <h2>${esc(t('form.s1'))}</h2><p class="muted">${esc(t('form.s1hint'))}</p>
          <div class="form-grid">
            ${field({ name: 'title', label: t('form.title'), required: true, span: true, hint: t('form.titleHint'), control: `<input class="input" id="f-title" name="title" maxlength="120" value="${esc(r.title)}" placeholder="${esc(t('form.titlePh'))}" aria-describedby="h-title e-title">` })}
            ${field({ name: 'disaster_event_id', label: t('form.event'), span: true, hint: t('form.eventHint'), control: `<select class="select" id="f-disaster_event_id" name="disaster_event_id" aria-describedby="h-disaster_event_id e-disaster_event_id">
              <option value="">${esc(t('form.noEvent'))}</option>
              ${events.map((e) => `<option data-ugc value="${e.id}" ${e.id === presetEvent ? 'selected' : ''}>${esc(t(`dtype.${e.type_code}`))} — ${esc(e.title)}${e.is_demo ? ` (${esc(t('demo.badge'))})` : ''}</option>`).join('')}
            </select>` })}
            ${field({ name: 'category_id', label: t('form.category'), required: true, control: `<select class="select" id="f-category_id" name="category_id" aria-describedby="e-category_id"><option value="">${esc(t('form.chooseCategory'))}</option>${catOptions(r.category_id, !!presetEvent)}</select>` })}
            ${field({ name: 'urgency', label: t('form.urgency'), required: true, control: `<select class="select" id="f-urgency" name="urgency"><option value="normal">${esc(t('urgency.normal'))}</option><option value="high" ${r.urgency === 'high' ? 'selected' : ''}>${esc(t('form.urgencyHigh'))}</option><option value="low" ${r.urgency === 'low' ? 'selected' : ''}>${esc(t('urgency.low'))}</option></select>` })}
            ${field({ name: 'quantity', label: t('form.quantity'), hint: t('form.quantityHint'), control: `<input class="input" id="f-quantity" name="quantity" type="number" min="1" step="1" inputmode="decimal" value="${r.quantity ?? ''}" aria-describedby="h-quantity e-quantity">` })}
            ${field({ name: 'quantity_unit', label: t('form.unit'), control: `<select class="select" id="f-quantity_unit" name="quantity_unit" aria-describedby="e-quantity_unit"><option value="">${esc(t('form.noUnit'))}</option>${['bottle', 'liter', 'kg', 'pack', 'set', 'item', 'person', 'bed', 'trip'].map((u) => `<option value="${u}" ${r.quantity_unit === u ? 'selected' : ''}>${esc(t(`unitName.${u}`))}</option>`).join('')}</select>` })}
            <div class="span-2" id="disaster-box" hidden>${emergencyNotice()}<p class="hint" style="margin-top:8px">${esc(t('form.disasterSafety'))}</p></div>
            ${field({ name: 'description', label: t('form.description'), required: true, span: true, hint: t('form.descriptionHint'), control: `<textarea class="textarea" id="f-description" name="description" maxlength="2000" aria-describedby="h-description e-description" placeholder="${esc(t('form.descriptionPh'))}">${esc(r.description)}</textarea>` })}
          </div>
        </section>
        <section class="form-section">
          <h2>${esc(t('form.s2'))}</h2><p class="muted">${esc(t('form.s2hint'))}</p>
          <div class="form-grid">
            ${field({ name: 'needed_from', label: t('form.from'), control: `<input class="input" id="f-needed_from" name="needed_from" type="datetime-local" min="${nowLocal}" value="${isoToLocalInput(r.needed_from)}" aria-describedby="e-needed_from">` })}
            ${field({ name: 'needed_to', label: t('form.to'), control: `<input class="input" id="f-needed_to" name="needed_to" type="datetime-local" value="${isoToLocalInput(r.needed_to)}" aria-describedby="e-needed_to">` })}
            ${field({ name: 'needed_note', label: t('form.timeNote'), span: true, hint: t('form.timeNoteHint'), control: `<input class="input" id="f-needed_note" name="needed_note" maxlength="200" value="${esc(r.needed_note)}" aria-describedby="h-needed_note e-needed_note">` })}
          </div>
        </section>
        <section class="form-section">
          <h2>${esc(t('form.s3'))}</h2><p class="muted">${esc(t('form.s3hint'))}</p>
          <div class="form-grid">
            ${field({ name: 'city_id', label: t('form.city'), required: true, control: citySelect('city_id', cityId) })}
            ${field({ name: 'district', label: t('form.district'), hint: t('form.public'), control: `<input class="input" id="f-district" name="district" maxlength="80" value="${esc(r.district)}" placeholder="${esc(t('form.districtPh'))}" aria-describedby="h-district e-district">` })}
            ${field({ name: 'public_place', label: t('form.publicPlace'), span: true, hint: t('form.publicPlaceHint'), control: `<input class="input" id="f-public_place" name="public_place" maxlength="120" value="${esc(r.public_place)}" placeholder="${esc(t('form.publicPlacePh'))}" aria-describedby="h-public_place e-public_place">` })}
            <div class="field span-2" data-field="lat">
              <span class="label req" id="lbl-map">${esc(t('form.mapPoint'))}</span>
              <div class="pick-map" id="pick-map" role="application" aria-labelledby="lbl-map" aria-describedby="h-lat"></div>
              <div class="row" style="justify-content:space-between">
                <span class="hint" id="h-lat">${esc(t('form.mapPointHint'))}</span>
                <button type="button" class="btn btn-sm" id="locate">${icon('locate')}${esc(t('form.myLocation'))}</button>
              </div>
              <span class="field-error" aria-live="polite"></span>
              <input type="hidden" name="lat" value="${p.exact_lat ?? ''}"><input type="hidden" name="lng" value="${p.exact_lng ?? ''}">
            </div>
          </div>
        </section>
        <section class="form-section">
          <h2>${esc(t('form.s4'))} ${icon('lock').replace('<svg class=""', '<svg class="ico-inline-ok"')}</h2>
          <p class="muted">${esc(t('form.s4hint'))}</p>
          <div class="form-grid">
            ${field({ name: 'address', label: t('form.address'), required: true, span: true, control: `<input class="input" id="f-address" name="address" maxlength="200" value="${esc(p.address)}" autocomplete="street-address" placeholder="${esc(t('form.addressPh'))}" aria-describedby="e-address">` })}
            ${field({ name: 'contact_phone', label: t('form.phone'), required: true, control: `<input class="input" id="f-contact_phone" name="contact_phone" type="tel" value="${esc(p.contact_phone || state.user.phone || '')}" autocomplete="tel" placeholder="+7 7__ ___ __ __" aria-describedby="e-contact_phone">` })}
          </div>
        </section>
        <section class="form-section">
          <h2>${esc(t('form.s5'))} <span class="muted" style="font-weight:600;font-size:var(--fs-sm)">(${esc(t('common.optional'))})</span></h2>
          <p class="muted">${esc(t('form.s5hint'))}</p>
          <div id="photos-existing"></div>
          <div class="field" data-field="photo">
            <div class="photo-drop"><img id="photo-preview" alt="" hidden>
              <div class="grow"><label for="f-photo" class="btn btn-sm">${icon('image')}${esc(t('form.choosePhoto'))}</label>
                <input id="f-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" aria-describedby="e-photo">
                <span class="hint" id="photo-name" style="margin-left:8px">${esc(t('form.noFile'))}</span></div>
              <label class="checkbox"><input type="checkbox" name="photo_public" id="f-photo_public"> ${esc(t('form.photoPublic'))}</label>
            </div>
            <span class="field-error" id="e-photo" aria-live="polite"></span>
          </div>
        </section>
        <div class="form-alert" tabindex="-1"></div>
        <div class="form-actions">
          <a class="btn btn-ghost" href="${withCity(editId ? `/requests/${editId}` : '/')}">${esc(t('common.cancel'))}</a>
          <button class="btn" type="button" id="save-draft">${esc(t(editId && r.moderation_status === 'pending' ? 'form.saveChanges' : 'form.saveDraft'))}</button>
          <button class="btn btn-primary btn-lg" type="submit">${icon('send')}${esc(t(r.moderation_status === 'rejected' ? 'form.resubmit' : r.moderation_status === 'pending' ? 'common.save' : 'form.submit'))}</button>
        </div>
      </form>
      <aside class="form-aside">
        <div class="card card-pad"><h3 style="font-size:1.1rem">${esc(t('form.privacyTitle'))}</h3>
          <ul class="privacy-list" style="margin-top:14px">
            <li>${icon('shield')}<span>${esc(t('form.privacy1'))}</span></li>
            <li>${icon('users')}<span>${esc(t('form.privacy2'))}</span></li>
            <li>${icon('checkCircle')}<span>${esc(t('form.privacy3'))}</span></li>
          </ul></div>
        <div class="alert alert-info">${icon('info')}<div>${esc(t('form.emergencyHint'))}</div></div>
      </aside>
    </div>
  </div>`;

  const R = ctx.root;
  const form = $('#rq-form', R);

  // ───── Апат оқиғасы және санат ─────
  function syncDisaster() {
    const evSel = !!form.disaster_event_id.value;
    const cur = Number(form.category_id.value) || null;
    const curCat = state.categoriesById.get(cur);
    // Апатқа байланыстырылса — тек «Табиғи апаттар» бағытындағы санаттар қалады
    const keep = curCat && (!evSel || curCat.direction === 'disaster') ? cur : null;
    form.category_id.innerHTML = `<option value="">${esc(t('form.chooseCategory'))}</option>${catOptions(keep, evSel)}`;
    form.category_id.value = keep ? String(keep) : '';
    $('#disaster-box', R).hidden = !(evSel || (keep && curCat.direction === 'disaster'));
  }
  form.disaster_event_id.addEventListener('change', syncDisaster);
  form.category_id.addEventListener('change', () => {
    const cat = state.categoriesById.get(Number(form.category_id.value));
    $('#disaster-box', R).hidden = !(form.disaster_event_id.value || cat?.direction === 'disaster');
  });
  syncDisaster();

  // ───── Карта: нүкте таңдау ─────
  let map = null, marker = null;
  const setPoint = (lat, lng, { pan = false } = {}) => {
    form.lat.value = (+lat).toFixed(6);
    form.lng.value = (+lng).toFixed(6);
    if (map) {
      if (!marker) {
        marker = L.marker([lat, lng], { draggable: true, icon: meIcon(), title: t('form.mapPoint'), keyboard: true }).addTo(map);
        marker.on('dragend', () => { const ll = marker.getLatLng(); setPoint(ll.lat, ll.lng); });
      } else marker.setLatLng([lat, lng]);
      if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 15));
    }
    $('[data-field="lat"]', R).classList.remove('has-error');
    $('.form-alert', form)?.replaceChildren();
  };
  const cityOf = (id) => state.citiesById.get(Number(id));
  if (hasLeaflet()) {
    try {
      const c = cityOf(cityId);
      const start = p.exact_lat ? [p.exact_lat, p.exact_lng] : [c.lat, c.lng];
      map = createMap($('#pick-map', R), { center: start, zoom: p.exact_lat ? 15 : c.zoom });
      map.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng));
      if (p.exact_lat) setPoint(p.exact_lat, p.exact_lng);
      ctx.onCleanup(watchResize(map, $('#pick-map', R)));
      ctx.onCleanup(() => map.remove());
    } catch { map = null; }
  }
  if (!map) {
    $('#pick-map', R).innerHTML = `<div class="map-unavailable"><p class="muted">${esc(t('form.mapUnavailable'))}</p></div>`;
  }
  // Тіл ауыстырғаннан кейін: қалпына келген мәндерге сай нүкте мен санатты жаңарту
  const onRestored = () => {
    if (form.lat.value && form.lng.value) setPoint(Number(form.lat.value), Number(form.lng.value), { pan: true });
    else {
      const c = cityOf(form.city_id.value);
      if (c && map) map.setView([c.lat, c.lng], c.zoom);
    }
    syncDisaster();
  };
  document.addEventListener('qm:restored', onRestored);
  ctx.onCleanup(() => document.removeEventListener('qm:restored', onRestored));

  form.city_id.addEventListener('change', () => {
    const c = cityOf(form.city_id.value);
    if (c && map) map.setView([c.lat, c.lng], c.zoom);
    if (c && !map) setPoint(c.lat, c.lng);
  });
  $('#locate', R).addEventListener('click', (e) => {
    if (!navigator.geolocation) return toast(t('form.geoUnsupported'), { type: 'error' });
    const btn = e.currentTarget;
    withBusy(btn, () => new Promise((res) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setPoint(pos.coords.latitude, pos.coords.longitude, { pan: true }); res(); },
        () => { toast(t('form.geoFailed'), { type: 'error' }); res(); },
        { timeout: 8000 },
      );
    }));
  });

  // ───── Фото ─────
  const photoInput = $('#f-photo', R);
  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    const prev = $('#photo-preview', R);
    const box = $('[data-field="photo"]', R);
    box.classList.remove('has-error');
    if (!file) { prev.hidden = true; $('#photo-name', R).textContent = t('form.noFile'); return; }
    let code = '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) code = 'PHOTO_TYPE';
    else if (file.size > 5 * 1024 * 1024) code = 'PHOTO_SIZE';
    if (code) {
      photoInput.value = '';
      showErrors(form, { message: t(`fieldErrors.${code}`, { mb: 5 }), fields: { photo: { code, params: { mb: 5 } } } });
      return;
    }
    $('#photo-name', R).textContent = file.name;
    prev.src = URL.createObjectURL(file);
    prev.hidden = false;
  });
  function drawExisting() {
    const list = data?.attachments || [];
    $('#photos-existing', R).innerHTML = list.length ? `<div class="photos" style="margin-bottom:14px">${list.map((x) => `
      <figure><img src="/api/attachments/${x.id}" alt="${esc(t('request.photoAlt'))}" loading="lazy">
        <figcaption><span class="badge">${esc(t(x.visibility === 'public' ? 'request.photoPublic' : 'request.photoPrivate'))}</span></figcaption>
        <button class="btn btn-sm btn-danger ph-del" type="button" data-del="${x.id}" aria-label="${esc(t('form.deletePhoto'))}">${icon('x')}</button></figure>`).join('')}</div>` : '';
  }
  drawExisting();
  $('#photos-existing', R).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    await withBusy(b, async () => {
      try {
        await api(`/attachments/${b.dataset.del}`, { method: 'DELETE' });
        data.attachments = data.attachments.filter((x) => String(x.id) !== b.dataset.del);
        drawExisting();
        toast(t('form.photoDeleted'), { type: 'success' });
      } catch (err) { toastError(err); }
    });
  });

  // ───── Жіберу ─────
  function collect() {
    const d = formData(form);
    return {
      city_id: d.city_id ? Number(d.city_id) : null,
      category_id: d.category_id ? Number(d.category_id) : null,
      disaster_event_id: d.disaster_event_id ? Number(d.disaster_event_id) : null,
      title: d.title, description: d.description, district: d.district, public_place: d.public_place,
      lat: d.lat ? Number(d.lat) : null, lng: d.lng ? Number(d.lng) : null,
      needed_from: localInputToIso(d.needed_from), needed_to: localInputToIso(d.needed_to), needed_note: d.needed_note,
      urgency: d.urgency, address: d.address, contact_phone: d.contact_phone,
      quantity: d.quantity ? Number(d.quantity) : null, quantity_unit: d.quantity ? d.quantity_unit || null : null,
      content_lang: r.content_lang || getLang(),
    };
  }
  function localCheck(b) {
    const e = {};
    if (!b.title || b.title.trim().length < 5) e.title = { code: b.title ? 'MIN_LENGTH' : 'REQUIRED', params: { min: 5 } };
    if (!b.category_id) e.category_id = { code: 'REQUIRED' };
    if (!b.description || b.description.trim().length < 20) e.description = { code: b.description ? 'MIN_LENGTH' : 'REQUIRED', params: { min: 20 } };
    if (!b.city_id) e.city_id = { code: 'REQUIRED' };
    if (b.lat == null) e.lat = { code: 'POINT_REQUIRED' };
    if (!b.address || b.address.trim().length < 5) e.address = { code: b.address ? 'MIN_LENGTH' : 'REQUIRED', params: { min: 5 } };
    if (!b.contact_phone) e.contact_phone = { code: 'REQUIRED' };
    if (b.needed_to && !b.needed_from) e.needed_from = { code: 'START_FIRST' };
    if (b.needed_from && b.needed_to && b.needed_to < b.needed_from) e.needed_to = { code: 'END_BEFORE_START' };
    return e;
  }

  async function save(submit, btn) {
    clearErrors(form);
    const body = collect();
    const errs = localCheck(body);
    if (Object.keys(errs).length) return showErrors(form, { message: t('errors.VALIDATION'), fields: errs });
    await withBusy(btn, async () => {
      form.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      try {
        let id = editId;
        if (editId) await api(`/requests/${editId}`, { method: 'PUT', body: { ...body, submit } });
        else id = (await api('/requests', { method: 'POST', body: { ...body, submit } })).id;
        const file = photoInput.files[0];
        if (file) {
          const fd = new FormData();
          fd.append('photo', file);
          fd.append('visibility', form.photo_public.checked ? 'public' : 'participants');
          try {
            await api(`/requests/${id}/attachments`, { method: 'POST', form: fd });
          } catch (err) {
            toast(t('form.photoFailed'), { type: 'error', timeout: 8000 });
          }
        }
        toast(t(submit ? 'form.sentToReview' : 'form.saved'), { type: 'success', title: t('form.savedTitle') });
        navigate(`/requests/${id}`);
      } catch (err) {
        showErrors(form, err);
      } finally {
        form.querySelectorAll('button').forEach((x) => { x.disabled = false; });
      }
    });
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save(r.moderation_status !== 'pending', form.querySelector('[type=submit]'));
  });
  $('#save-draft', R).addEventListener('click', (e) => save(false, e.currentTarget));
  void cityLabel;
}
