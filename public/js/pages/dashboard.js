import { api } from '../api.js';
import { state, setSession, emit, cityLabel } from '../state.js';
import { icon } from '../icons.js';
import {
  esc, stateBadges, catBadge, demoBadge, disasterBadge, fmtDate, timeAgo, fmtNum, field, formData, showErrors, clearErrors,
  withBusy, toast, toastError, loadingState, errorState, emptyState, $, $$, ugc, catLabel,
} from '../ui.js';
import { t, th } from '../i18n.js';
import { withCity } from '../router.js';
import { citySelect } from '../city-picker.js';
import { notifHtml, notifLink } from '../notif.js';
import { createMap, hasLeaflet, meIcon, watchResize } from '../mapkit.js';

const TABS = [['requests', 'inbox'], ['applications', 'hand'], ['tasks', 'checkCircle'], ['notifications', 'bell'], ['profile', 'user']];

export default async function dashboard(ctx) {
  document.title = `${t('nav.dashboard')} — QamqorMap`;
  const R = ctx.root;
  let tab = TABS.some(([k]) => k === ctx.query.get('tab')) ? ctx.query.get('tab') : 'requests';
  const u = state.user;

  R.innerHTML = `
  <div class="container">
    <div class="page-head dash-head">
      <div><span class="eyebrow">${esc(t('nav.dashboard'))}</span><h1>${th('dash.hello', { name: u.full_name.split(' ')[0] }, { ugc: ['name'] })}</h1>
        <p class="lead">${esc(t('dash.lead'))}</p></div>
      <div class="row"><a class="btn btn-primary btn-lg" href="${withCity('/requests/new')}">${icon('plus')}${esc(t('dash.newRequest'))}</a>
        <a class="btn btn-lg" href="${withCity('/map?status=open')}">${icon('map')}${esc(t('dash.help'))}</a></div>
    </div>
    <div class="dash-stats" id="dash-stats">${'<div class="stat skeleton" style="height:96px"></div>'.repeat(4)}</div>
    <div class="tabs" role="tablist" aria-label="${esc(t('dash.tabsAria'))}" style="margin-top:22px">
      ${TABS.map(([k, ico]) => `<button class="tab" role="tab" id="tab-${k}" aria-controls="tabpanel" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}" data-tab="${k}">${icon(ico).replace('<svg class=""', '<svg class="ico-tab"')}${esc(t(`dash.tabs.${k}`))}<span class="count" data-count="${k}" hidden></span></button>`).join('')}
    </div>
    <div id="tabpanel" role="tabpanel" aria-labelledby="tab-${tab}" style="margin-top:22px" tabindex="0"></div>
  </div>`;

  async function loadSummary() {
    try {
      const s = await api('/me/summary');
      if (!$('#dash-stats', R)) return;
      $('#dash-stats', R).innerHTML = `
        <div class="stat"><div class="stat-num">${fmtNum(s.my_requests)}</div><div class="stat-label">${esc(t('dash.stats.requests'))}</div></div>
        <div class="stat"><div class="stat-num">${fmtNum(s.my_applications)}</div><div class="stat-label">${esc(t('dash.stats.applications'))}</div></div>
        <div class="stat"><div class="stat-num">${fmtNum(s.my_tasks)}</div><div class="stat-label">${esc(t('dash.stats.tasks'))}</div></div>
        <div class="stat"><div class="stat-num" style="color:var(--c-green-700)">${fmtNum(s.helped)}</div><div class="stat-label">${esc(t('dash.stats.helped'))}</div></div>`;
      const n = $('[data-count="notifications"]', R);
      if (!n) return;
      n.hidden = !s.unread;
      n.textContent = s.unread;
      state.unread = s.unread;
      emit('unread', s.unread);
    } catch {
      const box = $('#dash-stats', R);
      if (box) box.innerHTML = '';
    }
  }

  const tablist = $('[role=tablist]', R);
  tablist.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) select(b.dataset.tab, true);
  });
  tablist.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const keys = TABS.map(([k]) => k);
    let i = keys.indexOf(tab);
    if (e.key === 'ArrowRight') i = (i + 1) % keys.length;
    if (e.key === 'ArrowLeft') i = (i - 1 + keys.length) % keys.length;
    if (e.key === 'Home') i = 0;
    if (e.key === 'End') i = keys.length - 1;
    select(keys[i], true);
    $(`#tab-${keys[i]}`, R).focus();
  });

  function select(k, push) {
    tab = k;
    $$('[data-tab]', R).forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.tab === k));
      b.tabIndex = b.dataset.tab === k ? 0 : -1;
    });
    $('#tabpanel', R).setAttribute('aria-labelledby', `tab-${k}`);
    if (push) {
      const url = new URL(location.href);
      url.searchParams.set('tab', k);
      history.replaceState(history.state, '', url);
    }
    return renderTab();
  }

  const panel = () => $('#tabpanel', R);

  async function renderTab() {
    const p = panel();
    if (!p) return;
    p.innerHTML = `<div class="panel">${loadingState()}</div>`;
    try {
      if (tab === 'requests') await tabRequests(p);
      if (tab === 'applications') await tabApplications(p);
      if (tab === 'tasks') await tabTasks(p);
      if (tab === 'notifications') await tabNotifications(p);
      if (tab === 'profile') await tabProfile(p);
    } catch (err) {
      if (!document.contains(p)) return;
      p.innerHTML = `<div class="panel">${errorState(err)}</div>`;
      p.querySelector('[data-retry]')?.addEventListener('click', renderTab);
    }
  }

  const rowMeta = (r) => `${catBadge(r)}${disasterBadge(r)}${stateBadges(r)}${demoBadge(r)}${r.disputed ? `<span class="badge badge-rejected">${esc(t('dash.dispute'))}</span>` : ''}
    <span>${icon('pin').replace('<svg class=""', '<svg class="ico-inline"')} ${esc(cityLabel(r.city_id))}</span>`;
  const titleLink = (r) => `<h3><a href="${withCity(`/requests/${r.id}`)}" style="color:inherit" data-ugc lang="${esc(r.content_lang || 'kk')}">${esc(r.title)}</a></h3>`;

  async function tabRequests(p) {
    const [{ items }, reps] = await Promise.all([api('/me/requests'), api('/me/disaster-reports').catch(() => ({ items: [] }))]);
    const reportsHtml = reps.items.length ? `<div class="panel" style="margin-top:22px">
      <div class="panel-head"><h2>${esc(t('dash.reports.title'))}</h2></div>
      <div class="list-rows">${reps.items.map((x) => `<div class="lrow"><div class="grow">
        <h3>${esc(t(`dtype.${x.type_code}`))}${x.city_id ? ` · ${esc(cityLabel(x.city_id))}` : ''}</h3>
        <p class="hint" data-ugc>${esc(x.description.slice(0, 160))}</p>
        <div class="lmeta"><span class="badge badge-report-${esc(x.status)}">${esc(t(`report.status.${x.status}`))}</span><span>${esc(timeAgo(x.created_at))}</span></div></div>
        <div class="lactions">${x.event_id ? `<a class="btn btn-sm btn-ghost" href="${withCity(`/events/${x.event_id}`)}">${esc(t('event.open'))}${icon('arrowRight')}</a>` : ''}</div></div>`).join('')}</div></div>` : '';
    if (!items.length) {
      p.innerHTML = `<div class="panel">${emptyState({ title: t('dash.empty.requests'), text: t('dash.empty.requestsText'), action: `<a class="btn btn-primary" href="${withCity('/requests/new')}">${icon('plus')}${esc(t('common.addRequest'))}</a>` })}</div>${reportsHtml}`;
      return;
    }
    p.innerHTML = `<div class="panel list-rows">${items.map((r) => `
      <div class="lrow"><div class="grow">
        ${titleLink(r)}
        <div class="lmeta">${rowMeta(r)}<span>${esc(t('dash.updated', { time: timeAgo(r.updated_at) }))}</span>
          ${r.applications_count ? `<span class="badge badge-open">${esc(t('dash.newOffers', { count: r.applications_count }))}</span>` : ''}</div>
        ${r.moderation_status === 'rejected' && (r.rejection_reason || r.duplicate_of) ? `<p class="hint" style="margin-top:6px;color:var(--c-red)">${esc(t('dash.note'))}: ${r.rejection_reason ? ugc(r.rejection_reason) : esc(t('request.duplicateOf', { id: r.duplicate_of }))}</p>` : ''}
      </div>
      <div class="lactions">
        ${r.status === 'awaiting_confirmation' ? `<a class="btn btn-success btn-sm" href="${withCity(`/requests/${r.id}`)}">${icon('checkCircle')}${esc(t('dash.confirm'))}</a>` : ''}
        ${['draft', 'rejected'].includes(r.moderation_status) && r.status === 'open' ? `<a class="btn btn-sm" href="${withCity(`/requests/${r.id}/edit`)}">${icon('edit')}${esc(t('common.edit'))}</a>` : ''}
        <a class="btn btn-sm btn-ghost" href="${withCity(`/requests/${r.id}`)}">${esc(t('common.open'))}${icon('arrowRight')}</a>
      </div></div>`).join('')}</div>${reportsHtml}`;
  }

  async function tabApplications(p) {
    const { items } = await api('/me/applications');
    if (!items.length) {
      p.innerHTML = `<div class="panel">${emptyState({ title: t('dash.empty.applications'), text: t('dash.empty.applicationsText'), ico: 'hand', action: `<a class="btn btn-coral" href="${withCity('/map?status=open')}">${icon('map')}${esc(t('home.openRequests'))}</a>` })}</div>`;
      return;
    }
    const AS = { active: 'badge-open', withdrawn: 'badge-cancelled', declined: 'badge-cancelled' };
    p.innerHTML = `<div class="panel list-rows">${items.map((r) => `
      <div class="lrow"><div class="grow">
        ${titleLink(r)}
        <div class="lmeta"><span class="badge ${AS[r.application_status]}">${esc(t('dash.offer', { status: t(`appStatus.${r.application_status === 'active' ? 'pending' : r.application_status}`) }))}</span>${rowMeta(r)}<span>${esc(timeAgo(r.applied_at))}</span></div>
      </div>
      <div class="lactions">
        ${r.application_status === 'active' && r.status === 'open' ? `<button class="btn btn-sm btn-danger" data-withdraw="${r.id}">${esc(t('request.dlg.withdrawOk'))}</button>` : ''}
        <a class="btn btn-sm btn-ghost" href="${withCity(`/requests/${r.id}`)}">${esc(t('common.open'))}${icon('arrowRight')}</a>
      </div></div>`).join('')}</div>`;
    $$('[data-withdraw]', p).forEach((b) => b.addEventListener('click', () => withBusy(b, async () => {
      try {
        await api(`/requests/${b.dataset.withdraw}/applications/mine`, { method: 'DELETE' });
        toast(t('request.done.withdrawn'), { type: 'success' });
        loadSummary();
        renderTab();
      } catch (err) { toastError(err); }
    })));
  }

  async function tabTasks(p) {
    const { items } = await api('/me/tasks');
    if (!items.length) {
      p.innerHTML = `<div class="panel">${emptyState({ title: t('dash.empty.tasks'), text: t('dash.empty.tasksText'), ico: 'checkCircle', action: `<a class="btn" href="${withCity('/map?status=open')}">${esc(t('dash.findRequest'))}</a>` })}</div>`;
      return;
    }
    p.innerHTML = `<div class="panel list-rows">${items.map((r) => `
      <div class="lrow"><div class="grow">
        ${titleLink(r)}
        <div class="lmeta">${rowMeta(r)}<span>${esc(t('dash.assignedAt', { date: fmtDate(r.assigned_at) }))}</span></div>
        ${r.is_active && ['assigned', 'in_progress', 'awaiting_confirmation'].includes(r.status) ? `<p class="hint" style="margin-top:6px">${esc(t('dash.nextStep'))}: ${esc(t(`dash.next.${r.status}`))}</p>` : ''}
      </div>
      <div class="lactions"><a class="btn btn-sm ${r.is_active && r.status !== 'awaiting_confirmation' ? 'btn-primary' : 'btn-ghost'}" href="${withCity(`/requests/${r.id}`)}">${esc(t(r.is_active ? 'dash.openTask' : 'common.open'))}${icon('arrowRight')}</a></div>
      </div>`).join('')}</div>`;
  }

  async function tabNotifications(p) {
    const { items, unread } = await api('/me/notifications');
    if (!items.length) {
      p.innerHTML = `<div class="panel">${emptyState({ title: t('dash.empty.notifications'), text: t('dash.empty.notificationsText'), ico: 'bell' })}</div>`;
      return;
    }
    p.innerHTML = `<div class="panel">
      <div class="panel-head"><h2>${esc(t('dash.tabs.notifications'))}</h2>${unread ? `<button class="btn btn-sm" id="read-all">${icon('check')}${esc(t('dash.readAll'))}</button>` : `<span class="muted" style="font-size:var(--fs-sm)">${esc(t('dash.allRead'))}</span>`}</div>
      ${items.map((n) => {
        const { title, body } = notifHtml(n);
        const href = notifLink(n);
        return `<div class="notif ${n.read_at ? '' : 'is-unread'}">
        <span class="n-ico">${icon(n.type === 'completed' ? 'checkCircle' : n.type === 'message' ? 'chat' : ['rejected', 'disputed', 'duplicate'].includes(n.type) ? 'alert' : n.type.startsWith('report') ? 'alert' : 'bell')}</span>
        <div class="grow"><strong>${title}</strong>${body ? `<p>${body}</p>` : ''}<time datetime="${esc(n.created_at)}">${esc(fmtDate(n.created_at))}</time></div>
        ${href ? `<a class="btn btn-sm btn-ghost" href="${withCity(href)}" data-read="${n.id}">${esc(t('common.open'))}</a>` : ''}
      </div>`;
      }).join('')}</div>`;
    $('#read-all', p)?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
      try {
        await api('/me/notifications/read', { method: 'POST', body: {} });
        toast(t('dash.readAllDone'), { type: 'success' });
        loadSummary();
        renderTab();
      } catch (err) { toastError(err); }
    }));
    $$('[data-read]', p).forEach((a) => a.addEventListener('click', () => {
      api('/me/notifications/read', { method: 'POST', body: { ids: [Number(a.dataset.read)] } }).catch(() => {});
    }));
  }

  async function tabProfile(p) {
    const { profile: vp } = await api('/me/volunteer');
    const v = vp || { bio: '', city_id: u.city_id || state.cityId || 1, district: '', base_lat: null, base_lng: null, radius_km: 5, available_days: [], time_from: '', time_to: '', category_ids: [], is_active: true, disaster_support: false };
    const days = [1, 2, 3, 4, 5, 6, 7];
    const catGroup = (dir) => state.categories.filter((c) => c.direction === dir).map((c) => `<label><input type="checkbox" name="category_ids" data-multi="1" value="${c.id}" ${v.category_ids.includes(c.id) ? 'checked' : ''}><span class="chip">${esc(catLabel(c.code, true))}</span></label>`).join('');
    p.innerHTML = `
    <div class="coord-grid">
      <div class="stack">
        <form class="panel" id="vol-form" novalidate>
          <div class="panel-head"><h2>${icon('hand').replace('<svg class=""', '<svg class="ico-head"')}${esc(t('vol.title'))}</h2>
            ${vp ? (vp.is_active ? `<span class="badge badge-completed">${esc(t('vol.active'))}</span>` : `<span class="badge">${esc(t('vol.paused'))}</span>`) : `<span class="badge badge-pending">${esc(t('vol.notYet'))}</span>`}</div>
          <div class="panel-body">
            <p class="muted" style="margin-bottom:18px">${esc(t('vol.lead'))}</p>
            <div class="form-grid">
              ${field({ name: 'bio', label: t('vol.bio'), span: true, hint: t('vol.bioHint'), control: `<textarea class="textarea" id="f-bio" name="bio" maxlength="500" style="min-height:90px">${esc(v.bio)}</textarea>` })}
              ${field({ name: 'city_id', label: t('form.city'), required: true, control: citySelect('city_id', v.city_id) })}
              ${field({ name: 'district', label: t('form.district'), control: `<input class="input" id="f-district" name="district" maxlength="80" value="${esc(v.district)}" placeholder="${esc(t('form.districtPh'))}">` })}
              <div class="field span-2" data-field="category_ids"><span class="label req">${esc(t('vol.categories'))}</span>
                <span class="hint">${esc(t('dir.everyday'))}</span><div class="toggle-group">${catGroup('everyday')}</div>
                <span class="hint" style="margin-top:6px">${esc(t('dir.disaster'))}</span><div class="toggle-group">${catGroup('disaster')}</div>
                <span class="field-error" aria-live="polite"></span></div>
              <div class="field span-2" data-field="disaster_support">
                <label class="checkbox"><input type="checkbox" name="disaster_support" id="f-disaster_support" ${v.disaster_support ? 'checked' : ''}> ${esc(t('vol.disasterSupport'))}</label>
                <span class="hint">${esc(t('vol.disasterSupportHint'))}</span>
              </div>
              <div class="field span-2" data-field="base_lat"><span class="label">${esc(t('vol.base'))}</span>
                <div class="pick-map" id="vol-map" style="height:260px"></div>
                <div class="row" style="justify-content:space-between"><span class="hint">${esc(t('vol.baseHint'))}</span>
                  <button type="button" class="btn btn-sm btn-ghost" id="clear-base">${esc(t('vol.clearBase'))}</button></div>
                <span class="field-error" aria-live="polite"></span>
                <input type="hidden" name="base_lat" value="${v.base_lat ?? ''}"><input type="hidden" name="base_lng" value="${v.base_lng ?? ''}"></div>
              ${field({ name: 'radius_km', label: t('vol.radius'), required: true, control: `<select class="select" id="f-radius_km" name="radius_km">${[1, 2, 3, 5, 8, 10, 15, 25, 40, 50].map((k) => `<option value="${k}" ${Number(v.radius_km) === k ? 'selected' : ''}>${k} ${esc(t('unit.km'))}</option>`).join('')}</select>` })}
              <div class="field" data-field="is_active"><span class="label">${esc(t('vol.state'))}</span><label class="checkbox" style="min-height:50px;align-items:center"><input type="checkbox" name="is_active" id="f-is_active" ${v.is_active ? 'checked' : ''}> ${esc(t('vol.recommendMe'))}</label></div>
              <div class="field span-2" data-field="available_days"><span class="label">${esc(t('vol.days'))}</span>
                <div class="toggle-group days-pick">${days.map((n) => `<label><input type="checkbox" name="available_days" data-multi="1" value="${n}" ${v.available_days.includes(n) ? 'checked' : ''}><span class="chip">${esc(t('date.daysShort')[n % 7])}</span></label>`).join('')}</div>
                <span class="field-error" aria-live="polite"></span></div>
              ${field({ name: 'time_from', label: t('vol.timeFrom'), control: `<input class="input" type="time" id="f-time_from" name="time_from" value="${esc(v.time_from || '')}">` })}
              ${field({ name: 'time_to', label: t('vol.timeTo'), hint: t('vol.timeHint'), control: `<input class="input" type="time" id="f-time_to" name="time_to" value="${esc(v.time_to || '')}">` })}
            </div>
            <div class="form-alert" tabindex="-1" style="margin-top:16px"></div>
            <div class="form-actions" style="margin-top:20px"><button class="btn btn-coral btn-lg" type="submit">${icon('check')}${esc(t(vp ? 'vol.save' : 'vol.become'))}</button></div>
          </div>
        </form>
      </div>
      <div class="stack">
        <form class="panel" id="me-form" novalidate>
          <div class="panel-head"><h2>${esc(t('profile.personal'))}</h2></div>
          <div class="panel-body stack">
            ${field({ name: 'full_name', label: t('auth.fullName'), required: true, control: `<input class="input" id="f-full_name" name="full_name" maxlength="80" value="${esc(u.full_name)}" autocomplete="name">` })}
            ${field({ name: 'phone', label: t('auth.phone'), control: `<input class="input" id="f-phone" name="phone" type="tel" value="${esc(u.phone || '')}" placeholder="+7 7__ ___ __ __" autocomplete="tel">` })}
            <div class="field" data-field="city_id"><label for="f-city_id-me">${esc(t('profile.myCity'))}</label>${citySelect('city_id', u.city_id, { required: false, id: 'f-city_id-me' })}<span class="field-error" aria-live="polite"></span></div>
            <p class="hint">Email: <span data-ugc>${esc(u.email)}</span></p>
            <div class="form-alert" tabindex="-1"></div>
            <button class="btn btn-primary" type="submit">${esc(t('common.save'))}</button>
          </div>
        </form>
        <form class="panel" id="pw-form" novalidate>
          <div class="panel-head"><h2>${esc(t('profile.changePassword'))}</h2></div>
          <div class="panel-body stack">
            ${field({ name: 'current_password', label: t('profile.currentPassword'), required: true, control: '<input class="input" id="f-current_password" name="current_password" type="password" autocomplete="current-password">' })}
            ${field({ name: 'new_password', label: t('profile.newPassword'), required: true, hint: t('auth.passwordHint'), control: '<input class="input" id="f-new_password" name="new_password" type="password" autocomplete="new-password">' })}
            <div class="form-alert" tabindex="-1"></div>
            <button class="btn" type="submit">${esc(t('profile.changePassword'))}</button>
          </div>
        </form>
      </div>
    </div>`;

    // Ерікті картасы
    const vf = $('#vol-form', p);
    let vmap = null, vmarker = null;
    const setBase = (lat, lng) => {
      vf.base_lat.value = lat == null ? '' : (+lat).toFixed(6);
      vf.base_lng.value = lng == null ? '' : (+lng).toFixed(6);
      if (!vmap) return;
      vmarker?.remove();
      vmarker = lat == null ? null : L.marker([lat, lng], { icon: meIcon(), draggable: true }).addTo(vmap);
      vmarker?.on('dragend', () => { const ll = vmarker.getLatLng(); setBase(ll.lat, ll.lng); });
    };
    if (hasLeaflet()) {
      try {
        const c = state.citiesById.get(Number(v.city_id));
        vmap = createMap($('#vol-map', p), { center: v.base_lat ? [v.base_lat, v.base_lng] : [c.lat, c.lng], zoom: v.base_lat ? 13 : c.zoom });
        vmap.on('click', (e) => setBase(e.latlng.lat, e.latlng.lng));
        if (v.base_lat) setBase(v.base_lat, v.base_lng);
        ctx.onCleanup(watchResize(vmap, $('#vol-map', p)));
        ctx.onCleanup(() => vmap.remove());
      } catch { vmap = null; }
    }
    if (!vmap) $('#vol-map', p).innerHTML = `<div class="map-unavailable"><p class="muted">${esc(t('vol.mapUnavailable'))}</p></div>`;
    const onRestored = () => { if (vf.base_lat.value) setBase(Number(vf.base_lat.value), Number(vf.base_lng.value)); };
    document.addEventListener('qm:restored', onRestored);
    ctx.onCleanup(() => document.removeEventListener('qm:restored', onRestored));
    vf.city_id.addEventListener('change', () => {
      const c = state.citiesById.get(Number(vf.city_id.value));
      if (c && vmap) { vmap.setView([c.lat, c.lng], c.zoom); setBase(null, null); }
    });
    $('#clear-base', p).addEventListener('click', () => setBase(null, null));
    vf.addEventListener('submit', (e) => {
      e.preventDefault();
      clearErrors(vf);
      const d = formData(vf);
      const body = {
        bio: d.bio, city_id: Number(d.city_id) || null, district: d.district,
        base_lat: d.base_lat ? Number(d.base_lat) : null, base_lng: d.base_lng ? Number(d.base_lng) : null,
        radius_km: Number(d.radius_km), category_ids: (d.category_ids || []).map(Number), available_days: (d.available_days || []).map(Number),
        time_from: d.time_from || null, time_to: d.time_to || null, is_active: d.is_active, disaster_support: d.disaster_support,
      };
      if (!body.category_ids.length) return showErrors(vf, { message: t('errors.VALIDATION'), fields: { category_ids: { code: 'CATEGORIES_MIN' } } });
      withBusy(vf.querySelector('[type=submit]'), async () => {
        try {
          await api('/me/volunteer', { method: 'PUT', body });
          state.user.is_volunteer = body.is_active;
          toast(t('vol.saved'), { type: 'success' });
          renderTab();
        } catch (err) { showErrors(vf, err); }
      });
    });

    const mf = $('#me-form', p);
    mf.addEventListener('submit', (e) => {
      e.preventDefault();
      clearErrors(mf);
      const d = formData(mf);
      withBusy(mf.querySelector('[type=submit]'), async () => {
        try {
          await api('/auth/profile', { method: 'PATCH', body: { full_name: d.full_name, phone: d.phone, city_id: Number(d.city_id) || null } });
          const me = await api('/auth/me');
          setSession(me);
          toast(t('profile.saved'), { type: 'success' });
        } catch (err) { showErrors(mf, err); }
      });
    });

    const pf = $('#pw-form', p);
    pf.addEventListener('submit', (e) => {
      e.preventDefault();
      clearErrors(pf);
      const d = formData(pf);
      withBusy(pf.querySelector('[type=submit]'), async () => {
        try {
          await api('/auth/password', { method: 'POST', body: d });
          pf.reset();
          toast(t('profile.passwordChanged'), { type: 'success' });
        } catch (err) { showErrors(pf, err); }
      });
    });
  }

  ctx.on('notification', () => { loadSummary(); if (['notifications', 'requests', 'tasks'].includes(tab)) renderTab(); });
  loadSummary();
  await renderTab();
}
