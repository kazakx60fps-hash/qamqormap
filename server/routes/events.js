import { Router } from 'express';
import { ah, badRequest, idParam } from '../http.js';
import { requireAuth, requireCoordinator } from '../middleware/auth.js';
import { actionLimiter, createLimiter } from '../middleware/limits.js';
import * as ev from '../services/events.js';

// /api/events — табиғи апат оқиғалары (жария оқу, тек координатор өзгертеді)
export const events = Router();

events.get('/', ah(async (req, res) => {
  const q = req.query;
  const f = {
    cityId: Number(q.city_id) || null,
    region: typeof q.region === 'string' && /^[a-z]{2,8}$/.test(q.region) ? q.region : null,
    type: typeof q.type === 'string' && /^[a-z_]{2,30}$/.test(q.type) ? q.type : null,
    activity: ['active', 'resolved'].includes(q.activity) ? q.activity : null,
    verification: ['verified', 'unverified'].includes(q.verification) ? q.verification : null,
    limit: Math.min(Math.max(Number(q.limit) || 100, 1), 200),
  };
  res.json({ items: await ev.listEvents(f) });
}));

// Қажеттіліктер тақтасы (жария: тек жарияланған өтініштер)
events.get('/:id/needs', ah(async (req, res) => {
  const q = req.query;
  res.json(await ev.needs(idParam(req), {
    cityId: Number(q.city_id) || null,
    district: typeof q.district === 'string' ? q.district.trim().slice(0, 80) : undefined,
    category: typeof q.category === 'string' && /^[a-z_]{2,30}$/.test(q.category) ? q.category : null,
    state: ev.NEED_STATES.includes(q.state) ? q.state : null,
  }));
}));

events.get('/:id', ah(async (req, res) => {
  res.json(await ev.getEvent(req.user, idParam(req)));
}));

events.post('/', requireCoordinator, ah(async (req, res) => {
  res.status(201).json(await ev.createEvent(req.user, req.body || {}));
}));

events.put('/:id', requireCoordinator, ah(async (req, res) => {
  res.json(await ev.updateEvent(req.user, idParam(req), req.body || {}));
}));

events.post('/:id/verification', requireCoordinator, ah(async (req, res) => {
  res.json(await ev.setVerification(req.user, idParam(req), req.body?.status, String(req.body?.note || '').trim()));
}));

events.post('/:id/activity', requireCoordinator, ah(async (req, res) => {
  res.json(await ev.setActivity(req.user, idParam(req), req.body?.status, String(req.body?.note || '').trim()));
}));

// /api/disaster-reports — тіркелген қолданушының ықтимал апат туралы хабары (жария етілмейді)
export const reports = Router();
reports.post('/', requireAuth, createLimiter, ah(async (req, res) => {
  res.status(201).json(await ev.createReport(req.user, req.body || {}));
}));

// /api/coordinator/disaster-reports — координатордың қарауы
export const coordReports = Router();
coordReports.use(requireCoordinator);
coordReports.get('/', ah(async (req, res) => {
  const st = ['pending', 'linked', 'dismissed'].includes(req.query.status) ? req.query.status : null;
  res.json({ items: await ev.listReports(st) });
}));
coordReports.post('/:id/link', actionLimiter, ah(async (req, res) => {
  const eventId = Number(req.body?.event_id);
  if (!Number.isInteger(eventId)) throw badRequest('VALIDATION', { event_id: 'REQUIRED' });
  res.json(await ev.linkReport(req.user, idParam(req), eventId));
}));
coordReports.post('/:id/dismiss', actionLimiter, ah(async (req, res) => {
  res.json(await ev.dismissReport(req.user, idParam(req), req.body?.note));
}));
