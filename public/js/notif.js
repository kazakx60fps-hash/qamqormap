import { t, th, has } from './i18n.js';
import { cityLabel } from './state.js';

/**
 * Ішкі хабарламаның мәтіні алушының таңдаған тілінде.
 * Хабарлама параметрлерінде қолданушы мәтіні (өтініш атауы, себеп) өзгеріссіз қалады.
 * Параметрі жоқ ескі хабарламалар үшін базадағы мәтін көрсетіледі.
 */
export function notifText(n) {
  const p = { ...(n.params || {}) };
  const hasParams = Object.keys(p).length > 0;
  if (!hasParams || !has(`notif.${n.type}.title`)) return { title: n.title, body: n.body };
  if (p.type) p.type = t(`dtype.${p.type}`);
  if (p.city_id) p.city = cityLabel(p.city_id);
  return { title: t(`notif.${n.type}.title`, p), body: t(`notif.${n.type}.body`, p) };
}

export function notifLink(n) {
  if (n.request_id) return `/requests/${n.request_id}`;
  if (n.params?.event_id) return `/events/${n.params.event_id}`;
  if (n.type === 'report_new') return '/coordinator?view=reports';
  return null;
}

const UGC_PARAMS = ['title', 'name', 'reason', 'note', 'text', 'event_title', 'original_title'];
/** HTML нұсқасы: қолданушы мәтіні (атау, есім, себеп) data-ugc ретінде белгіленеді */
export function notifHtml(n) {
  const p = { ...(n.params || {}) };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  if (!Object.keys(p).length || !has(`notif.${n.type}.title`)) return { title: `<span data-ugc>${esc(n.title)}</span>`, body: n.body ? `<span data-ugc>${esc(n.body)}</span>` : '' };
  if (p.type) p.type = t(`dtype.${p.type}`);
  return { title: th(`notif.${n.type}.title`, p, { ugc: UGC_PARAMS }), body: th(`notif.${n.type}.body`, p, { ugc: UGC_PARAMS }) };
}
