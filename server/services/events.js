// Табиғи апат оқиғалары: координатор жасайды және жаңартады; қолданушылар тек хабар жібере алады.
// Ескерту: «Координатор тексерді» белгісі мемлекеттік органдардың ресми растауы емес.
import { query } from '../db/pool.js';
import { Validator, badRequest, conflict, notFound, requireText } from '../http.js';
import { notify, coordinatorIds } from './notify.js';
import { broadcastPublic } from './realtime.js';
import { run, PUBLIC_COLS, FROM as REQ_FROM } from './requests.js';

const LIST_COLS = `
  e.id, e.title, left(e.description, 200) AS summary, e.content_lang, t.code AS type_code, t.color AS type_color,
  e.lat, e.lng, e.radius_km, e.location_note, e.verification_status, e.activity_status,
  e.started_at, e.ended_at, e.updated_at, e.created_at, e.is_demo,
  COALESCE((SELECT json_agg(json_build_object('city_id', a.city_id, 'region_code', a.region_code) ORDER BY a.id)
              FROM disaster_event_areas a WHERE a.event_id = e.id), '[]'::json) AS areas,
  (SELECT count(*)::int FROM help_requests h WHERE h.disaster_event_id = e.id
     AND h.moderation_status = 'approved' AND h.status <> 'cancelled') AS requests_count,
  (SELECT count(*)::int FROM help_requests h WHERE h.disaster_event_id = e.id
     AND h.moderation_status = 'approved' AND h.status = 'open') AS open_requests_count`;

const FROM = `FROM disaster_events e JOIN disaster_types t ON t.id = e.type_id`;

/** Оқиға қалаға қатысты ма: аймақта сол қала, оның облысы көрсетілген немесе нүкте қаладан 60 км ішінде */
const CITY_MATCH = (p) => `(
  EXISTS (SELECT 1 FROM disaster_event_areas a WHERE a.event_id = e.id AND a.city_id = ${p})
  OR EXISTS (SELECT 1 FROM disaster_event_areas a JOIN cities c ON c.region_code = a.region_code WHERE a.event_id = e.id AND c.id = ${p})
  OR (e.lat IS NOT NULL AND EXISTS (SELECT 1 FROM cities c WHERE c.id = ${p} AND qm_distance_km(c.lat, c.lng, e.lat, e.lng) <= 60))
)`;
const REGION_MATCH = (p) => `(
  EXISTS (SELECT 1 FROM disaster_event_areas a WHERE a.event_id = e.id AND a.region_code = ${p})
  OR EXISTS (SELECT 1 FROM disaster_event_areas a JOIN cities c ON c.id = a.city_id WHERE a.event_id = e.id AND c.region_code = ${p})
)`;

export async function listEvents(f) {
  const where = ['true'];
  const params = [];
  const p = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.cityId) where.push(CITY_MATCH(p(f.cityId)));
  if (f.region) where.push(REGION_MATCH(p(f.region)));
  if (f.type) where.push(`t.code = ${p(f.type)}`);
  if (f.activity) where.push(`e.activity_status = ${p(f.activity)}`);
  if (f.verification) where.push(`e.verification_status = ${p(f.verification)}`);
  const { rows } = await query(
    `SELECT ${LIST_COLS} ${FROM} WHERE ${where.join(' AND ')}
      ORDER BY e.activity_status = 'active' DESC, e.updated_at DESC LIMIT ${p(f.limit || 100)}`,
    params,
  );
  return rows;
}

