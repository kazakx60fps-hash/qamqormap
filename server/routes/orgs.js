// /api/orgs — еріктілер ұйымының кабинеті (тек ұйым мүшелеріне; басқару — тек сол ұйымның координаторына)
import { Router } from 'express';
import { query } from '../db/pool.js';
import { ah, badRequest } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { actionLimiter } from '../middleware/limits.js';
import * as orgs from '../services/orgs.js';
import kk from '../../public/js/i18n/kk.js';
import ru from '../../public/js/i18n/ru.js';
import en from '../../public/js/i18n/en.js';

const DICTS = { kk, ru, en };
const r = Router();
r.use(requireAuth);

const DAY = 864e5;
/** Кезең: from/to — YYYY-MM-DD (to қоса есептеледі). Әдепкі — соңғы 30 күн. */
function period(q) {
  const parse = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00+05:00`) : null);
  let from = parse(q.from);
  let to = parse(q.to);
  if (q.from && !from) throw badRequest('VALIDATION', { from: 'INVALID_DATE' });
  if (q.to && !to) throw badRequest('VALIDATION', { to: 'INVALID_DATE' });
  to = to ? new Date(to.getTime() + DAY) : new Date(Date.now() + DAY);
  from = from || new Date(to.getTime() - 31 * DAY);
  if (from >= to) throw badRequest('VALIDATION', { to: 'END_BEFORE_START' });
  return { from, to, cityId: Number(q.city_id) || null, eventId: Number(q.event_id) || null };
}
const orgId = (req) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n < 1) throw badRequest('ORG_NOT_FOUND');
  return n;
};

r.get('/mine', ah(async (req, res) => {
  res.json({ items: await orgs.userOrgs(req.user.id) });
}));

r.get('/:id', ah(async (req, res) => {
  res.json(await orgs.orgInfo(req.user, orgId(req)));
}));

r.get('/:id/members', ah(async (req, res) => {
  res.json({ items: await orgs.members(req.user, orgId(req)) });
}));

r.get('/:id/requests', ah(async (req, res) => {
  res.json(await orgs.listRequests(req.user, orgId(req), req.query));
}));

r.post('/:id/requests/:rid/accept', actionLimiter, ah(async (req, res) => {
  const rid = Number(req.params.rid);
  if (!Number.isInteger(rid)) throw badRequest('REQUEST_NOT_FOUND');
  res.json(await orgs.accept(req.user, orgId(req), rid));
}));

r.get('/:id/report', ah(async (req, res) => {
  res.json(await orgs.report(req.user, orgId(req), period(req.query)));
}));

r.get('/:id/report.csv', ah(async (req, res) => {
  const rep = await orgs.report(req.user, orgId(req), period(req.query));
  const lang = DICTS[req.query.lang] ? req.query.lang : (req.user.preferred_lang || 'kk');
  const d = DICTS[lang];
  const labels = { ...kk.orgReport.csv, ...d.orgReport.csv };
  for (const code of Object.keys(kk.cat)) labels[`cat_${code}`] = d.cat[code] || kk.cat[code];
  if (rep.filters.city_id) {
    const c = (await query('SELECT name_kk, name_ru, name_en FROM cities WHERE id=$1', [rep.filters.city_id])).rows[0];
    labels.cityName = c ? (lang === 'ru' ? c.name_ru : lang === 'en' ? c.name_en || c.name_ru : c.name_kk) : '';
  }
  if (rep.filters.event_id) {
    labels.eventName = (await query('SELECT title FROM disaster_events WHERE id=$1', [rep.filters.event_id])).rows[0]?.title || '';
  }
  const csv = orgs.reportCsv(rep, labels);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="qamqormap-report-${rep.org.id}-${rep.filters.from.slice(0, 10)}.csv"`,
    'Cache-Control': 'no-store',
  });
  res.send(csv);
}));

export default r;
