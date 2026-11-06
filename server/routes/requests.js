import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { ah, Validator, badRequest, forbidden, conflict, idParam, notFound } from '../http.js';
import { requireAuth, requireCoordinator } from '../middleware/auth.js';
import { createLimiter, messageLimiter, actionLimiter } from '../middleware/limits.js';
import * as svc from '../services/requests.js';
import { getDetail } from '../services/detail.js';
import { linkRequest } from '../services/events.js';
import { haversineKm } from '../services/textsim.js';

export const QUANTITY_UNITS = ['bottle', 'liter', 'kg', 'pack', 'set', 'item', 'person', 'bed', 'trip'];

const r = Router();

// ───────── Жария іздеу ─────────
r.get('/', ah(async (req, res) => {
  const q = req.query;
  const num = (v) => (v === undefined || v === '' ? null : Number(v));
  const f = {
    cityId: num(q.city_id) || null,
    region: typeof q.region === 'string' && /^[a-z]{2,8}$/.test(q.region) ? q.region : null,
    categoryId: num(q.category_id) || null,
    direction: ['everyday', 'disaster'].includes(q.direction) ? q.direction : null,
    eventId: num(q.event_id) || null,
    disasterType: typeof q.disaster_type === 'string' && /^[a-z_]{2,30}$/.test(q.disaster_type) ? q.disaster_type : null,
    status: ['active', 'open', 'progress', 'completed', 'all'].includes(q.status) ? q.status : 'active',
    urgency: ['low', 'normal', 'high'].includes(q.urgency) ? q.urgency : null,
    district: typeof q.district === 'string' ? q.district.trim().slice(0, 80) : '',
    q: typeof q.q === 'string' ? q.q.trim().slice(0, 100) : '',
    limit: Math.min(Math.max(num(q.limit) || 50, 1), 200),
    offset: Math.max(num(q.offset) || 0, 0),
  };
  if (f.status === 'all') f.status = null;
  const lat = num(q.near_lat), lng = num(q.near_lng), rad = num(q.radius_km);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== null && lng !== null) {
    if (lat < 35 || lat > 60 || lng < 40 || lng > 95) throw badRequest('POINT_OUTSIDE_KZ');
    f.near = { lat, lng, radiusKm: rad && rad > 0 ? Math.min(rad, 200) : null };
  }
  const result = await svc.searchPublic(f);
  res.json({ ...result, limit: f.limit, offset: f.offset });
}));

// ───────── Өтініш дерегін тексеру ─────────
async function validateRequestBody(body, { currentEventId = null } = {}) {
  const v = new Validator(body)
    .int('city_id', { min: 1 })
    .int('category_id', { min: 1 })
    .str('title', { min: 5, max: 120 })
    .str('description', { min: 20, max: 2000 })
    .str('district', { required: false, max: 80 })
    .str('public_place', { required: false, max: 120 })
    .num('lat', { min: 40, max: 56 })
    .num('lng', { min: 46, max: 88 })
    .date('needed_from')
    .date('needed_to')
    .str('needed_note', { required: false, max: 200 })
    .oneOf('urgency', ['low', 'normal', 'high'], { def: 'normal' })
    .str('address', { min: 5, max: 200 })
    .phone('contact_phone')
    .int('disaster_event_id', { required: false, min: 1 });
  const d = v.out;
  d.content_lang = ['kk', 'ru', 'en'].includes(body.content_lang) ? body.content_lang : 'kk';
  // Қажет ресурс мөлшері (міндетті емес): сан және өлшем бірлігі бірге беріледі
  const qRaw = body.quantity === '' || body.quantity == null ? null : Number(String(body.quantity).replace(',', '.'));
  const unit = body.quantity_unit || null;
  d.quantity = null; d.quantity_unit = null;
  if (qRaw !== null || unit) {
    if (!Number.isFinite(qRaw) || qRaw <= 0 || qRaw > 100000) v.fail('quantity', 'INVALID');
    else if (!QUANTITY_UNITS.includes(unit)) v.fail('quantity_unit', 'QUANTITY_UNIT');
    else { d.quantity = Math.round(qRaw * 100) / 100; d.quantity_unit = unit; }
  }
  if (d.needed_from && d.needed_to && d.needed_from > d.needed_to) v.fail('needed_to', 'END_BEFORE_START');
  if (d.needed_to && !d.needed_from) v.fail('needed_from', 'START_FIRST');
  if (d.city_id) {
    const c = (await query('SELECT lat, lng FROM cities WHERE id=$1', [d.city_id])).rows[0];
    if (!c) v.fail('city_id', 'CITY_NOT_FOUND');
    else if (Number.isFinite(d.lat) && Number.isFinite(d.lng) && haversineKm(c.lat, c.lng, d.lat, d.lng) > 60) {
      v.fail('lat', 'POINT_TOO_FAR', { city_id: d.city_id });
    }
  }
  let direction = null;
  if (d.category_id) {
    const cat = (await query('SELECT direction FROM help_categories WHERE id=$1', [d.category_id])).rows[0];
    if (!cat) v.fail('category_id', 'CATEGORY_NOT_FOUND');
    else direction = cat.direction;
  }
  if (d.disaster_event_id) {
    const ev = (await query('SELECT id, activity_status FROM disaster_events WHERE id=$1', [d.disaster_event_id])).rows[0];
    if (!ev) v.fail('disaster_event_id', 'EVENT_NOT_FOUND');
    else if (ev.activity_status !== 'active' && ev.id !== currentEventId) v.fail('disaster_event_id', 'EVENT_RESOLVED');
    // Апатқа байланыстырылған өтініш тек «Табиғи апаттар» бағытындағы санатта болады
    if (direction && direction !== 'disaster') v.fail('category_id', 'EVENT_CATEGORY');
  }
  return v.done();
}

