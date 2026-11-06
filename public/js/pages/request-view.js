import { api } from '../api.js';
import { state, cityLabel } from '../state.js';
import { icon, DISASTER_ICON } from '../icons.js';
import {
  esc, catBadge, urgencyBadge, demoBadge, stateBadges, disasterBadge, fmtDate, neededHtml, timeAgo, avatar, ugc, originalNote,
  loadingState, errorState, emptyState, toast, toastError, withBusy, confirmDialog, reasonDialog, $, $$, catLabel, fmtKm,
  verificationBadge, field, showErrors, openDialog,
} from '../ui.js';
import { t, th } from '../i18n.js';
import { withCity } from '../router.js';
import { qtyText, emergencyNotice } from '../components.js';
import { createMap, hasLeaflet, markerIcon } from '../mapkit.js';

const EVENT_TONE = {
  created: ['info', 'plus'], submitted: ['info', 'send'], resubmitted: ['info', 'refresh'], edited: ['info', 'edit'],
  approved: ['ok', 'checkCircle'], rejected: ['warn', 'alert'], duplicate: ['warn', 'copy'], applied: ['info', 'hand'],
  withdrawn: ['info', 'arrowLeft'], assigned: ['ok', 'user'], unassigned: ['warn', 'swap'], started: ['info', 'play'],
  completion_submitted: ['info', 'flag'], completed: ['ok', 'checkCircle'], disputed: ['warn', 'alert'],
  dispute_resolved: ['info', 'shield'], cancelled: ['warn', 'ban'], event_linked: ['info', 'alert'], event_unlinked: ['info', 'x'],
};
const STEPS = ['open', 'assigned', 'in_progress', 'awaiting_confirmation', 'completed'];

/** Ұсыныс/қайталау себебінің параметрлерін таңдалған тілге дайындау */
function reasonParams(p = {}) {
  const out = { ...p };
  if (p.city_id) out.city = cityLabel(p.city_id);
  if (p.category) out.category = catLabel(p.category);
  if (p.dow) out.day = t('date.days')[p.dow % 7];
  if (p.km != null) out.km = fmtKm(p.km);
  return out;
}