export async function getEvent(user, id) {
  const e = (await query(
    `SELECT ${LIST_COLS}, e.description, e.source_name, e.source_url, e.verified_at,
            vu.full_name AS verified_by_name, e.created_by
       ${FROM} LEFT JOIN users vu ON vu.id = e.verified_by WHERE e.id = $1`, [id],
  )).rows[0];
  if (!e) throw notFound('EVENT_NOT_FOUND');
  const isCoord = !!user?.is_coordinator;
  if (!isCoord) delete e.verified_by_name;
  delete e.created_by;
  const requests = (await query(
    `SELECT ${PUBLIC_COLS} ${REQ_FROM}
      WHERE r.disaster_event_id = $1 AND r.moderation_status = 'approved' AND r.status <> 'cancelled'
      ORDER BY r.status = 'open' DESC, r.urgency = 'high' DESC, r.published_at DESC`, [id],
  )).rows;
  let history = null;
  if (isCoord) {
    history = (await query(
      `SELECT h.id, h.action, h.changes, h.note, h.created_at, u.full_name AS actor_name
         FROM disaster_event_history h LEFT JOIN users u ON u.id = h.actor_id
        WHERE h.event_id = $1 ORDER BY h.created_at, h.id`, [id],
    )).rows;
  }
  return { event: e, requests, history, viewer: { is_coordinator: isCoord, logged_in: !!user } };
}

// ───────── Қажеттіліктер тақтасы ─────────
const NEED_STATE = { open: 'need_executor', assigned: 'assigned', in_progress: 'assigned', awaiting_confirmation: 'awaiting', completed: 'confirmed' };
export const NEED_STATES = ['need_executor', 'assigned', 'awaiting', 'confirmed'];

/**
 * Оқиғаға байланысты жарияланған өтініштер қала/аудан және санат бойынша топталады.
 * Әр топта өтініштер саны күйлер бойынша және (бар болса) ресурс мөлшері өлшем бірлігімен бөлек беріледі —
 * әр түрлі бірліктер ешқашан бір санға қосылмайды. Тексерудегі өтініштер жария тақтаға кірмейді.
 */
export async function needs(eventId, f = {}) {
  const e = (await query(
    `SELECT e.id, e.title, e.is_demo, e.verification_status, e.activity_status, e.updated_at, t.code AS type_code
       ${FROM} WHERE e.id = $1`, [eventId],
  )).rows[0];
  if (!e) throw notFound('EVENT_NOT_FOUND');
  const all = (await query(
    `SELECT ${PUBLIC_COLS} ${REQ_FROM}
      WHERE r.disaster_event_id = $1 AND r.moderation_status = 'approved' AND r.status <> 'cancelled'
      ORDER BY r.urgency = 'high' DESC, r.updated_at DESC`, [eventId],
  )).rows;
  for (const r of all) {
    r.need_state = NEED_STATE[r.status] || 'assigned';
    r.district = (r.district || '').trim() || null;
  }
  const areas = [];
  for (const r of all) if (!areas.some((a) => a.city_id === r.city_id && a.district === r.district)) areas.push({ city_id: r.city_id, district: r.district });
  const categories = [...new Set(all.map((r) => r.category_code))];
  const items = all.filter((r) =>
    (!f.cityId || r.city_id === f.cityId)
    && (f.district === undefined || f.district === null || (r.district || '') === f.district)
    && (!f.category || r.category_code === f.category)
    && (!f.state || r.need_state === f.state));
  const groups = new Map();
  const zero = () => ({ need_executor: 0, assigned: 0, awaiting: 0, confirmed: 0 });
  const totals = zero();
  for (const r of items) {
    const key = `${r.city_id}|${r.district || ''}|${r.category_code}`;
    if (!groups.has(key)) {
      groups.set(key, { city_id: r.city_id, district: r.district, category_code: r.category_code, counts: zero(), total: 0, resources: {} });
    }
    const g = groups.get(key);
    g.counts[r.need_state]++;
    g.total++;
    totals[r.need_state]++;
    if (r.quantity != null && r.quantity_unit && r.need_state !== 'confirmed') {
      g.resources[r.quantity_unit] = Math.round(((g.resources[r.quantity_unit] || 0) + Number(r.quantity)) * 100) / 100;
    }
  }
  const out = [...groups.values()].map((g) => ({ ...g, resources: Object.entries(g.resources).map(([unit, amount]) => ({ unit, amount })) }))
    .sort((a, b) => b.counts.need_executor - a.counts.need_executor || b.total - a.total);
  return { event: e, totals: { ...totals, total: items.length }, groups: out, items, facets: { areas, categories, states: NEED_STATES } };
}

// ───────── Тексеру және сақтау ─────────

