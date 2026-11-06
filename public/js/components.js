import {
  esc, stateBadges, catBadge, urgencyBadge, demoBadge, disasterBadge, neededHtml, timeAgo, ugc, fmtKm,
  verificationBadge, activityBadge, cityLabel,
} from './ui.js';
import { icon, DISASTER_ICON } from './icons.js';
import { withCity } from './router.js';
import { t } from './i18n.js';
import { regionLabel } from './state.js';

/** Жария өтініш карточкасы: нақты мекенжай мен телефон жоқ. */
/** Ресурс мөлшері өлшем бірлігімен: «20 бөтелке» (әр түрлі бірліктер ешқашан қосылмайды) */
export const qtyText = (q, unit) => (q != null && unit ? t(`units.${unit}`, { count: Number(q) }) : '');

export function requestCard(r, { selected = false, compact = false } = {}) {
  const placeParts = [r.district, r.public_place].filter(Boolean);
  const place = placeParts.length ? ugc(placeParts.join(' · '), r.content_lang) : esc(t('card.approxPlace'));
  return `<article class="rq-card reveal${selected ? ' is-selected' : ''}" style="--cat:${esc(r.category_color)}" data-id="${r.id}">
    <span class="cat-stripe" aria-hidden="true"></span>
    <div class="rq-top">${catBadge(r)}${disasterBadge(r)}${stateBadges(r)}${urgencyBadge(r.urgency)}${demoBadge(r)}</div>
    <h3><a href="${withCity(`/requests/${r.id}`)}" data-ugc lang="${esc(r.content_lang || 'kk')}">${esc(r.title)}</a></h3>
    ${compact ? '' : `<p class="rq-summary" data-ugc lang="${esc(r.content_lang || 'kk')}">${esc(r.summary || '')}</p>`}
    <div class="rq-meta">
      <span>${icon('pin')}<span>${esc(cityLabel(r.city_id) || r.city_name)} · ${place}</span></span>
      <span>${icon('calendar')}${neededHtml(r)}</span>
      ${r.distance_km != null ? `<span>${icon('target')}≈ ${esc(fmtKm(r.distance_km))} ${esc(t('unit.km'))}</span>` : ''}
      ${r.applications_count ? `<span>${icon('users')}${esc(t('card.offers', { count: r.applications_count }))}</span>` : ''}
      ${r.quantity ? `<span class="rq-qty">${icon('layers')}${esc(qtyText(r.quantity, r.quantity_unit))}</span>` : ''}
      <span class="subtle">${icon('clock')}${esc(timeAgo(r.published_at || r.created_at))}</span>
    </div>
  </article>`;
}

/** Оқиға аймағы: қалалар, облыстар немесе нүкте сипаттамасы */
export function eventAreaText(e) {
  const parts = [];
  for (const a of e.areas || []) {
    if (a.city_id) parts.push(cityLabel(a.city_id));
    else if (a.region_code) parts.push(regionLabel(a.region_code));
  }
  return parts;
}

/** Апат оқиғасының карточкасы */
export function eventCard(e, { selected = false, compact = false } = {}) {
  const areas = eventAreaText(e);
  return `<article class="ev-card reveal${selected ? ' is-selected' : ''}${e.activity_status === 'resolved' ? ' is-resolved' : ''}" style="--ev:${esc(e.type_color)}" data-event-id="${e.id}">
    <div class="ev-head">
      <span class="ev-ico">${icon(DISASTER_ICON[e.type_code] || 'alert')}</span>
      <div class="ev-tags">
        <span class="badge badge-ev">${esc(t(`dtype.${e.type_code}`))}</span>
        ${verificationBadge(e.verification_status)}${activityBadge(e.activity_status)}
      </div>
    </div>
    ${e.is_demo ? `<p class="ev-demo">${icon('info')}${esc(t('demo.eventBanner'))}</p>` : ''}
    <h3><a href="${withCity(`/events/${e.id}`)}" data-ugc lang="${esc(e.content_lang || 'kk')}">${esc(e.title)}</a></h3>
    ${compact ? '' : `<p class="ev-summary" data-ugc lang="${esc(e.content_lang || 'kk')}">${esc(e.summary || '')}</p>`}
    <div class="rq-meta">
      ${areas.length ? `<span>${icon('pin')}<span>${esc(areas.join(', '))}</span></span>` : ''}
      ${e.location_note ? `<span>${icon('map')}${ugc(e.location_note, e.content_lang)}</span>` : ''}
      <span>${icon('refresh')}${esc(t('event.updated', { time: timeAgo(e.updated_at) }))}</span>
      <span>${icon('inbox')}${esc(t('event.requestsCount', { count: e.requests_count || 0 }))}</span>
    </div>
  </article>`;
}

/** Табиғи апаттар бөліміндегі міндетті ескерту */
export function emergencyNotice() {
  return `<div class="alert alert-emergency" role="note">${icon('siren')}<div><strong>${esc(t('disaster.emergencyTitle'))}</strong>${esc(t('disaster.emergencyText'))}</div></div>`;
}