async function currentEvent(id) {
  return (await query('SELECT disaster_event_id FROM help_requests WHERE id=$1', [id])).rows[0]?.disaster_event_id || null;
}

r.post('/', requireAuth, createLimiter, ah(async (req, res) => {
  const data = await validateRequestBody(req.body);
  const row = await svc.createRequest(req.user, data, { submit: req.body.submit !== false });
  await query('UPDATE help_requests SET quantity=$2, quantity_unit=$3 WHERE id=$1', [row.id, data.quantity, data.quantity_unit]);
  res.status(201).json({ id: row.id, moderation_status: row.moderation_status });
}));

r.get('/:id', ah(async (req, res) => {
  res.json(await getDetail(req.user, idParam(req)));
}));

r.put('/:id', requireAuth, actionLimiter, ah(async (req, res) => {
  const data = await validateRequestBody(req.body, { currentEventId: await currentEvent(idParam(req)) });
  const out = await svc.updateRequest(req.user, idParam(req), data, { submit: !!req.body.submit });
  await query('UPDATE help_requests SET quantity=$2, quantity_unit=$3 WHERE id=$1', [idParam(req), data.quantity, data.quantity_unit]);
  res.json(out);
}));

// Жобаны (draft) өзгеріссіз тексеруге жіберу
r.post('/:id/submit', requireAuth, actionLimiter, ah(async (req, res) => {
  const id = idParam(req);
  const cur = (await query(
    `SELECT h.*, p.address, p.exact_lat AS lat, p.exact_lng AS lng, p.contact_phone
       FROM help_requests h LEFT JOIN request_private p ON p.request_id=h.id WHERE h.id=$1`, [id],
  )).rows[0];
  if (!cur || cur.author_id !== req.user.id) throw notFound('REQUEST_NOT_FOUND');
  if (cur.moderation_status === 'pending') throw conflict('ALREADY_PENDING');
  const data = await validateRequestBody({ ...cur, quantity: cur.quantity == null ? null : Number(cur.quantity) }, { currentEventId: cur.disaster_event_id });
  res.json(await svc.updateRequest(req.user, id, data, { submit: true }));
}));

r.post('/:id/review', requireCoordinator, ah(async (req, res) => {
  const decision = req.body?.decision;
  if (!['approve', 'reject'].includes(decision)) throw badRequest('INVALID_DECISION');
  res.json(await svc.review(req.user, idParam(req), { decision, reason: String(req.body.reason || '') }));
}));

r.post('/:id/duplicate', requireCoordinator, ah(async (req, res) => {
  const other = Number(req.body?.duplicate_of);
  if (!Number.isInteger(other)) throw badRequest('ORIGINAL_NOT_FOUND');
  res.json(await svc.markDuplicate(req.user, idParam(req), other, String(req.body.reason || '')));
}));

r.post('/:id/applications', requireAuth, actionLimiter, ah(async (req, res) => {
  const msg = String(req.body?.message || '').trim();
  if (msg.length > 600) throw badRequest('VALIDATION', { message: { code: 'MAX_LENGTH', params: { max: 600 } } });
  res.status(201).json(await svc.apply(req.user, idParam(req), msg, { safetyAck: req.body?.safety_ack === true }));
}));

r.delete('/:id/applications/mine', requireAuth, actionLimiter, ah(async (req, res) => {
  res.json(await svc.withdraw(req.user, idParam(req)));
}));

r.post('/:id/assign', requireAuth, actionLimiter, ah(async (req, res) => {
  const appId = Number(req.body?.application_id);
  if (!Number.isInteger(appId)) throw badRequest('SELECT_APPLICATION');
  res.json(await svc.assign(req.user, idParam(req), appId, { reason: String(req.body.reason || ''), replace: req.body.replace === true }));
}));

// Координатор бар өтінішті апат оқиғасымен байланыстырады (event_id: null — байланысты алып тастау)
r.post('/:id/event', requireCoordinator, ah(async (req, res) => {
  const raw = req.body?.event_id;
  const eventId = raw === null || raw === '' || raw === undefined ? null : Number(raw);
  if (eventId !== null && !Number.isInteger(eventId)) throw badRequest('VALIDATION', { disaster_event_id: 'INVALID' });
  res.json(await linkRequest(req.user, idParam(req), eventId));
}));