async function validateEvent(body) {
  const v = new Validator(body)
    .str('type', { max: 30 })
    .str('title', { min: 5, max: 140 })
    .str('description', { min: 10, max: 3000 })
    .num('lat', { required: false, min: 40, max: 56 })
    .num('lng', { required: false, min: 46, max: 88 })
    .num('radius_km', { required: false, min: 0.1, max: 500 })
    .str('location_note', { required: false, max: 200 })
    .str('source_name', { required: false, max: 160 })
    .url('source_url')
    .date('started_at', { required: true })
    .oneOf('activity_status', ['active', 'resolved'], { def: 'active' })
    .oneOf('verification_status', ['unverified', 'verified'], { def: 'unverified' });
  const d = v.out;
  d.content_lang = ['kk', 'ru', 'en'].includes(body.content_lang) ? body.content_lang : 'kk';
  if ((d.lat == null) !== (d.lng == null)) v.fail('lat', 'POINT_INCOMPLETE');
  if (d.radius_km != null && d.lat == null) v.fail('lat', 'POINT_INCOMPLETE');
  if (d.started_at && d.started_at.getTime() > Date.now() + 864e5) v.fail('started_at', 'INVALID_DATE');
  const type = d.type ? (await query('SELECT id FROM disaster_types WHERE code=$1', [d.type])).rows[0] : null;
  if (d.type && !type) v.fail('type', 'INVALID');
  d.type_id = type?.id;
  const cityIds = Array.isArray(body.city_ids) ? [...new Set(body.city_ids.map(Number))].filter(Number.isInteger) : [];
  const regions = Array.isArray(body.region_codes) ? [...new Set(body.region_codes.map(String))] : [];
  if (cityIds.length) {
    const n = (await query('SELECT count(*)::int AS n FROM cities WHERE id = ANY($1)', [cityIds])).rows[0].n;
    if (n !== cityIds.length) v.fail('city_ids', 'CITY_NOT_FOUND');
  }
  if (regions.length) {
    const n = (await query('SELECT count(*)::int AS n FROM regions WHERE code = ANY($1)', [regions])).rows[0].n;
    if (n !== regions.length) v.fail('region_codes', 'REGION_NOT_FOUND');
  }
  if (!cityIds.length && !regions.length && d.lat == null) v.fail('areas', 'AREA_REQUIRED');
  if (cityIds.length > 30 || regions.length > 18) v.fail('areas', 'INVALID');
  d.city_ids = cityIds.sort((a, b) => a - b);
  d.region_codes = regions.sort();
  return v.done();
}

async function setAreas(db, id, d) {
  await db.query('DELETE FROM disaster_event_areas WHERE event_id=$1', [id]);
  for (const c of d.city_ids) await db.query('INSERT INTO disaster_event_areas (event_id, city_id) VALUES ($1,$2)', [id, c]);
  for (const r of d.region_codes) await db.query('INSERT INTO disaster_event_areas (event_id, region_code) VALUES ($1,$2)', [id, r]);
}

function ping(after, id) {
  after.push(() => broadcastPublic('disaster_event', { id }));
}

const TRACKED = ['type_id', 'title', 'description', 'lat', 'lng', 'radius_km', 'location_note', 'source_name', 'source_url', 'started_at', 'content_lang'];
const norm = (v) => (v instanceof Date ? v.toISOString() : v == null || v === '' ? null : typeof v === 'number' ? v : String(v));

export async function createEvent(user, body) {
  const d = await validateEvent(body);
  return run(async (db, after) => {
    const verified = d.verification_status === 'verified';
    const resolved = d.activity_status === 'resolved';
    const { rows } = await db.query(
      `INSERT INTO disaster_events (type_id, title, description, content_lang, lat, lng, radius_km, location_note,
         source_name, source_url, started_at, ended_at, verification_status, activity_status, verified_by, verified_at, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $12 THEN now() END, $13,$14,
         CASE WHEN $15 THEN $16::int END, CASE WHEN $15 THEN now() END, $16, $16)
       RETURNING id`,
      [d.type_id, d.title, d.description, d.content_lang, d.lat, d.lng, d.radius_km, d.location_note,
        d.source_name, d.source_url, d.started_at, resolved, d.verification_status, d.activity_status, verified, user.id],
    );
    const id = rows[0].id;
    await setAreas(db, id, d);
    await db.query(
      `INSERT INTO disaster_event_history (event_id, actor_id, action, changes) VALUES ($1,$2,'created',$3)`,
      [id, user.id, JSON.stringify({ verification_status: d.verification_status, activity_status: d.activity_status })],
    );
    if (body.report_id) await linkReportInTx(db, after, user, Number(body.report_id), id);
    ping(after, id);
    return { id };
  });
}