export default async function requestView(ctx) {
  const id = ctx.params.id;
  const R = ctx.root;
  let d = null;
  let map = null;
  let lastMsgId = 0;
  R.innerHTML = `<div class="container">${loadingState(t('request.loading'))}</div>`;

  async function load({ keepScroll = false } = {}) {
    const y = scrollY;
    try {
      d = await api(`/requests/${id}`);
    } catch (err) {
      R.innerHTML = `<div class="container" style="padding-top:32px">${errorState(err)}
        <div style="text-align:center"><a class="btn" href="${withCity('/map')}">${esc(t('request.backToMap'))}</a></div></div>`;
      R.querySelector('[data-retry]')?.addEventListener('click', () => load());
      return;
    }
    draw();
    if (keepScroll) window.scrollTo({ top: y });
  }

  function draw() {
    const { request: r, viewer: v } = d;
    document.title = `${r.title} — QamqorMap`;
    map?.remove();
    map = null;
    const stepIdx = STEPS.indexOf(r.status);
    R.innerHTML = `
    <div class="container">
      <div class="page-head" style="padding-bottom:18px">
        <nav class="crumbs" aria-label="${esc(t('common.breadcrumbs'))}"><a href="${withCity('/')}">${esc(t('nav.home'))}</a>${icon('chevRight')}<a href="${withCity('/map')}">${esc(t('nav.map'))}</a>${icon('chevRight')}<span>${esc(t('request.number', { id: r.id }))}</span></nav>
      </div>
      <div class="rq-layout">
        <div class="rq-main">
          <div>
            <div class="row" style="gap:8px">${catBadge(r)}${disasterBadge(r)}${stateBadges(r)}${urgencyBadge(r.urgency)}${demoBadge(r)}${r.org ? `<span class="badge badge-assigned" data-ugc>${icon('users').replace('<svg class=""', '<svg class="ico-sm"')}${esc(r.org.name)}</span>` : ''}</div>
            <h1 class="rq-title" data-ugc lang="${esc(r.content_lang)}">${esc(r.title)}</h1>
            <div class="rq-meta" style="margin-top:14px;font-size:var(--fs-md)">
              <span>${icon('pin')}${esc(cityLabel(r.city_id))}${r.district ? ' · ' + ugc(r.district, r.content_lang) : ''}</span>
              <span>${icon('calendar')}${neededHtml(r)}</span>
              ${r.quantity ? `<span>${icon('layers')}${esc(qtyText(r.quantity, r.quantity_unit))}</span>` : ''}
              <span>${icon('clock')}${esc(r.published_at ? t('request.publishedAgo', { time: timeAgo(r.published_at) }) : t('request.createdAgo', { time: timeAgo(r.created_at) }))}</span>
            </div>
          </div>
          ${stateAlerts(r, v)}
          ${eventBlock(r)}
          ${r.moderation_status === 'approved' && r.status !== 'cancelled' ? `
            <div class="progress-steps" aria-label="${esc(t('request.stage', { stage: t(`status.${r.status}`) }))}">
              ${STEPS.map((s, i) => `<div class="ps ${i < stepIdx || r.status === 'completed' ? 'is-done' : i === stepIdx ? 'is-current' : ''}"><span class="bar"></span><span>${esc(t(`steps.${s}`))}</span></div>`).join('')}
            </div>` : ''}
          <section class="card card-pad" aria-labelledby="desc-h">
            <h2 id="desc-h" class="sr-only">${esc(t('request.description'))}</h2>
            ${originalNote(r.content_lang)}
            <p class="rq-desc" data-ugc lang="${esc(r.content_lang)}">${esc(r.description)}</p>
            ${d.attachments.length ? `<div class="photos" style="margin-top:20px">${d.attachments.map((x) => `<figure><a href="/api/attachments/${x.id}" target="_blank" rel="noopener"><img src="/api/attachments/${x.id}" alt="${esc(t('request.photoAlt'))}" loading="lazy"></a>${v.can_see_private ? `<figcaption><span class="badge">${esc(t(x.visibility === 'public' ? 'request.photoPublic' : 'request.photoPrivate'))}</span></figcaption>` : ''}</figure>`).join('')}</div>` : ''}
          </section>
          ${chatSection(r, v)}
          <section class="panel" aria-labelledby="hist-h">
            <div class="panel-head"><h2 id="hist-h">${esc(t('request.history'))}</h2><span class="muted" style="font-size:var(--fs-sm)">${esc(t('request.eventsCount', { count: d.events.length }))}</span></div>
            <div class="panel-body"><ol class="timeline">${d.events.map((e) => {
              const [tone, ico] = EVENT_TONE[e.type] || ['info', 'info'];
              const who = e.actor_name ? `${ugc(e.actor_name)} (${esc(t(`role.${e.actor_role}`))})` : esc(t(`role.${e.actor_role}`));
              return `<li class="tl-item ${tone}"><span class="tl-ico">${icon(ico)}</span><div class="tl-text">
                <b>${esc(t(`reqEvent.${e.type}`))}</b> <span class="muted">· ${who}</span>
                <time datetime="${esc(e.created_at)}">${esc(fmtDate(e.created_at))}</time>
                ${e.note ? `<div class="tl-note">${ugc(e.note)}</div>` : ''}</div></li>`;
            }).join('')}</ol></div>
          </section>
        </div>
        <aside class="rq-side">
          ${actionsPanel(r, v)}
          <section class="panel" aria-labelledby="det-h">
            <div class="panel-head"><h2 id="det-h">${esc(t('request.details'))}</h2></div>
            <div class="panel-body">
              <dl class="kv">
                <dt>${esc(t('form.category'))}</dt><dd>${esc(catLabel(r.category_code))}</dd>
                <dt>${esc(t('form.city'))}</dt><dd>${esc(cityLabel(r.city_id))}</dd>
                ${r.district ? `<dt>${esc(t('form.district'))}</dt><dd>${ugc(r.district, r.content_lang)}</dd>` : ''}
                ${r.public_place ? `<dt>${esc(t('request.approxPlace'))}</dt><dd>${ugc(r.public_place, r.content_lang)}</dd>` : ''}
                <dt>${esc(t('request.time'))}</dt><dd>${neededHtml(r)}${r.needed_from && r.needed_note ? `<br><span class="muted">${ugc(r.needed_note, r.content_lang)}</span>` : ''}</dd>
                <dt>${esc(t('form.urgency'))}</dt><dd>${esc(t(`urgency.${r.urgency}`))}</dd>
                <dt>${esc(t('request.author'))}</dt><dd>${ugc(r.author_display)}</dd>
                ${d.assignee ? `<dt>${esc(t('request.assignee'))}</dt><dd>${ugc(d.assignee.full_name)}</dd>` : ''}
              </dl>
              <div class="mini-map" id="mini-map" style="margin-top:18px" aria-label="${esc(t('request.miniMapAria'))}"></div>
              <p class="hint" style="margin-top:8px">${esc(t(v.can_see_private ? 'request.mapExact' : 'request.mapApprox'))}</p>
            </div>
          </section>
          ${privateSection(v)}
          ${applicationsPanel(r, v)}
          ${recommendationsPanel()}
          ${duplicatesPanel(r)}
        </aside>
      </div>
    </div>`;
    drawMiniMap();
    bindActions();
    if (v.can_chat) initChat();
  }

  function stateAlerts(r, v) {
    const out = [];
    if (r.moderation_status === 'draft') out.push(['info', t('request.alert.draftTitle'), esc(t('request.alert.draftText'))]);
    if (r.moderation_status === 'pending') out.push(['warn', t('request.alert.pendingTitle'), esc(t('request.alert.pendingText'))]);
    if (r.moderation_status === 'rejected') out.push(['error', t('request.alert.rejectedTitle'), r.rejection_reason ? ugc(r.rejection_reason) : r.duplicate_of ? esc(t('request.duplicateOf', { id: r.duplicate_of })) : esc(t('request.alert.rejectedText'))]);
    if (r.status === 'cancelled') out.push(['warn', t('request.alert.cancelledTitle'), r.cancel_reason ? ugc(r.cancel_reason) : '']);
    if (r.status === 'completed') out.push(['success', t('request.alert.completedTitle'), esc(t('request.alert.completedText', { date: fmtDate(r.completed_at) }))]);
    if (r.disputed && (v.is_author || v.is_coordinator || v.is_assignee)) out.push(['error', t('request.alert.disputeTitle'), r.dispute_note ? ugc(r.dispute_note) : esc(t('request.alert.disputeText'))]);
    if (r.status === 'awaiting_confirmation' && v.is_author) out.push(['info', t('request.alert.awaitTitle'), esc(t('request.alert.awaitText'))]);
    const ico = { info: 'info', warn: 'alert', error: 'alert', success: 'checkCircle' };
    return out.map(([tone, title, html]) => `<div class="alert alert-${tone}" role="status">${icon(ico[tone])}<div><strong>${esc(title)}</strong>${html}</div></div>`).join('');
  }

  /** Табиғи апатқа байланысты өтініш: оқиға сілтемесі және қауіпсіздік ескертуі */
  function eventBlock(r) {
    if (r.direction !== 'disaster') return '';
    const e = r.event;
    return `<section class="event-link" aria-label="${esc(t('dir.disaster'))}">
      ${e ? `<a class="event-link-card" href="${withCity(`/events/${e.id}`)}">
        <span class="ev-ico" style="--ev:var(--c-red)">${icon(DISASTER_ICON[e.type_code] || 'alert')}</span>
        <span class="grow"><small class="muted">${esc(t('request.linkedEvent'))} · ${esc(t(`dtype.${e.type_code}`))}</small><br>
          <strong data-ugc lang="${esc(e.content_lang)}">${esc(e.title)}</strong>
          <span class="row" style="gap:6px;margin-top:6px">${verificationBadge(e.verification_status)}${e.is_demo ? `<span class="badge badge-demo">${esc(t('demo.eventBadge'))}</span>` : ''}</span></span>
        ${icon('chevRight')}</a>` : ''}
      ${emergencyNotice()}
      <div class="alert alert-warn">${icon('shield')}<div><strong>${esc(t('disaster.safetyTitle'))}</strong>${esc(t('disaster.safetyText'))}</div></div>
    </section>`;
  }

  function actionsPanel(r, v) {
    const btns = [];
    const info = [];
    const myApp = d.my_application;
    if (!v.logged_in && r.moderation_status === 'approved' && r.status === 'open') {
      info.push(t('request.act.loginToHelp'));
      btns.push(`<a class="btn btn-primary btn-block btn-lg" href="${withCity(`/login?next=${encodeURIComponent(`/requests/${r.id}`)}`)}">${icon('hand')}${esc(t('request.act.loginAndHelp'))}</a>`);
    }
    // Ерікті
    if (v.logged_in && !v.is_author && !v.is_assignee && r.moderation_status === 'approved' && r.status === 'open') {
      if (myApp?.status === 'active') {
        info.push(t('request.act.offerSent'));
        btns.push(`<button class="btn btn-danger btn-block" data-act="withdraw">${icon('arrowLeft')}${esc(t('request.act.withdraw'))}</button>`);
      } else {
        info.push(t('request.act.offerHint'));
        btns.push(`<button class="btn btn-coral btn-block btn-lg" data-act="apply">${icon('hand')}${esc(t('request.act.apply'))}</button>`);
      }
    }
    if (v.logged_in && !v.is_author && myApp?.status === 'declined' && r.status !== 'open' && !v.is_assignee) info.push(t('request.act.otherChosen'));
    // Таңдалған орындаушы
    if (v.is_assignee) {
      if (r.status === 'assigned') btns.push(`<button class="btn btn-primary btn-block btn-lg" data-act="start">${icon('play')}${esc(t('request.act.start'))}</button>`);
      if (r.status === 'in_progress') btns.push(`<button class="btn btn-success btn-block btn-lg" data-act="submit-completion">${icon('flag')}${esc(t('request.act.done'))}</button>`);
      if (r.status === 'awaiting_confirmation') info.push(t('request.act.waitConfirm'));
    }
    // Өтініш иесі
    if (v.is_author) {
      if (['draft', 'rejected', 'pending'].includes(r.moderation_status) && r.status === 'open') {
        if (r.moderation_status === 'draft') btns.push(`<button class="btn btn-primary btn-block btn-lg" data-act="submit">${icon('send')}${esc(t('form.submit'))}</button>`);
        btns.push(`<a class="btn btn-block ${r.moderation_status === 'rejected' ? 'btn-primary btn-lg' : ''}" href="${withCity(`/requests/${r.id}/edit`)}">${icon('edit')}${esc(t(r.moderation_status === 'rejected' ? 'form.resubmit' : 'common.edit'))}</a>`);
      }
      if (r.status === 'awaiting_confirmation') {
        btns.push(`<button class="btn btn-success btn-block btn-lg" data-act="confirm">${icon('checkCircle')}${esc(t('request.act.confirm'))}</button>`);
        btns.push(`<button class="btn btn-block" data-act="dispute">${icon('alert')}${esc(t('request.act.dispute'))}</button>`);
      }
      if (r.moderation_status === 'approved' && r.status === 'open' && !d.applications?.some((a) => a.status === 'active')) info.push(t('request.act.offersWillAppear'));
    }
    // Координатор
    if (v.is_coordinator) {
      if (r.moderation_status === 'pending') {
        btns.push(`<button class="btn btn-success btn-block btn-lg" data-act="approve">${icon('checkCircle')}${esc(t('request.act.approve'))}</button>`);
        btns.push(`<button class="btn btn-block" data-act="reject">${icon('edit')}${esc(t('request.act.reject'))}</button>`);
      }
      if (r.disputed && !['completed', 'cancelled'].includes(r.status)) {
        btns.push(`<button class="btn btn-success btn-block" data-act="resolve-complete">${icon('checkCircle')}${esc(t('request.act.resolveComplete'))}</button>`);
        btns.push(`<button class="btn btn-block" data-act="resolve-continue">${icon('play')}${esc(t('request.act.resolveContinue'))}</button>`);
      }
      if (r.status === 'awaiting_confirmation' && !v.is_author && !r.disputed) btns.push(`<button class="btn btn-block" data-act="confirm">${icon('shield')}${esc(t('request.act.confirmAsCoord'))}</button>`);
      if (['assigned', 'in_progress'].includes(r.status) && d.assignee) {
        btns.push(`<button class="btn btn-block" data-act="reassign">${icon('swap')}${esc(t('request.act.reassign'))}</button>`);
        btns.push(`<button class="btn btn-block" data-act="unassign">${icon('refresh')}${esc(t('request.act.unassign'))}</button>`);
      }
      if (r.direction === 'disaster' && !['completed', 'cancelled'].includes(r.status)) {
        btns.push(`<button class="btn btn-block" data-act="link-event">${icon('alert')}${esc(t(r.disaster_event_id ? 'request.act.changeEvent' : 'request.act.linkEvent'))}</button>`);
      }
    }
    if ((v.is_author || v.is_coordinator) && ['open', 'assigned', 'in_progress', 'awaiting_confirmation'].includes(r.status) && r.moderation_status !== 'draft') {
      btns.push(`<button class="btn btn-ghost btn-block" data-act="cancel" style="color:var(--c-red)">${icon('ban')}${esc(t('request.act.cancel'))}</button>`);
    }
    if (v.is_author && r.moderation_status === 'draft') btns.push(`<button class="btn btn-ghost btn-block" data-act="cancel" style="color:var(--c-red)">${icon('ban')}${esc(t('request.act.cancelDraft'))}</button>`);
    if (!btns.length && !info.length) {
      if (r.status === 'completed') info.push(t('request.act.completedInfo'));
      else if (r.status === 'cancelled') info.push(t('request.act.cancelledInfo'));
      else if (v.logged_in && !v.is_author && r.status !== 'open') info.push(t('request.act.otherChosen2'));
      else return '';
    }
    const roleBadge = v.is_org_coordinator && !v.is_coordinator ? `<span class="badge badge-assigned">${esc(t('role.org_coordinator'))}</span>` : v.is_coordinator ? `<span class="badge badge-assigned">${esc(t('role.coordinator'))}</span>` : v.is_author ? `<span class="badge">${esc(t('request.yours'))}</span>` : v.is_assignee ? `<span class="badge badge-completed">${esc(t('request.youAssignee'))}</span>` : '';
    return `<section class="panel" aria-labelledby="act-h">
      <div class="panel-head"><h2 id="act-h">${esc(t('request.actions'))}</h2>${roleBadge}</div>
      <div class="panel-body action-stack">
        ${info.map((x) => `<p class="muted" style="font-size:var(--fs-sm)">${esc(x)}</p>`).join('')}
        ${btns.join('')}
      </div></section>`;
  }

  function privateSection(v) {
    if (v.can_see_private && d.private) {
      const p = d.private;
      return `<section class="private-box" aria-labelledby="priv-h">
        <h3 id="priv-h">${icon('lock')}${esc(t('request.private.title'))}</h3>
        <dl class="kv"><dt>${esc(t('form.address'))}</dt><dd>${ugc(p.address)}</dd>
          <dt>${esc(t('form.phone'))}</dt><dd><a href="tel:${esc(p.contact_phone.replace(/\s/g, ''))}">${esc(p.contact_phone)}</a></dd></dl>
        <p class="hint" style="margin-top:10px">${esc(t('request.private.hint'))}</p>
      </section>`;
    }
    if (d.request.moderation_status === 'approved' && !['completed', 'cancelled'].includes(d.request.status)) {
      return `<div class="locked-box">${icon('lock')}<span>${esc(t('request.private.locked'))}</span></div>`;
    }
    return '';
  }

  function applicationsPanel(r, v) {
    if (!d.applications) return '';
    const apps = d.applications;
    const canPick = r.status === 'open' && r.moderation_status === 'approved' && (v.is_author || v.is_coordinator || v.is_org_coordinator);
    const st = { active: 'badge-open', accepted: 'badge-completed', withdrawn: 'badge-cancelled', declined: 'badge-cancelled' };
    return `<section class="panel" aria-labelledby="apps-h">
      <div class="panel-head"><h2 id="apps-h">${esc(t('request.apps.title'))}</h2><span class="badge">${esc(t('request.apps.active', { count: apps.filter((a) => a.status === 'active').length }))}</span></div>
      <div class="panel-body">${apps.length ? apps.map((a) => `
        <div class="app-item">${avatar(a.full_name)}
          <div class="grow"><strong data-ugc>${esc(a.full_name)}</strong> <span class="badge ${st[a.status]}">${esc(t(`appStatus.${a.status}`))}</span>
            <div class="muted" style="font-size:var(--fs-xs)">${a.volunteer_city_id ? esc(t('org.volunteerCity', { city: cityLabel(a.volunteer_city_id) })) + ' · ' : ''}${a.district ? ugc(a.district) + ' · ' : ''}${esc(t('request.apps.completedCount', { count: a.completed_count }))} · ${esc(timeAgo(a.created_at))}</div>
            ${r.org ? `<div class="row" style="gap:6px;margin-top:6px">${a.in_org_team ? `<span class="badge badge-assigned">${esc(t('org.tabs.team'))}</span>` : ''}<span class="badge ${a.category_match ? 'badge-completed' : ''}">${esc(t(a.category_match ? 'org.categoryMatch' : 'org.categoryNo'))}</span></div>` : ''}
            ${a.message ? `<p data-ugc>${esc(a.message)}</p>` : ''}
            ${canPick && a.status === 'active' && (!v.is_org_coordinator || v.is_author || v.is_coordinator || a.in_org_team) ? `<button class="btn btn-primary btn-sm" style="margin-top:10px" data-act="assign" data-app="${a.id}" data-name="${esc(a.full_name)}">${icon('check')}${esc(t('request.apps.choose'))}</button>` : ''}
          </div></div>`).join('')
        : `<p class="muted" style="font-size:var(--fs-sm)">${esc(t(r.moderation_status === 'approved' ? 'request.apps.none' : 'request.apps.noneYet'))}</p>`}
      </div></section>`;
  }

  function recommendationsPanel() {
    if (!d.recommendations) return '';
    const recs = d.recommendations;
    return `<section class="panel" aria-labelledby="rec-h">
      <div class="panel-head"><h2 id="rec-h">${esc(t('request.reco.title'))}</h2></div>
      <div class="panel-body">
        <p class="hint" style="margin-bottom:12px">${esc(t(d.request.direction === 'disaster' ? 'request.reco.hintDisaster' : 'request.reco.hint'))}</p>
        ${recs.length ? recs.map((x) => `<div class="reco">
          <div class="row" style="justify-content:space-between"><strong data-ugc>${esc(x.full_name)}</strong>
            <span class="badge ${x.application_status === 'active' ? 'badge-open' : ''}">${esc(t(x.application_status === 'active' ? 'request.reco.applied' : 'request.reco.waiting'))}</span></div>
          <ul>${x.reasons.map((y) => `<li class="ok">${icon('check')}${esc(t(`reco.${y.code}`, reasonParams(y.params)))}</li>`).join('')}${x.warnings.map((y) => `<li class="warn">${icon('alert')}${esc(t(`reco.${y.code}`, reasonParams(y.params)))}</li>`).join('')}</ul>
        </div>`).join('') : `<p class="muted" style="font-size:var(--fs-sm)">${esc(t('request.reco.none'))}</p>`}
      </div></section>`;
  }

  function duplicatesPanel(r) {
    if (!d.duplicates) return '';
    return `<section class="panel" aria-labelledby="dup-h">
      <div class="panel-head"><h2 id="dup-h">${esc(t('request.dup.title'))}</h2><span class="badge ${d.duplicates.length ? 'badge-pending' : ''}">${d.duplicates.length}</span></div>
      <div class="panel-body">${d.duplicates.length ? d.duplicates.map((x) => `
        <div class="dup-item"><a href="${withCity(`/requests/${x.id}`)}"><strong>№${x.id} <span data-ugc>${esc(x.title)}</span></strong></a>
          <ul>${x.reasons.map((y) => `<li>${th(`dup.${y.code}`, reasonParams(y.params), { ugc: ['district', 'words'] })}</li>`).join('')}</ul>
          ${r.moderation_status === 'pending' ? `<button class="btn btn-sm" data-act="mark-dup" data-dup="${x.id}">${icon('copy')}${esc(t('request.dup.mark'))}</button>` : ''}
        </div>`).join('') : `<p class="muted" style="font-size:var(--fs-sm)">${esc(t('request.dup.none'))}</p>`}
        <p class="hint" style="margin-top:10px">${esc(t('request.dup.hint'))}</p>
      </div></section>`;
  }

  function chatSection(r, v) {
    if (v.can_chat) {
      return `<section class="panel" aria-labelledby="chat-h">
        <div class="panel-head"><h2 id="chat-h">${icon('chat').replace('<svg class=""', '<svg class="ico-head"')}${esc(t('chat.title'))}</h2>
          <span class="muted" style="font-size:var(--fs-xs)">${esc(t('chat.who'))}</span></div>
        <div class="chat"><div class="chat-log" id="chat-log" aria-live="polite">${loadingState(t('chat.loading'))}</div>
          ${r.status === 'cancelled' ? `<p class="muted" style="padding:14px;border-top:1px solid var(--c-border)">${esc(t('errors.CHAT_CLOSED'))}</p>` : `
          <form class="chat-form" id="chat-form" novalidate>
            <label class="sr-only" for="chat-input">${esc(t('chat.message'))}</label>
            <textarea class="textarea" id="chat-input" name="body" maxlength="2000" placeholder="${esc(t('chat.placeholder'))}" required></textarea>
            <button class="btn btn-primary btn-icon" type="submit" aria-label="${esc(t('common.send'))}" style="width:52px;min-height:50px">${icon('send')}</button>
          </form>`}</div></section>`;
    }
    if (v.logged_in && r.moderation_status === 'approved') return `<div class="locked-box">${icon('chat')}<span>${esc(t('errors.CHAT_FORBIDDEN'))}</span></div>`;
    return '';
  }

  // ───── Хаттар ─────
  function msgHtml(m) {
    const mine = state.user && m.sender_id === state.user.id;
    return `<div class="msg ${mine ? 'mine' : ''} role-${esc(m.sender_role)}" data-mid="${m.id}">
      <span class="who">${mine ? esc(t('chat.you')) : `<span data-ugc>${esc(m.sender_name)}</span>`}${m.sender_role === 'coordinator' && !mine ? ` · ${esc(t('role.coordinator'))}` : ''} · ${esc(fmtDate(m.created_at))}</span>
      <div class="bubble" data-ugc>${esc(m.body)}</div></div>`;
  }
  function appendMessages(list) {
    const log = $('#chat-log', R);
    if (!log) return;
    const fresh = list.filter((m) => m.id > lastMsgId && !log.querySelector(`[data-mid="${m.id}"]`));
    if (!fresh.length) return;
    log.querySelector('.state')?.remove();
    log.insertAdjacentHTML('beforeend', fresh.map(msgHtml).join(''));
    lastMsgId = Math.max(lastMsgId, ...fresh.map((m) => m.id));
    log.scrollTop = log.scrollHeight;
  }
  async function initChat() {
    const log = $('#chat-log', R);
    lastMsgId = 0;
    try {
      const res = await api(`/requests/${id}/messages`);
      if (!res.items.length) log.innerHTML = emptyState({ title: t('chat.emptyTitle'), text: t('chat.emptyText'), ico: 'chat' });
      else { log.innerHTML = ''; appendMessages(res.items); }
    } catch (err) {
      log.innerHTML = errorState(err);
      log.querySelector('[data-retry]')?.addEventListener('click', initChat);
    }
    const form = $('#chat-form', R);
    if (!form) return;
    const input = form.body;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body) { input.focus(); return; }
      await withBusy(form.querySelector('button'), async () => {
        try {
          const m = await api(`/requests/${id}/messages`, { method: 'POST', body: { body } });
          input.value = '';
          appendMessages([m]);
        } catch (err) { toastError(err); }
      });
      input.focus();
    });
  }

  // ───── Мини-карта ─────
  function drawMiniMap() {
    const el = $('#mini-map', R);
    if (!hasLeaflet()) {
      el.innerHTML = `<div class="map-unavailable"><p class="muted">${esc(t('map.unavailable'))}</p></div>`;
      return;
    }
    const r = d.request;
    const exact = d.viewer.can_see_private && d.private;
    const pt = exact ? [d.private.exact_lat, d.private.exact_lng] : [r.approx_lat, r.approx_lng];
    try {
      map = createMap(el, { center: pt, zoom: 14 });
      if (exact) L.marker(pt, { icon: markerIcon(r) }).addTo(map);
      else L.circle(pt, { radius: 450, color: r.category_color, weight: 2, fillOpacity: 0.15 }).addTo(map);
    } catch { el.innerHTML = `<div class="map-unavailable"><p class="muted">${esc(t('map.unavailable'))}</p></div>`; }
  }

  // ───── Әрекеттер ─────
  const post = (path, body) => api(`/requests/${id}${path}`, { method: 'POST', body: body || {} });
  const done = async (msg) => { toast(msg, { type: 'success' }); await load({ keepScroll: true }); };

  function bindActions() {
    $$('[data-act]', R).forEach((b) => b.addEventListener('click', () => onAct(b)));
  }

  function applyDialog() {
    const disaster = d.request.direction === 'disaster';
    const extra = disaster ? `<div class="alert alert-warn">${icon('shield')}<div><strong>${esc(t('disaster.safetyTitle'))}</strong>${esc(t('disaster.safetyText'))}</div></div>
      <div class="field" data-field="safety_ack"><label class="checkbox"><input type="checkbox" name="safety_ack" id="f-safety_ack"> ${esc(t('disaster.safetyAck'))}</label>
      <span class="field-error" aria-live="polite"></span></div>` : '';
    reasonDialog({
      title: t('request.dlg.applyTitle'), label: t('request.dlg.applyLabel'), required: false, min: 0, okLabel: t('request.dlg.applyOk'), okCls: 'btn-coral',
      text: t('request.dlg.applyText'), placeholder: t('request.dlg.applyPh'), fieldName: 'message', extra,
      onSubmit: async (msg, form) => {
        if (disaster && !form.safety_ack.checked) {
          throw { message: t('errors.SAFETY_ACK_REQUIRED'), fields: { safety_ack: { code: 'SAFETY_ACK' } } };
        }
        await post('/applications', { message: msg, safety_ack: disaster ? true : undefined });
        await done(t('request.done.applied'));
      },
    });
  }

  async function linkEventDialog() {
    let events = [];
    try { events = (await api('/events', { query: { activity: 'active', limit: 100 } })).items; } catch (err) { return toastError(err); }
    const cur = d.request.disaster_event_id;
    openDialog({
      title: t('request.act.linkEvent'),
      body: `<form class="stack" novalidate>${field({ name: 'disaster_event_id', label: t('form.event'), control: `<select class="select" id="f-disaster_event_id" name="ev">
          <option value="">${esc(t('form.noEvent'))}</option>
          ${events.map((e) => `<option data-ugc value="${e.id}" ${e.id === cur ? 'selected' : ''}>${esc(t(`dtype.${e.type_code}`))} — ${esc(e.title)}</option>`).join('')}</select>` })}
        <div class="form-alert" tabindex="-1"></div></form>`,
      actions: [
        { label: t('common.cancel'), cls: 'btn-ghost' },
        { label: t('common.save'), cls: 'btn-primary', onClick: async ({ close, dlg }) => {
          const form = dlg.querySelector('form');
          try {
            await post('/event', { event_id: form.ev.value ? Number(form.ev.value) : null });
            close();
            await done(t('request.done.eventLinked'));
          } catch (err) { showErrors(form, err); }
        } },
      ],
    });
  }

  async function onAct(b) {
    const act = b.dataset.act;
    const run = (fn, msg) => withBusy(b, async () => {
      try { await fn(); await done(msg); } catch (err) { toastError(err); if (err.status === 409) load({ keepScroll: true }); }
    });
    switch (act) {
      case 'apply': return applyDialog();
      case 'withdraw':
        return confirmDialog({ title: t('request.act.withdraw'), text: t('request.dlg.withdrawText'), okLabel: t('request.dlg.withdrawOk'), okCls: 'btn-danger',
          onConfirm: async () => { await api(`/requests/${id}/applications/mine`, { method: 'DELETE' }); await done(t('request.done.withdrawn')); } });
      case 'assign':
        return confirmDialog({ title: t('request.dlg.assignTitle'), text: t('request.dlg.assignText', { name: b.dataset.name }), okLabel: t('request.dlg.assignOk'),
          onConfirm: async () => { await post('/assign', { application_id: Number(b.dataset.app) }); await done(t('request.done.assigned')); } });
      case 'start': return run(() => post('/start'), t('request.done.started'));
      case 'submit-completion':
        return reasonDialog({ title: t('request.act.done'), label: t('request.dlg.reportLabel'), required: false, min: 0, okLabel: t('request.dlg.reportOk'), okCls: 'btn-success',
          text: t('request.dlg.reportText'), placeholder: t('request.dlg.reportPh'), fieldName: 'note',
          onSubmit: async (note) => { await post('/submit-completion', { note }); await done(t('request.done.reported')); } });
      case 'confirm':
        return confirmDialog({ title: t('request.act.confirm'), text: t('request.dlg.confirmText'), okLabel: t('request.dlg.confirmOk'), okCls: 'btn-success',
          onConfirm: async () => { const res = await post('/confirm-completion'); await done(t(res.already ? 'request.done.alreadyConfirmed' : 'request.done.confirmed')); } });
      case 'dispute':
        return reasonDialog({ title: t('request.act.dispute'), label: t('request.dlg.disputeLabel'), okLabel: t('request.dlg.disputeOk'), okCls: 'btn-danger',
          text: t('request.dlg.disputeText'), fieldName: 'note',
          onSubmit: async (note) => { await post('/dispute', { note }); await done(t('request.done.disputed')); } });
      case 'submit': return run(() => post('/submit'), t('form.sentToReview'));
      case 'approve': return run(() => post('/review', { decision: 'approve' }), t('request.done.approved'));
      case 'reject':
        return reasonDialog({ title: t('request.act.reject'), label: t('request.dlg.rejectLabel'), okLabel: t('request.dlg.rejectOk'), okCls: 'btn-danger',
          placeholder: t('request.dlg.rejectPh'),
          onSubmit: async (reason) => { await post('/review', { decision: 'reject', reason }); await done(t('request.done.rejected')); } });
      case 'mark-dup':
        return reasonDialog({ title: t('request.dlg.dupTitle', { id: b.dataset.dup }), label: t('common.comment'), required: false, min: 0, okLabel: t('request.dup.mark'), okCls: 'btn-danger',
          text: t('request.dlg.dupText'),
          onSubmit: async (reason) => { await post('/duplicate', { duplicate_of: Number(b.dataset.dup), reason }); await done(t('request.done.duplicate')); } });
      case 'resolve-complete':
        return reasonDialog({ title: t('request.act.resolveComplete'), label: t('request.dlg.decisionLabel'), required: false, min: 0, okLabel: t('common.confirm'), okCls: 'btn-success', fieldName: 'note',
          onSubmit: async (note) => { await post('/resolve-dispute', { decision: 'complete', note }); await done(t('request.done.disputeCompleted')); } });
      case 'resolve-continue':
        return reasonDialog({ title: t('request.act.resolveContinue'), label: t('request.dlg.decisionLabel'), required: false, min: 0, okLabel: t('common.save'), fieldName: 'note',
          onSubmit: async (note) => { await post('/resolve-dispute', { decision: 'continue', note }); await done(t('request.done.decisionSaved')); } });
      case 'unassign':
        return reasonDialog({ title: t('request.act.unassign'), okLabel: t('request.dlg.unassignOk'), okCls: 'btn-danger', text: t('request.dlg.unassignText'),
          onSubmit: async (reason) => { await post('/unassign', { reason }); await done(t('request.done.unassigned')); } });
      case 'reassign': {
        const options = (d.applications || []).filter((a) => a.status === 'active');
        if (!options.length) return toast(t('request.dlg.noReassign'), { type: 'error', timeout: 7000 });
        return reasonDialog({ title: t('request.act.reassign'), label: t('request.dlg.reassignReason'), okLabel: t('request.dlg.reassignOk'),
          extra: `<div class="field"><label for="f-newapp">${esc(t('request.dlg.newAssignee'))}</label><select class="select" id="f-newapp" name="newapp">${options.map((a) => `<option value="${a.id}">${esc(a.full_name)}</option>`).join('')}</select></div>`,
          onSubmit: async (reason, form) => { await post('/assign', { application_id: Number(form.newapp.value), reason, replace: true }); await done(t('request.done.reassigned')); } });
      }
      case 'link-event': return linkEventDialog();
      case 'cancel':
        return reasonDialog({ title: t('request.act.cancel'), label: t('request.dlg.cancelLabel'), okLabel: t('request.dlg.cancelOk'), okCls: 'btn-danger', text: t('request.dlg.cancelText'),
          onSubmit: async (reason) => { await post('/cancel', { reason }); await done(t('request.done.cancelled')); } });
      default:
        return undefined;
    }
  }

  ctx.on('request-changed', (e) => { if (e.id === id) load({ keepScroll: true }); });
  ctx.on('notification', (n) => { if (n.request_id === id) load({ keepScroll: true }); });
  ctx.on('chat-message', (e) => { if (e.request_id === id) appendMessages([e.message]); });
  // SSE үзілген жағдайға арналған қосымша тексеру
  const poll = setInterval(async () => {
    if (!d?.viewer.can_chat || document.hidden) return;
    try { appendMessages((await api(`/requests/${id}/messages`, { query: { after: lastMsgId } })).items); } catch { /* */ }
  }, 20000);
  ctx.onCleanup(() => { clearInterval(poll); map?.remove(); });
  await load();
  void th;
}
