import { Router } from 'express';
import { query, tx } from '../db/pool.js';
import { ah, Validator, notFound } from '../http.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth);

const LIST_COLS = `h.id, h.title, h.status, h.moderation_status, h.urgency, h.city_id, c.name_kk AS city_name,
  hc.name_kk AS category_name, hc.color AS category_color, hc.code AS category_code, h.district,
  h.created_at, h.updated_at, h.needed_from, h.rejection_reason, h.duplicate_of, h.is_demo, (h.disputed_at IS NOT NULL) AS disputed,
  h.content_lang, hc.direction, h.disaster_event_id`;

r.get('/requests', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT ${LIST_COLS},
       (SELECT count(*)::int FROM applications a WHERE a.request_id=h.id AND a.status='active') AS applications_count
       FROM help_requests h JOIN cities c ON c.id=h.city_id JOIN help_categories hc ON hc.id=h.category_id
      WHERE h.author_id=$1 ORDER BY h.updated_at DESC`, [req.user.id],
  );
  res.json({ items: rows });
}));

r.get('/applications', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT a.id AS application_id, a.status AS application_status, a.message, a.created_at AS applied_at, ${LIST_COLS}
       FROM applications a JOIN help_requests h ON h.id=a.request_id
       JOIN cities c ON c.id=h.city_id JOIN help_categories hc ON hc.id=h.category_id
      WHERE a.volunteer_id=$1 AND a.status IN ('active','withdrawn','declined') ORDER BY a.created_at DESC`, [req.user.id],
  );
  res.json({ items: rows });
}));

r.get('/tasks', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT s.assigned_at, s.is_active, s.ended_at, ${LIST_COLS}
       FROM assignments s JOIN help_requests h ON h.id=s.request_id
       JOIN cities c ON c.id=h.city_id JOIN help_categories hc ON hc.id=h.category_id
      WHERE s.volunteer_id=$1 AND (s.is_active OR h.status='completed')
      ORDER BY s.is_active DESC, s.assigned_at DESC`, [req.user.id],
  );
  res.json({ items: rows });
}));

r.get('/notifications', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT id, request_id, type, title, body, params, read_at, created_at FROM notifications
      WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT 100`, [req.user.id],
  );
  const unread = rows.filter((n) => !n.read_at).length;
  res.json({ items: rows, unread });
}));

r.post('/notifications/read', ah(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  if (ids?.length) {
    await query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND id = ANY($2) AND read_at IS NULL', [req.user.id, ids]);
  } else {
    await query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  }
  res.json({ ok: true });
}));

// ───────── Ерікті профилі ─────────
r.get('/volunteer', ah(async (req, res) => {
  const p = (await query('SELECT * FROM volunteer_profiles WHERE user_id=$1', [req.user.id])).rows[0];
  if (!p) return res.json({ profile: null });
  const cats = (await query('SELECT category_id FROM volunteer_categories WHERE user_id=$1', [req.user.id])).rows.map((x) => x.category_id);
  res.json({ profile: { ...p, time_from: p.time_from?.slice(0, 5) ?? null, time_to: p.time_to?.slice(0, 5) ?? null, category_ids: cats } });
}));

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

r.put('/volunteer', ah(async (req, res) => {
  const b = req.body || {};
  const v = new Validator(b)
    .str('bio', { required: false, max: 500 })
    .int('city_id', { min: 1 })
    .str('district', { required: false, max: 80 })
    .num('base_lat', { required: false, min: 40, max: 56 })
    .num('base_lng', { required: false, min: 46, max: 88 })
    .num('radius_km', { min: 0.5, max: 100 });
  const cats = Array.isArray(b.category_ids) ? [...new Set(b.category_ids.map(Number))] : [];
  if (!cats.length || !cats.every(Number.isInteger)) v.fail('category_ids', 'CATEGORIES_MIN');
  const days = Array.isArray(b.available_days) ? [...new Set(b.available_days.map(Number))].sort() : [];
  if (!days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) v.fail('available_days', 'INVALID');
  const tf = b.time_from || null, tt = b.time_to || null;
  if ((tf && !TIME_RE.test(tf)) || (tt && !TIME_RE.test(tt))) v.fail('time_from', 'TIME_FORMAT');
  else if ((tf && !tt) || (!tf && tt)) v.fail('time_to', 'TIME_BOTH');
  else if (tf && tt && tf >= tt) v.fail('time_to', 'END_BEFORE_START');
  if ((v.out.base_lat == null) !== (v.out.base_lng == null)) v.fail('base_lat', 'POINT_INCOMPLETE');
  if (v.out.city_id && !(await query('SELECT 1 FROM cities WHERE id=$1', [v.out.city_id])).rowCount) v.fail('city_id', 'CITY_NOT_FOUND');
  if (cats.length) {
    const n = (await query('SELECT count(*)::int AS n FROM help_categories WHERE id = ANY($1)', [cats])).rows[0].n;
    if (n !== cats.length) v.fail('category_ids', 'CATEGORY_NOT_FOUND');
  }
  const d = v.done();
  const isActive = b.is_active !== false;
  await tx(async (db) => {
    await db.query(
      `INSERT INTO volunteer_profiles (user_id, bio, city_id, district, base_lat, base_lng, radius_km, available_days, time_from, time_to, is_active, disaster_support, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
       ON CONFLICT (user_id) DO UPDATE SET bio=$2, city_id=$3, district=$4, base_lat=$5, base_lng=$6, radius_km=$7,
         available_days=$8, time_from=$9, time_to=$10, is_active=$11, disaster_support=$12, updated_at=now()`,
      [req.user.id, d.bio, d.city_id, d.district, d.base_lat, d.base_lng, d.radius_km, days, tf, tt, isActive, b.disaster_support === true],
    );
    await db.query('DELETE FROM volunteer_categories WHERE user_id=$1', [req.user.id]);
    for (const c of cats) await db.query('INSERT INTO volunteer_categories (user_id, category_id) VALUES ($1,$2)', [req.user.id, c]);
  });
  res.json({ ok: true });
}));