export async function updateEvent(user, id, body) {
  const d = await validateEvent(body);
  return run(async (db, after) => {
    const cur = (await db.query('SELECT * FROM disaster_events WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw notFound('EVENT_NOT_FOUND');
    const changes = {};
    for (const k of TRACKED) {
      const a = norm(cur[k] instanceof Date ? cur[k] : cur[k] != null && typeof d[k] === 'number' ? Number(cur[k]) : cur[k]);
      const b = norm(d[k]);
      if (a !== b) changes[k] = [a, b];
    }
    const oldAreas = (await db.query('SELECT city_id, region_code FROM disaster_event_areas WHERE event_id=$1', [id])).rows;
    const oldCities = oldAreas.filter((x) => x.city_id).map((x) => x.city_id).sort((a, b) => a - b);
    const oldRegions = oldAreas.filter((x) => x.region_code).map((x) => x.region_code).sort();
    if (JSON.stringify(oldCities) !== JSON.stringify(d.city_ids)) changes.city_ids = [oldCities, d.city_ids];
    if (JSON.stringify(oldRegions) !== JSON.stringify(d.region_codes)) changes.region_codes = [oldRegions, d.region_codes];
    await db.query(
      `UPDATE disaster_events SET type_id=$2, title=$3, description=$4, content_lang=$5, lat=$6, lng=$7, radius_km=$8,
         location_note=$9, source_name=$10, source_url=$11, started_at=$12, updated_by=$13, updated_at=now() WHERE id=$1`,
      [id, d.type_id, d.title, d.description, d.content_lang, d.lat, d.lng, d.radius_km, d.location_note,
        d.source_name, d.source_url, d.started_at, user.id],
    );
    await setAreas(db, id, d);
    if (Object.keys(changes).length) {
      await db.query(`INSERT INTO disaster_event_history (event_id, actor_id, action, changes) VALUES ($1,$2,'updated',$3)`,
        [id, user.id, JSON.stringify(changes)]);
    }
    if (d.verification_status !== cur.verification_status) await setVerificationInTx(db, user, cur, d.verification_status, null);
    if (d.activity_status !== cur.activity_status) await setActivityInTx(db, user, { ...cur }, d.activity_status, null);
    ping(after, id);
    return { id, changed: Object.keys(changes) };
  });
}

async function setVerificationInTx(db, user, cur, status, note) {
  if (status === 'verified') {
    await db.query(`UPDATE disaster_events SET verification_status='verified', verified_by=$2, verified_at=now(), updated_by=$2, updated_at=now() WHERE id=$1`, [cur.id, user.id]);
  } else {
    await db.query(`UPDATE disaster_events SET verification_status='unverified', verified_by=NULL, verified_at=NULL, updated_by=$2, updated_at=now() WHERE id=$1`, [cur.id, user.id]);
  }
  await db.query(`INSERT INTO disaster_event_history (event_id, actor_id, action, changes, note) VALUES ($1,$2,$3,$4,$5)`,
    [cur.id, user.id, status === 'verified' ? 'verified' : 'unverified', JSON.stringify({ verification_status: [cur.verification_status, status] }), note]);
}

async function setActivityInTx(db, user, cur, status, note) {
  if (status === 'resolved') {
    await db.query(`UPDATE disaster_events SET activity_status='resolved', ended_at=GREATEST(now(), started_at), updated_by=$2, updated_at=now() WHERE id=$1`, [cur.id, user.id]);
  } else {
    await db.query(`UPDATE disaster_events SET activity_status='active', ended_at=NULL, updated_by=$2, updated_at=now() WHERE id=$1`, [cur.id, user.id]);
  }
  await db.query(`INSERT INTO disaster_event_history (event_id, actor_id, action, changes, note) VALUES ($1,$2,$3,$4,$5)`,
    [cur.id, user.id, status === 'resolved' ? 'resolved' : 'reopened', JSON.stringify({ activity_status: [cur.activity_status, status] }), note]);
}

export async function setVerification(user, id, status, note) {
  if (!['verified', 'unverified'].includes(status)) throw badRequest('INVALID_DECISION');
  return run(async (db, after) => {
    const cur = (await db.query('SELECT * FROM disaster_events WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw notFound('EVENT_NOT_FOUND');
    if (cur.verification_status !== status) await setVerificationInTx(db, user, cur, status, note || null);
    ping(after, id);
    return { ok: true };
  });
}

export async function setActivity(user, id, status, note) {
  if (!['active', 'resolved'].includes(status)) throw badRequest('INVALID_DECISION');
  return run(async (db, after) => {
    const cur = (await db.query('SELECT * FROM disaster_events WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw notFound('EVENT_NOT_FOUND');
    if (cur.activity_status !== status) await setActivityInTx(db, user, cur, status, note || null);
    ping(after, id);
    return { ok: true };
  });
}

/** Координатор бар өтінішті оқиғаға байланыстырады немесе байланысты алып тастайды. */
export async function linkRequest(user, requestId, eventId) {
  return run(async (db, after) => {
    const r = (await db.query(
      `SELECT h.id, h.author_id, h.title, h.disaster_event_id, hc.direction FROM help_requests h
         JOIN help_categories hc ON hc.id = h.category_id WHERE h.id=$1 FOR UPDATE OF h`, [requestId],
    )).rows[0];
    if (!r) throw notFound('REQUEST_NOT_FOUND');
    if (eventId) {
      const e = (await db.query('SELECT id, title, activity_status FROM disaster_events WHERE id=$1', [eventId])).rows[0];
      if (!e) throw badRequest('VALIDATION', { disaster_event_id: 'EVENT_NOT_FOUND' });
      if (r.direction !== 'disaster') throw badRequest('VALIDATION', { disaster_event_id: 'EVENT_CATEGORY' });
      if (e.activity_status !== 'active' && r.disaster_event_id !== e.id) throw badRequest('VALIDATION', { disaster_event_id: 'EVENT_RESOLVED' });
      if (r.disaster_event_id === e.id) return { ok: true, unchanged: true };
      await db.query('UPDATE help_requests SET disaster_event_id=$2, updated_at=now() WHERE id=$1', [requestId, e.id]);
      await db.query(`INSERT INTO request_events (request_id, actor_id, event_type, note) VALUES ($1,$2,'event_linked',$3)`, [requestId, user.id, `#${e.id}`]);
      await notify(db, after, { userIds: [r.author_id], requestId, type: 'event_linked', params: { title: r.title, event_title: e.title, event_id: e.id } });
      ping(after, e.id);
    } else {
      if (!r.disaster_event_id) return { ok: true, unchanged: true };
      await db.query('UPDATE help_requests SET disaster_event_id=NULL, updated_at=now() WHERE id=$1', [requestId]);
      await db.query(`INSERT INTO request_events (request_id, actor_id, event_type, note) VALUES ($1,$2,'event_unlinked',$3)`, [requestId, user.id, `#${r.disaster_event_id}`]);
      ping(after, r.disaster_event_id);
    }
    return { ok: true };
  });
}

// ───────── Қолданушылардың хабарлары ─────────

export async function createReport(user, body) {
  const v = new Validator(body)
    .str('type', { max: 30 })
    .int('city_id', { required: false, min: 1 })
    .num('lat', { required: false, min: 40, max: 56 })
    .num('lng', { required: false, min: 46, max: 88 })
    .str('description', { min: 20, max: 2000 })
    .str('source_name', { required: false, max: 160 })
    .url('source_url');
  const d = v.out;
  const type = d.type ? (await query('SELECT id FROM disaster_types WHERE code=$1', [d.type])).rows[0] : null;
  if (d.type && !type) v.fail('type', 'INVALID');
  if ((d.lat == null) !== (d.lng == null)) v.fail('lat', 'POINT_INCOMPLETE');
  if (!d.city_id && d.lat == null) v.fail('city_id', 'AREA_REQUIRED');
  if (d.city_id && !(await query('SELECT 1 FROM cities WHERE id=$1', [d.city_id])).rowCount) v.fail('city_id', 'CITY_NOT_FOUND');
  v.done();
  const lang = ['kk', 'ru', 'en'].includes(body.content_lang) ? body.content_lang : 'kk';
  return run(async (db, after) => {
    const { rows } = await db.query(
      `INSERT INTO disaster_reports (reporter_id, type_id, city_id, lat, lng, description, source_name, source_url, content_lang)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, status, created_at`,
      [user.id, type.id, d.city_id, d.lat, d.lng, d.description, d.source_name, d.source_url, lang],
    );
    await notify(db, after, { userIds: await coordinatorIds(db), type: 'report_new', params: { type: d.type, text: d.description.slice(0, 140), report_id: rows[0].id } });
    return rows[0];
  });
}

export async function listReports(status) {
  const { rows } = await query(
    `SELECT dr.id, dr.description, dr.source_name, dr.source_url, dr.content_lang, dr.status, dr.city_id, dr.lat, dr.lng,
            dr.event_id, dr.created_at, dr.handled_at, dr.handle_note, dt.code AS type_code, u.full_name AS reporter_name
       FROM disaster_reports dr JOIN disaster_types dt ON dt.id = dr.type_id JOIN users u ON u.id = dr.reporter_id
      WHERE ($1::text IS NULL OR dr.status = $1) ORDER BY dr.status = 'pending' DESC, dr.created_at DESC LIMIT 100`,
    [status || null],
  );
  return rows;
}

async function linkReportInTx(db, after, user, reportId, eventId) {
  const rep = (await db.query('SELECT * FROM disaster_reports WHERE id=$1 FOR UPDATE', [reportId])).rows[0];
  if (!rep) throw notFound('REPORT_NOT_FOUND');
  if (rep.status !== 'pending') throw conflict('REPORT_HANDLED');
  const ev = (await db.query('SELECT id FROM disaster_events WHERE id=$1', [eventId])).rows[0];
  if (!ev) throw badRequest('VALIDATION', { event_id: 'EVENT_NOT_FOUND' });
  await db.query(`UPDATE disaster_reports SET status='linked', event_id=$2, handled_by=$3, handled_at=now() WHERE id=$1`, [reportId, eventId, user.id]);
  await db.query(`INSERT INTO disaster_event_history (event_id, actor_id, action, changes) VALUES ($1,$2,'report_linked',$3)`,
    [eventId, user.id, JSON.stringify({ report_id: reportId })]);
  await notify(db, after, { userIds: [rep.reporter_id], type: 'report_accepted', params: { event_id: eventId, report_id: reportId } });
}

export async function linkReport(user, reportId, eventId) {
  return run(async (db, after) => {
    await linkReportInTx(db, after, user, reportId, eventId);
    return { ok: true };
  });
}

export async function dismissReport(user, reportId, note) {
  const text = requireText(note, 'note', 3);
  return run(async (db, after) => {
    const rep = (await db.query('SELECT * FROM disaster_reports WHERE id=$1 FOR UPDATE', [reportId])).rows[0];
    if (!rep) throw notFound('REPORT_NOT_FOUND');
    if (rep.status !== 'pending') throw conflict('REPORT_HANDLED');
    await db.query(`UPDATE disaster_reports SET status='dismissed', handled_by=$2, handled_at=now(), handle_note=$3 WHERE id=$1`, [reportId, user.id, text]);
    await notify(db, after, { userIds: [rep.reporter_id], type: 'report_dismissed', params: { report_id: reportId, note: text } });
    return { ok: true };
  });
}