r.post('/:id/unassign', requireCoordinator, ah(async (req, res) => {
  res.json(await svc.unassign(req.user, idParam(req), String(req.body?.reason || '')));
}));

r.post('/:id/start', requireAuth, actionLimiter, ah(async (req, res) => {
  res.json(await svc.start(req.user, idParam(req)));
}));

r.post('/:id/submit-completion', requireAuth, actionLimiter, ah(async (req, res) => {
  const note = String(req.body?.note || '').trim().slice(0, 600);
  res.json(await svc.submitCompletion(req.user, idParam(req), note));
}));

r.post('/:id/confirm-completion', requireAuth, actionLimiter, ah(async (req, res) => {
  res.json(await svc.confirm(req.user, idParam(req)));
}));

r.post('/:id/dispute', requireAuth, actionLimiter, ah(async (req, res) => {
  res.json(await svc.dispute(req.user, idParam(req), String(req.body?.note || '')));
}));

r.post('/:id/resolve-dispute', requireCoordinator, ah(async (req, res) => {
  const decision = req.body?.decision;
  if (!['complete', 'continue'].includes(decision)) throw badRequest('INVALID_DECISION');
  res.json(await svc.resolveDispute(req.user, idParam(req), decision, String(req.body.note || '').trim()));
}));

r.post('/:id/cancel', requireAuth, actionLimiter, ah(async (req, res) => {
  res.json(await svc.cancel(req.user, idParam(req), String(req.body?.reason || '')));
}));

r.get('/:id/messages', requireAuth, ah(async (req, res) => {
  const id = idParam(req);
  const items = await svc.listMessages(req.user, id, Number(req.query.after) || 0);
  res.json({ items, ...(await svc.readState(req.user, id)) });
}));

r.post('/:id/messages/read', requireAuth, ah(async (req, res) => {
  res.json(await svc.markMessagesRead(req.user, idParam(req), Number(req.body?.last_id)));
}));

r.post('/:id/messages', requireAuth, messageLimiter, ah(async (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) throw badRequest('VALIDATION', { body: 'REQUIRED' });
  if (body.length > 2000) throw badRequest('VALIDATION', { body: { code: 'MAX_LENGTH', params: { max: 2000 } } });
  res.status(201).json(await svc.postMessage(req.user, idParam(req), body));
}));

// ───────── Фото жүктеу ─────────
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) return cb(badRequest('VALIDATION', { photo: 'PHOTO_TYPE' }));
    cb(null, true);
  },
});

function uploadSingle(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(badRequest('VALIDATION', { photo: { code: 'PHOTO_SIZE', params: { mb: config.maxUploadMb } } }));
    next(err);
  });
}

r.post('/:id/attachments', requireAuth, actionLimiter, uploadSingle, ah(async (req, res) => {
  const id = idParam(req);
  const reqRow = (await query('SELECT author_id, status FROM help_requests WHERE id=$1', [id])).rows[0];
  if (!reqRow) throw notFound('REQUEST_NOT_FOUND');
  if (reqRow.author_id !== req.user.id) throw forbidden('PHOTO_ONLY_AUTHOR');
  if (['completed', 'cancelled'].includes(reqRow.status)) throw conflict('PHOTO_CLOSED_REQUEST');
  if (!req.file) throw badRequest('VALIDATION', { photo: 'REQUIRED' });
  const count = (await query('SELECT count(*)::int AS n FROM attachments WHERE request_id=$1', [id])).rows[0].n;
  if (count >= 3) throw conflict('PHOTO_LIMIT');

  let out;
  try {
    // Қайта кодтау: EXIF/GPS метадеректері жойылады, бағыт түзетіледі, файл шынымен сурет екені тексеріледі
    out = await sharp(req.file.buffer, { failOn: 'error' })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw badRequest('VALIDATION', { photo: 'PHOTO_BROKEN' });
  }
  const key = `${crypto.randomBytes(16).toString('hex')}.webp`;
  await fs.mkdir(config.uploadDir, { recursive: true });
  await fs.writeFile(path.join(config.uploadDir, key), out.data);
  const visibility = req.body.visibility === 'public' ? 'public' : 'participants';
  const safeName = path.basename(String(req.file.originalname || 'photo')).replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 100);
  const { rows } = await query(
    `INSERT INTO attachments (request_id, uploader_id, storage_key, original_name, mime_type, size_bytes, width, height, visibility)
     VALUES ($1,$2,$3,$4,'image/webp',$5,$6,$7,$8) RETURNING id, original_name, size_bytes, width, height, visibility, created_at`,
    [id, req.user.id, key, safeName, out.info.size, out.info.width, out.info.height, visibility],
  );
  res.status(201).json(rows[0]);
}));

export default r;