// Менің чаттарым: өтініш иесі немесе белсенді орындаушы болған өтініштер, оқылмаған хабарламалар саны
const CHATS_SQL = `
  SELECT h.id, h.title, h.status, h.content_lang, h.city_id, hc.code AS category_code, hc.color AS category_color, hc.direction,
         lm.id AS last_id, lm.body AS last_body, lm.created_at AS last_at, (lm.sender_id = $1) AS last_mine,
         (h.author_id = $1) AS i_am_author,
         (SELECT count(*)::int FROM messages m WHERE m.request_id = h.id AND m.sender_id <> $1
            AND m.id > COALESCE(mr.last_read_id, 0)) AS unread
    FROM help_requests h
    JOIN help_categories hc ON hc.id = h.category_id
    LEFT JOIN assignments s ON s.request_id = h.id AND s.is_active
    LEFT JOIN message_reads mr ON mr.request_id = h.id AND mr.user_id = $1
    LEFT JOIN LATERAL (SELECT id, body, created_at, sender_id FROM messages WHERE request_id = h.id ORDER BY id DESC LIMIT 1) lm ON true
   WHERE (h.author_id = $1 OR s.volunteer_id = $1) AND (lm.id IS NOT NULL OR s.volunteer_id IS NOT NULL)
   ORDER BY COALESCE(lm.created_at, h.updated_at) DESC LIMIT 100`;

r.get('/chats', ah(async (req, res) => {
  const { rows } = await query(CHATS_SQL, [req.user.id]);
  res.json({ items: rows, unread: rows.reduce((n, c) => n + c.unread, 0) });
}));

// Қолданушының ықтимал апат туралы хабарлары (тек өзіне көрінеді)
r.get('/disaster-reports', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT dr.id, dr.description, dr.status, dr.event_id, dr.created_at, dr.handled_at, dr.city_id, dr.lat, dr.lng, dt.code AS type_code
       FROM disaster_reports dr JOIN disaster_types dt ON dt.id = dr.type_id
      WHERE dr.reporter_id=$1 ORDER BY dr.created_at DESC`, [req.user.id],
  );
  res.json({ items: rows });
}));

r.get('/summary', ah(async (req, res) => {
  const row = (await query(
    `SELECT
      (SELECT count(*)::int FROM help_requests WHERE author_id=$1) AS my_requests,
      (SELECT count(*)::int FROM applications WHERE volunteer_id=$1 AND status='active') AS my_applications,
      (SELECT count(*)::int FROM assignments WHERE volunteer_id=$1 AND is_active) AS my_tasks,
      (SELECT count(*)::int FROM assignments s JOIN help_requests h ON h.id=s.request_id WHERE s.volunteer_id=$1 AND h.status='completed') AS helped,
      (SELECT count(*)::int FROM notifications WHERE user_id=$1 AND read_at IS NULL) AS unread,
      (SELECT count(*)::int FROM disaster_reports WHERE reporter_id=$1) AS my_reports`, [req.user.id],
  )).rows[0];
  if (!row) throw notFound();
  row.unread_chats = (await query(`SELECT COALESCE(sum(unread),0)::int AS n FROM (${CHATS_SQL}) x`, [req.user.id])).rows[0].n;
  res.json(row);
}));

export default r;
