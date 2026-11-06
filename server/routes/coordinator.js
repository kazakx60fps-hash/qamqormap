import { Router } from 'express';
import { query } from '../db/pool.js';
import { ah } from '../http.js';
import { requireCoordinator } from '../middleware/auth.js';
import { findDuplicates } from '../services/requests.js';

const r = Router();
r.use(requireCoordinator);

const COLS = `h.id, h.title, left(h.description, 220) AS summary, h.status, h.moderation_status, h.urgency,
  h.city_id, c.name_kk AS city_name, h.category_id, hc.name_kk AS category_name, hc.color AS category_color, hc.code AS category_code,
  h.district, h.public_place, h.approx_lat, h.approx_lng, h.created_at, h.submitted_at, h.updated_at, h.is_demo,
  h.rejection_reason, h.duplicate_of, h.dispute_note, (h.disputed_at IS NOT NULL) AS disputed, u.full_name AS author_name,
  h.content_lang, hc.direction, h.disaster_event_id,
  (SELECT count(*)::int FROM applications a WHERE a.request_id=h.id AND a.status='active') AS applications_count,
  (SELECT uu.full_name FROM assignments s JOIN users uu ON uu.id=s.volunteer_id WHERE s.request_id=h.id AND s.is_active) AS assignee_name`;
const FROM = `FROM help_requests h JOIN cities c ON c.id=h.city_id JOIN help_categories hc ON hc.id=h.category_id JOIN users u ON u.id=h.author_id`;

function filters(q, params) {
  const where = [];
  const p = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (Number(q.city_id)) where.push(`h.city_id = ${p(Number(q.city_id))}`);
  if (Number(q.category_id)) where.push(`h.category_id = ${p(Number(q.category_id))}`);
  if (['everyday', 'disaster'].includes(q.direction)) where.push(`hc.direction = ${p(q.direction)}`);
  return where;
}

r.get('/queue', ah(async (req, res) => {
  const params = [];
  const where = ["h.moderation_status = 'pending'", ...filters(req.query, params)];
  const { rows } = await query(`SELECT ${COLS} ${FROM} WHERE ${where.join(' AND ')} ORDER BY h.urgency='high' DESC, h.submitted_at ASC NULLS LAST LIMIT 100`, params);
  for (const row of rows) {
    const full = { ...row, description: (await query('SELECT description FROM help_requests WHERE id=$1', [row.id])).rows[0].description };
    row.duplicates = await findDuplicates(full);
  }
  res.json({ items: rows });
}));

const VIEWS = {
  disputes: "h.disputed_at IS NOT NULL AND h.status NOT IN ('completed','cancelled')",
  active: "h.moderation_status='approved' AND h.status IN ('assigned','in_progress','awaiting_confirmation')",
  open: "h.moderation_status='approved' AND h.status='open'",
  rejected: "h.moderation_status='rejected'",
  completed: "h.status='completed'",
  cancelled: "h.status='cancelled'",
};

r.get('/requests', ah(async (req, res) => {
  const params = [];
  const view = VIEWS[req.query.view] ? req.query.view : 'active';
  const where = [VIEWS[view], ...filters(req.query, params)];
  const { rows } = await query(`SELECT ${COLS} ${FROM} WHERE ${where.join(' AND ')} ORDER BY h.updated_at DESC LIMIT 100`, params);
  res.json({ items: rows, view });
}));

r.get('/overview', ah(async (req, res) => {
  const params = [];
  const where = filters(req.query, params);
  const cond = where.length ? 'AND ' + where.join(' AND ') : '';
  const row = (await query(
    `SELECT
       count(*) FILTER (WHERE h.moderation_status='pending')::int AS pending,
       count(*) FILTER (WHERE h.disputed_at IS NOT NULL AND h.status NOT IN ('completed','cancelled'))::int AS disputes,
       count(*) FILTER (WHERE h.moderation_status='approved' AND h.status='open')::int AS open,
       count(*) FILTER (WHERE h.moderation_status='approved' AND h.status IN ('assigned','in_progress','awaiting_confirmation'))::int AS active,
       count(*) FILTER (WHERE h.status='completed')::int AS completed,
       count(*) FILTER (WHERE h.moderation_status='rejected')::int AS rejected,
       count(*) FILTER (WHERE h.status='cancelled')::int AS cancelled
     FROM help_requests h JOIN help_categories hc ON hc.id = h.category_id WHERE true ${cond}`, params,
  )).rows[0];
  row.reports = (await query(`SELECT count(*)::int AS n FROM disaster_reports WHERE status='pending'`)).rows[0].n;
  const recent = (await query(
    `SELECT e.id, e.event_type, e.created_at, e.request_id, h.title, u.full_name AS actor_name
       FROM request_events e JOIN help_requests h ON h.id=e.request_id JOIN help_categories hc ON hc.id = h.category_id LEFT JOIN users u ON u.id=e.actor_id
      WHERE h.moderation_status <> 'draft' ${cond} ORDER BY e.created_at DESC, e.id DESC LIMIT 12`, params,
  )).rows;
  res.json({ counts: row, recent });
}));

export default r;
