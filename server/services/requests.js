import crypto from 'node:crypto';
import { query, tx } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound, requireText } from '../http.js';
import { notify, coordinatorIds } from './notify.js';
import { broadcastPublic, sendToUser } from './realtime.js';
import { similarity, commonWords, haversineKm } from './textsim.js';

export const STATUSES = ['open', 'assigned', 'in_progress', 'awaiting_confirmation', 'completed', 'cancelled'];

/** Жария нүкте: нақты нүктеден 250–450 м кездейсоқ ығысу, 4 таңбаға дейін дөңгелектенеді. */
export function approximate(lat, lng) {
  const dist = 0.25 + (crypto.randomInt(0, 200) / 1000);
  const angle = (crypto.randomInt(0, 360) * Math.PI) / 180;
  const dLat = (dist / 111.32) * Math.cos(angle);
  const dLng = (dist / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
  return { lat: +(lat + dLat).toFixed(4), lng: +(lng + dLng).toFixed(4) };
}

// Жария тізім үшін тек қауіпсіз өрістер (нақты мекенжай, телефон, нақты координат ЖОҚ)
export const PUBLIC_COLS = `
  r.id, r.title, left(r.description, 180) AS summary, r.content_lang, r.city_id, c.name_kk AS city_name,
  r.category_id, hc.code AS category_code, hc.name_kk AS category_name, hc.color AS category_color, hc.direction,
  r.district, r.public_place, r.approx_lat, r.approx_lng, r.needed_from, r.needed_to, r.needed_note,
  r.urgency, r.status, r.moderation_status, r.is_demo, r.created_at, r.published_at, r.completed_at, r.updated_at,
  r.disaster_event_id, dt.code AS disaster_type_code, r.quantity::float AS quantity, r.quantity_unit, r.org_id,
  (SELECT count(*)::int FROM applications a WHERE a.request_id = r.id AND a.status = 'active') AS applications_count,
  EXISTS (SELECT 1 FROM attachments t WHERE t.request_id = r.id AND t.visibility = 'public') AS has_public_photo`;

export const FROM = `FROM help_requests r
  JOIN cities c ON c.id = r.city_id
  JOIN help_categories hc ON hc.id = r.category_id
  LEFT JOIN disaster_events de ON de.id = r.disaster_event_id
  LEFT JOIN disaster_types dt ON dt.id = de.type_id`;

const STATUS_GROUPS = {
  active: ['open', 'assigned', 'in_progress', 'awaiting_confirmation'],
  open: ['open'],
  progress: ['assigned', 'in_progress', 'awaiting_confirmation'],
  completed: ['completed'],
};

/** Жария іздеу: тек бекітілген өтініштер. */
export async function searchPublic(f) {
  const where = [`r.moderation_status = 'approved'`, `r.status <> 'cancelled'`];
  const params = [];
  const p = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.cityId) where.push(`r.city_id = ${p(f.cityId)}`);
  if (f.region) where.push(`c.region_code = ${p(f.region)}`);
  if (f.categoryId) where.push(`r.category_id = ${p(f.categoryId)}`);
  if (f.direction) where.push(`hc.direction = ${p(f.direction)}`);
  if (f.eventId) where.push(`r.disaster_event_id = ${p(f.eventId)}`);
  if (f.disasterType) where.push(`dt.code = ${p(f.disasterType)}`);
  if (f.status && STATUS_GROUPS[f.status]) where.push(`r.status = ANY(${p(STATUS_GROUPS[f.status])})`);
  if (f.urgency) where.push(`r.urgency = ${p(f.urgency)}`);
  if (f.district) where.push(`r.district ILIKE ${p('%' + f.district + '%')}`);
  if (f.q) {
    const ph = p('%' + f.q + '%');
    where.push(`(r.title ILIKE ${ph} OR r.description ILIKE ${ph} OR r.public_place ILIKE ${ph})`);
  }
  let distSel = 'NULL::double precision AS distance_km';
  if (f.near) {
    const la = p(f.near.lat), ln = p(f.near.lng);
    distSel = `qm_distance_km(${la}, ${ln}, r.approx_lat, r.approx_lng) AS distance_km`;
    if (f.near.radiusKm) where.push(`qm_distance_km(${la}, ${ln}, r.approx_lat, r.approx_lng) <= ${p(f.near.radiusKm)}`);
  }
  const whereSql = where.join(' AND ');
  const order = f.near
    ? 'distance_km ASC, r.id DESC'
    : `CASE r.status WHEN 'open' THEN 0 WHEN 'assigned' THEN 1 WHEN 'in_progress' THEN 1 WHEN 'awaiting_confirmation' THEN 2 ELSE 3 END,
       CASE r.urgency WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, r.published_at DESC NULLS LAST, r.id DESC`;
  const total = (await query(`SELECT count(*)::int AS n ${FROM} WHERE ${whereSql}`, params)).rows[0].n;
  const limit = p(f.limit), offset = p(f.offset);
  const { rows } = await query(
    `SELECT ${PUBLIC_COLS}, ${distSel} ${FROM} WHERE ${whereSql} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  return { total, items: rows };
}

/** Өтінішті және қолданушының оған қатынасын жүктейді. */
export async function loadAccess(db, id, user, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT r.*, c.name_kk AS city_name, hc.name_kk AS category_name, hc.code AS category_code, hc.color AS category_color,
            hc.direction, dt.code AS disaster_type_code
       ${FROM} WHERE r.id = $1 ${lock ? 'FOR UPDATE OF r' : ''}`,
    [id],
  );
  const r = rows[0];
  if (!r) throw notFound('REQUEST_NOT_FOUND');
  const asg = (await db.query(
    `SELECT a.*, u.full_name AS volunteer_name FROM assignments a JOIN users u ON u.id = a.volunteer_id
      WHERE a.request_id = $1 AND a.is_active`, [id],
  )).rows[0] || null;
  const isAuthor = !!user && user.id === r.author_id;
  const isCoordinator = !!user?.is_coordinator;
  const isAssignee = !!user && !!asg && asg.volunteer_id === user.id;
  // Ұйым координаторы — тек осы өтінішті қабылдаған ұйымның координаторы (басқа ұйымға құқығы жоқ)
  const isOrgCoordinator = !!user && !!r.org_id && (await db.query(
    `SELECT 1 FROM organization_members WHERE org_id=$1 AND user_id=$2 AND role='coordinator'`, [r.org_id, user.id],
  )).rowCount > 0;
  // Жоба (draft) тек авторына көрінеді; тексерудегі өтінішті координатор да көреді
  const visible = r.moderation_status === 'approved' || isAuthor || (isCoordinator && r.moderation_status !== 'draft');
  if (!visible) throw notFound('REQUEST_NOT_FOUND');
  return {
    r, asg, isAuthor, isCoordinator, isAssignee, isOrgCoordinator,
    canSeePrivate: isAuthor || isCoordinator || isAssignee || isOrgCoordinator,
    canChat: isAuthor || isCoordinator || isAssignee || isOrgCoordinator,
  };
}

export async function addEvent(db, requestId, actorId, type, from, to, note = null) {
  await db.query(
    `INSERT INTO request_events (request_id, actor_id, event_type, from_status, to_status, note)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [requestId, actorId, type, from, to, note],
  );
}

/** Транзакцияны орындап, сәтті болса SSE хабарларын жібереді. */
export async function run(fn) {
  const after = [];
  const result = await tx((db) => fn(db, after));
  for (const f of after) {
    try {
      f();
    } catch { /* SSE қатесі негізгі әрекетті бұзбайды */ }
  }
  return result;
}

function publicPing(after, r, status, moderation) {
  after.push(() => broadcastPublic('request', {
    id: r.id, city_id: r.city_id, status, moderation_status: moderation, disaster_event_id: r.disaster_event_id || null,
  }));
}

function requireStatus(r, allowed, code) {
  if (!allowed.includes(r.status)) throw conflict(code || 'INVALID_STATUS', { status: r.status });
}

// ───────────────────────── Құру және өңдеу ─────────────────────────

export async function createRequest(user, data, { submit }) {
  return run(async (db, after) => {
    const approx = approximate(data.lat, data.lng);
    const moderation = submit ? 'pending' : 'draft';
    const { rows } = await db.query(
      `INSERT INTO help_requests (author_id, city_id, category_id, title, description, district, public_place,
         approx_lat, approx_lng, needed_from, needed_to, needed_note, urgency, moderation_status, submitted_at,
         disaster_event_id, content_lang)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, CASE WHEN $14 = 'pending' THEN now() END, $15, $16)
       RETURNING *`,
      [user.id, data.city_id, data.category_id, data.title, data.description, data.district, data.public_place,
        approx.lat, approx.lng, data.needed_from, data.needed_to, data.needed_note, data.urgency, moderation,
        data.disaster_event_id || null, data.content_lang || 'kk'],
    );
    const r = rows[0];
    await db.query(
      `INSERT INTO request_private (request_id, address, exact_lat, exact_lng, contact_phone) VALUES ($1,$2,$3,$4,$5)`,
      [r.id, data.address, data.lat, data.lng, data.contact_phone],
    );
    await addEvent(db, r.id, user.id, 'created', null, 'open', null);
    if (submit) {
      await addEvent(db, r.id, user.id, 'submitted', 'draft', 'pending', null);
      await notify(db, after, { userIds: await coordinatorIds(db), requestId: r.id, type: 'review_needed', params: { title: r.title } });
    }
    return r;
  });
}

export async function updateRequest(user, id, data, { submit }) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    if (!a.isAuthor) throw forbidden('ONLY_AUTHOR_EDIT');
    if (!['draft', 'rejected', 'pending'].includes(a.r.moderation_status) || a.r.status !== 'open') {
      throw conflict('PUBLISHED_LOCKED');
    }
    const priv = (await db.query('SELECT * FROM request_private WHERE request_id=$1', [id])).rows[0];
    const moved = !priv || Math.abs(priv.exact_lat - data.lat) > 1e-7 || Math.abs(priv.exact_lng - data.lng) > 1e-7;
    const approx = moved ? approximate(data.lat, data.lng) : { lat: a.r.approx_lat, lng: a.r.approx_lng };
    const nextModeration = submit ? 'pending' : a.r.moderation_status;
    await db.query(
      `UPDATE help_requests SET city_id=$2, category_id=$3, title=$4, description=$5, district=$6, public_place=$7,
         approx_lat=$8, approx_lng=$9, needed_from=$10, needed_to=$11, needed_note=$12, urgency=$13,
         moderation_status=$14, submitted_at = CASE WHEN $14='pending' AND moderation_status<>'pending' THEN now() ELSE submitted_at END,
         disaster_event_id=$15, updated_at=now()
       WHERE id=$1`,
      [id, data.city_id, data.category_id, data.title, data.description, data.district, data.public_place,
        approx.lat, approx.lng, data.needed_from, data.needed_to, data.needed_note, data.urgency, nextModeration,
        data.disaster_event_id || null],
    );
    await db.query(
      `INSERT INTO request_private (request_id, address, exact_lat, exact_lng, contact_phone) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (request_id) DO UPDATE SET address=$2, exact_lat=$3, exact_lng=$4, contact_phone=$5`,
      [id, data.address, data.lat, data.lng, data.contact_phone],
    );
    if (submit && a.r.moderation_status !== 'pending') {
      const resub = a.r.moderation_status === 'rejected';
      await addEvent(db, id, user.id, resub ? 'resubmitted' : 'submitted', a.r.moderation_status, 'pending', null);
      await notify(db, after, {
        userIds: await coordinatorIds(db), requestId: id, type: resub ? 'resubmitted' : 'review_needed', params: { title: data.title },
      });
    } else {
      await addEvent(db, id, user.id, 'edited', null, null, null);
    }
    return { id };
  });
}

// ───────────────────────── Модерация ─────────────────────────

export async function review(user, id, { decision, reason }) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    if (!a.isCoordinator) throw forbidden();
    if (a.r.moderation_status !== 'pending') throw conflict('NOT_IN_REVIEW');
    if (decision === 'approve') {
      await db.query(
        `UPDATE help_requests SET moderation_status='approved', rejection_reason=NULL, published_at=now(), updated_at=now() WHERE id=$1`,
        [id],
      );
      await addEvent(db, id, user.id, 'approved', 'pending', 'approved', null);
      await notify(db, after, { userIds: [a.r.author_id], requestId: id, type: 'approved', params: { title: a.r.title } });
      publicPing(after, a.r, a.r.status, 'approved');
    } else {
      const text = requireText(reason, 'reason');
      await db.query(`UPDATE help_requests SET moderation_status='rejected', rejection_reason=$2, updated_at=now() WHERE id=$1`, [id, text]);
      await addEvent(db, id, user.id, 'rejected', 'pending', 'rejected', text);
      await notify(db, after, { userIds: [a.r.author_id], requestId: id, type: 'rejected', params: { title: a.r.title, reason: text } });
    }
    return { ok: true };
  });
}

export async function markDuplicate(user, id, duplicateOf, reason) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    if (!a.isCoordinator) throw forbidden();
    if (a.r.moderation_status !== 'pending') throw conflict('ONLY_PENDING_DUPLICATE');
    const other = (await db.query('SELECT id, title FROM help_requests WHERE id=$1', [duplicateOf])).rows[0];
    if (!other || other.id === id) throw badRequest('ORIGINAL_NOT_FOUND');
    const note = reason?.trim() || null;
    await db.query(
      `UPDATE help_requests SET moderation_status='rejected', duplicate_of=$2, rejection_reason=$3, updated_at=now() WHERE id=$1`,
      [id, other.id, note],
    );
    await addEvent(db, id, user.id, 'duplicate', 'pending', 'rejected', note);
    await notify(db, after, {
      userIds: [a.r.author_id], requestId: id, type: 'duplicate',
      params: { title: a.r.title, original_id: other.id, original_title: other.title, reason: note || `#${other.id}` },
    });
    return { ok: true };
  });
}

// ───────────────────────── Еріктінің ұсынысы ─────────────────────────

export async function apply(user, id, message, { safetyAck = false } = {}) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    if (a.isAuthor) throw forbidden('OWN_REQUEST_APPLY');
    if (a.r.moderation_status !== 'approved') throw conflict('NOT_PUBLISHED');
    requireStatus(a.r, ['open'], 'ALREADY_ASSIGNED');
    // Табиғи апатқа қатысты көмек — қарапайым тапсырма емес: ерікті қауіпсіздік ережесін анық растауы керек
    if (a.r.direction === 'disaster' && !safetyAck) {
      throw badRequest('SAFETY_ACK_REQUIRED', { safety_ack: 'SAFETY_ACK' });
    }
    try {
      await db.query('SAVEPOINT ap');
      const { rows } = await db.query(
        `INSERT INTO applications (request_id, volunteer_id, message) VALUES ($1,$2,$3) RETURNING *`,
        [id, user.id, message || ''],
      );
      await addEvent(db, id, user.id, 'applied', null, null, null);
      await notify(db, after, { userIds: [a.r.author_id], requestId: id, type: 'application', params: { name: user.full_name, title: a.r.title } });
      publicPing(after, a.r, a.r.status, a.r.moderation_status);
      return rows[0];
    } catch (err) {
      if (err.code === '23505') {
        await db.query('ROLLBACK TO SAVEPOINT ap');
        throw conflict('ALREADY_APPLIED');
      }
      throw err;
    }
  });
}

export async function withdraw(user, id) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    const app = (await db.query(
      `SELECT * FROM applications WHERE request_id=$1 AND volunteer_id=$2 AND status='active'`, [id, user.id],
    )).rows[0];
    if (!app) throw conflict('NO_ACTIVE_APPLICATION');
    await db.query(`UPDATE applications SET status='withdrawn', updated_at=now() WHERE id=$1`, [app.id]);
    await addEvent(db, id, user.id, 'withdrawn', null, null, null);
    await notify(db, after, { userIds: [a.r.author_id], requestId: id, type: 'withdrawn', params: { title: a.r.title, name: user.full_name } });
    publicPing(after, a.r, a.r.status, a.r.moderation_status);
    return { ok: true };
  });
}

// ───────────────────────── Орындаушыны таңдау / ауыстыру ─────────────────────────

export async function assign(user, id, applicationId, { reason, replace = false } = {}) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    // Ауыстыру тек анық сұралғанда орындалады; әйтпесе қатар келген екінші тағайындау 409 алады
    const replacing = !!a.asg && replace;
    if (a.asg && !replace) throw conflict('ALREADY_ASSIGNED');
    let reasonText = null;
    if (replacing) {
      if (!a.isCoordinator) throw forbidden('REPLACE_COORDINATOR_ONLY');
      requireStatus(a.r, ['assigned', 'in_progress'], 'REPLACE_STAGE');
      reasonText = requireText(reason, 'reason');
    } else {
      if (!a.isAuthor && !a.isCoordinator && !a.isOrgCoordinator) throw forbidden('ASSIGN_FORBIDDEN');
      if (a.r.moderation_status !== 'approved') throw conflict('NOT_PUBLISHED');
      requireStatus(a.r, ['open'], 'ALREADY_ASSIGNED');
    }
    const app = (await db.query(
      `SELECT ap.*, u.full_name FROM applications ap JOIN users u ON u.id = ap.volunteer_id
        WHERE ap.id=$1 AND ap.request_id=$2 AND ap.status='active'`, [applicationId, id],
    )).rows[0];
    if (!app) throw badRequest('APPLICATION_INACTIVE');
    // Ұйым координаторы тек өз командасындағы, ұсыныс жіберген еріктіні таңдай алады
    if (!a.isAuthor && !a.isCoordinator && a.isOrgCoordinator) {
      const inTeam = (await db.query('SELECT 1 FROM organization_members WHERE org_id=$1 AND user_id=$2', [a.r.org_id, app.volunteer_id])).rowCount;
      if (!inTeam) throw forbidden('ASSIGN_TEAM_ONLY');
    }

    if (replacing) {
      await db.query(`UPDATE assignments SET is_active=false, ended_at=now(), end_reason=$2 WHERE id=$1`, [a.asg.id, reasonText]);
      await db.query(`UPDATE applications SET status='declined', updated_at=now() WHERE id=$1`, [a.asg.application_id]);
      await addEvent(db, id, user.id, 'unassigned', a.r.status, 'open', reasonText);
      await notify(db, after, { userIds: [a.asg.volunteer_id], requestId: id, type: 'unassigned', params: { title: a.r.title, reason: reasonText } });
    }
    // Шектеу (assignments_one_active_uq) қатар келген сұрауларда екінші тағайындауды болдырмайды
    await db.query(
      `INSERT INTO assignments (request_id, volunteer_id, application_id, assigned_by) VALUES ($1,$2,$3,$4)`,
      [id, app.volunteer_id, app.id, user.id],
    );
    await db.query(`UPDATE applications SET status='accepted', updated_at=now() WHERE id=$1`, [app.id]);
    await db.query(
      `UPDATE help_requests SET status='assigned', first_assigned_at = COALESCE(first_assigned_at, now()), updated_at=now() WHERE id=$1`,
      [id],
    );
    await addEvent(db, id, user.id, 'assigned', replacing ? 'open' : a.r.status, 'assigned', app.full_name);
    await notify(db, after, { userIds: [app.volunteer_id], requestId: id, type: 'assigned', params: { title: a.r.title } });
    if (!a.isAuthor) {
      await notify(db, after, { userIds: [a.r.author_id], requestId: id, type: 'assigned_author', params: { title: a.r.title, name: app.full_name } });
    }
    publicPing(after, a.r, 'assigned', 'approved');
    return { ok: true };
  });
}

/** Координатор орындаушыны босатып, өтінішті қайта ашады. */
export async function unassign(user, id, reason) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    if (!a.isCoordinator) throw forbidden();
    if (!a.asg) throw conflict('NO_ACTIVE_ASSIGNEE');
    const text = requireText(reason, 'reason');
    await db.query(`UPDATE assignments SET is_active=false, ended_at=now(), end_reason=$2 WHERE id=$1`, [a.asg.id, text]);
    if (a.asg.application_id) await db.query(`UPDATE applications SET status='declined', updated_at=now() WHERE id=$1`, [a.asg.application_id]);
    await db.query(`UPDATE help_requests SET status='open', disputed_at=NULL, updated_at=now() WHERE id=$1`, [id]);
    await addEvent(db, id, user.id, 'unassigned', a.r.status, 'open', text);
    await notify(db, after, { userIds: [a.asg.volunteer_id, a.r.author_id], requestId: id, type: 'unassigned', params: { title: a.r.title, reason: text } });
    publicPing(after, a.r, 'open', 'approved');
    return { ok: true };
  });
}

// ───────────────────────── Орындау ─────────────────────────

export async function start(user, id) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    if (!a.isAssignee) throw forbidden('ONLY_ASSIGNEE_START');
    requireStatus(a.r, ['assigned']);
    await db.query(`UPDATE help_requests SET status='in_progress', updated_at=now() WHERE id=$1`, [id]);
    await addEvent(db, id, user.id, 'started', 'assigned', 'in_progress', null);
    await notify(db, after, { userIds: [a.r.author_id], requestId: id, type: 'started', params: { title: a.r.title } });
    publicPing(after, a.r, 'in_progress', 'approved');
    return { ok: true };
  });
}

export async function submitCompletion(user, id, note) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    if (!a.isAssignee) throw forbidden('ONLY_ASSIGNEE_COMPLETE');
    requireStatus(a.r, ['in_progress']);
    await db.query(`UPDATE help_requests SET status='awaiting_confirmation', disputed_at=NULL, updated_at=now() WHERE id=$1`, [id]);
    await addEvent(db, id, user.id, 'completion_submitted', 'in_progress', 'awaiting_confirmation', note || null);
    await notify(db, after, { userIds: [a.r.author_id], requestId: id, type: 'completion_submitted', params: { title: a.r.title } });
    publicPing(after, a.r, 'awaiting_confirmation', 'approved');
    return { ok: true };
  });
}

async function completeInTx(db, after, a, user, note) {
  const upd = await db.query(
    `UPDATE help_requests SET status='completed', completed_at=now(), disputed_at=NULL, updated_at=now()
      WHERE id=$1 AND status='awaiting_confirmation' RETURNING id`, [a.r.id],
  );
  if (!upd.rowCount) return { already: true };
  await addEvent(db, a.r.id, user.id, 'completed', 'awaiting_confirmation', 'completed', note || null);
  await notify(db, after, {
    userIds: [a.asg?.volunteer_id, a.r.author_id].filter((x) => x !== user.id), requestId: a.r.id, type: 'completed', params: { title: a.r.title },
  });
  publicPing(after, a.r, 'completed', 'approved');
  return { already: false };
}

export async function confirm(user, id) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    if (!a.isAuthor && !a.isCoordinator) throw forbidden('CONFIRM_FORBIDDEN');
    if (a.r.status === 'completed') return { ok: true, already: true };
    requireStatus(a.r, ['awaiting_confirmation']);
    const res = await completeInTx(db, after, a, user, null);
    return { ok: true, ...res };
  });
}

/** Өтініш иесі нәтижемен келіспесе — даулы жағдай ашылады. */
export async function dispute(user, id, note) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    if (!a.isAuthor) throw forbidden();
    requireStatus(a.r, ['awaiting_confirmation']);
    const text = requireText(note, 'note');
    await db.query(
      `UPDATE help_requests SET status='in_progress', disputed_at=now(), dispute_note=$2, updated_at=now() WHERE id=$1`,
      [id, text],
    );
    await addEvent(db, id, user.id, 'disputed', 'awaiting_confirmation', 'in_progress', text);
    await notify(db, after, {
      userIds: [a.asg?.volunteer_id, ...(await coordinatorIds(db))], requestId: id, type: 'disputed', params: { title: a.r.title, note: text },
    });
    publicPing(after, a.r, 'in_progress', 'approved');
    return { ok: true };
  });
}

/** Координатордың даулы жағдай бойынша шешімі. */
export async function resolveDispute(user, id, decision, note) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    if (!a.isCoordinator) throw forbidden();
    if (!a.r.disputed_at) throw conflict('NO_OPEN_DISPUTE');
    if (decision === 'complete') {
      if (a.r.status === 'in_progress') {
        await db.query(`UPDATE help_requests SET status='awaiting_confirmation' WHERE id=$1`, [id]);
        a.r.status = 'awaiting_confirmation';
      }
      requireStatus(a.r, ['awaiting_confirmation']);
      await completeInTx(db, after, a, user, note || null);
    } else {
      await db.query(`UPDATE help_requests SET disputed_at=NULL, updated_at=now() WHERE id=$1`, [id]);
      await addEvent(db, id, user.id, 'dispute_resolved', a.r.status, a.r.status, note || null);
      await notify(db, after, {
        userIds: [a.asg?.volunteer_id, a.r.author_id], requestId: id, type: 'dispute_resolved', params: { title: a.r.title, note: note || '' },
      });
    }
    return { ok: true };
  });
}

export async function cancel(user, id, reason) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user, { lock: true });
    if (!a.isAuthor && !a.isCoordinator) throw forbidden('CANCEL_FORBIDDEN');
    requireStatus(a.r, ['open', 'assigned', 'in_progress', 'awaiting_confirmation']);
    const text = requireText(reason, 'reason');
    if (a.asg) {
      await db.query(`UPDATE assignments SET is_active=false, ended_at=now(), end_reason='cancelled' WHERE id=$1`, [a.asg.id]);
    }
    await db.query(`UPDATE applications SET status='declined', updated_at=now() WHERE request_id=$1 AND status='active'`, [id]);
    await db.query(
      `UPDATE help_requests SET status='cancelled', cancel_reason=$2, disputed_at=NULL, updated_at=now() WHERE id=$1`,
      [id, text],
    );
    await addEvent(db, id, user.id, 'cancelled', a.r.status, 'cancelled', text);
    const applicants = (await db.query(`SELECT DISTINCT volunteer_id FROM applications WHERE request_id=$1`, [id])).rows.map((x) => x.volunteer_id);
    await notify(db, after, {
      userIds: [a.r.author_id, ...applicants].filter((x) => x !== user.id), requestId: id, type: 'cancelled', params: { title: a.r.title, reason: text },
    });
    publicPing(after, a.r, 'cancelled', a.r.moderation_status);
    return { ok: true };
  });
}

// ───────────────────────── Хат алмасу ─────────────────────────

export async function listMessages(user, id, afterId = 0) {
  const a = await loadAccess({ query }, id, user);
  if (!a.canChat) throw forbidden('CHAT_FORBIDDEN');
  const { rows } = await query(
    `SELECT m.id, m.body, m.created_at, m.sender_id, u.full_name AS sender_name,
            CASE WHEN m.sender_id = $2 THEN 'author'
                 WHEN u.is_coordinator THEN 'coordinator' ELSE 'volunteer' END AS sender_role
       FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.request_id = $1 AND m.id > $3 ORDER BY m.id ASC LIMIT 300`,
    [id, a.r.author_id, afterId],
  );
  return rows;
}

/** Чаттың оқылу күйі: менің соңғы оқығаным және басқа қатысушылардың ең соңғы оқығаны */
export async function readState(user, id) {
  const { rows } = await query(
    `SELECT COALESCE(max(last_read_id) FILTER (WHERE user_id = $2), 0)::bigint AS mine,
            COALESCE(max(last_read_id) FILTER (WHERE user_id <> $2), 0)::bigint AS others
       FROM message_reads WHERE request_id = $1`, [id, user.id],
  );
  return { last_read_id: Number(rows[0].mine), others_read_id: Number(rows[0].others) };
}

/** Хабарламаларды оқылды деп белгілеу (тек артқа жылжымайды) */
export async function markMessagesRead(user, id, lastId) {
  const a = await loadAccess({ query }, id, user);
  if (!a.canChat) throw forbidden('CHAT_FORBIDDEN');
  const max = Number((await query('SELECT COALESCE(max(id),0) AS m FROM messages WHERE request_id=$1', [id])).rows[0].m);
  const target = Math.min(Number.isInteger(lastId) && lastId > 0 ? lastId : max, max);
  await query(
    `INSERT INTO message_reads (request_id, user_id, last_read_id) VALUES ($1,$2,$3)
     ON CONFLICT (request_id, user_id) DO UPDATE SET last_read_id = GREATEST(message_reads.last_read_id, EXCLUDED.last_read_id), read_at = now()`,
    [id, user.id, target],
  );
  // Осы өтініш бойынша чат хабарламалары туралы ішкі хабарламалар да оқылды болады
  await query(`UPDATE notifications SET read_at = now() WHERE user_id=$1 AND request_id=$2 AND type='message' AND read_at IS NULL`, [user.id, id]);
  return { ok: true, last_read_id: target };
}

export async function postMessage(user, id, body) {
  return run(async (db, after) => {
    const a = await loadAccess(db, id, user);
    if (!a.canChat) throw forbidden('CHAT_FORBIDDEN');
    if (a.r.status === 'cancelled') throw conflict('CHAT_CLOSED');
    const { rows } = await db.query(
      `INSERT INTO messages (request_id, sender_id, body) VALUES ($1,$2,$3) RETURNING id, body, created_at, sender_id`,
      [id, user.id, body],
    );
    await db.query(
      `INSERT INTO message_reads (request_id, user_id, last_read_id) VALUES ($1,$2,$3)
       ON CONFLICT (request_id, user_id) DO UPDATE SET last_read_id = GREATEST(message_reads.last_read_id, EXCLUDED.last_read_id), read_at = now()`,
      [id, user.id, rows[0].id],
    );
    const msg = {
      ...rows[0], sender_name: user.full_name,
      sender_role: user.id === a.r.author_id ? 'author' : user.is_coordinator ? 'coordinator' : 'volunteer',
    };
    const recipients = [a.r.author_id, a.asg?.volunteer_id].filter((x) => x && x !== user.id);
    for (const uid of recipients) after.push(() => sendToUser(uid, 'message', { request_id: id, message: msg }));
    await notify(db, after, {
      userIds: recipients, requestId: id, type: 'message', params: { title: a.r.title, name: user.full_name, text: body.slice(0, 120) },
    });
    return msg;
  });
}

// ───────────────────────── Ұсыныстар мен қайталауды табу ─────────────────────────
// Себептер тұрақты кодтар мен параметрлер ретінде қайтарылады: frontend оларды таңдалған тілде көрсетеді.

function localParts(date) {
  // Қазақстан уақыты: UTC+5
  const d = new Date(date.getTime() + 5 * 3600e3);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return { dow, minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};
const hhmm = (t) => String(t).slice(0, 5);

/** Уақыт сәйкестігі тек құрылымдалған деректер бойынша есептеледі. */
export function timeMatch(r, v) {
  if (!r.needed_from) return { state: 'unknown', code: 'TIME_UNKNOWN_REQUEST', params: {} };
  if (!v.available_days?.length || !v.time_from || !v.time_to) return { state: 'unknown', code: 'TIME_UNKNOWN_VOLUNTEER', params: {} };
  const { dow, minutes } = localParts(new Date(r.needed_from));
  if (!v.available_days.includes(dow)) return { state: 'no', code: 'TIME_NO_DAY', params: { dow } };
  const range = { from: hhmm(v.time_from), to: hhmm(v.time_to) };
  if (minutes < toMin(v.time_from) || minutes > toMin(v.time_to)) return { state: 'no', code: 'TIME_OUTSIDE', params: range };
  return { state: 'yes', code: 'TIME_YES', params: { dow, ...range } };
}

export async function recommendVolunteers(r) {
  const disaster = r.direction === 'disaster';
  const { rows } = await query(
    `SELECT vp.*, u.full_name,
            EXISTS (SELECT 1 FROM volunteer_categories vc WHERE vc.user_id = vp.user_id AND vc.category_id = $2) AS category_ok,
            (SELECT ap.status FROM applications ap WHERE ap.request_id = $4 AND ap.volunteer_id = vp.user_id
              ORDER BY ap.id DESC LIMIT 1) AS application_status,
            (SELECT count(*)::int FROM assignments s JOIN help_requests h ON h.id = s.request_id
              WHERE s.volunteer_id = vp.user_id AND h.status = 'completed') AS completed_count
       FROM volunteer_profiles vp
       JOIN users u ON u.id = vp.user_id
      WHERE vp.is_active AND vp.city_id = $1 AND vp.user_id <> $3`,
    [r.city_id, r.category_id, r.author_id, r.id],
  );
  const out = [];
  for (const v of rows) {
    if (!v.category_ok) continue;
    // Апатқа қатысты өтінішке тек қауіпсіздік ережесімен келіскен еріктілер ұсынылады
    if (disaster && !v.disaster_support) continue;
    const reasons = [{ code: 'CITY', params: { city_id: v.city_id } }, { code: 'CATEGORY', params: { category: r.category_code } }];
    const warnings = [];
    if (disaster) reasons.push({ code: 'DISASTER_READY', params: {} });
    let distance = null;
    if (v.base_lat != null) {
      distance = haversineKm(v.base_lat, v.base_lng, r.approx_lat, r.approx_lng);
      if (distance > Number(v.radius_km)) continue;
      reasons.push({ code: 'RADIUS', params: { km: +distance.toFixed(1), radius: Number(v.radius_km) } });
    } else {
      warnings.push({ code: 'NO_BASE', params: {} });
    }
    const tm = timeMatch(r, v);
    (tm.state === 'yes' ? reasons : warnings).push({ code: tm.code, params: tm.params });
    if (v.completed_count) reasons.push({ code: 'COMPLETED', params: { count: v.completed_count } });
    out.push({
      user_id: v.user_id, full_name: v.full_name, district: v.district, radius_km: v.radius_km,
      distance_km: distance, time_state: tm.state, reasons, warnings, application_status: v.application_status,
      score: (tm.state === 'yes' ? 2 : tm.state === 'unknown' ? 1 : 0) * 10 - (distance ?? 5),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 8);
}

export async function findDuplicates(r) {
  const { rows } = await query(
    `SELECT r.id, r.title, r.description, r.district, r.moderation_status, r.status, r.created_at, r.disaster_event_id,
            qm_distance_km($3, $4, r.approx_lat, r.approx_lng) AS distance_km
       FROM help_requests r
      WHERE r.id <> $1 AND r.city_id = $2 AND r.category_id = $5
        AND r.status <> 'cancelled' AND r.moderation_status IN ('pending','approved')
        AND r.created_at > now() - interval '45 days'
        AND qm_distance_km($3, $4, r.approx_lat, r.approx_lng) <= 2`,
    [r.id, r.city_id, r.approx_lat, r.approx_lng, r.category_id],
  );
  const base = `${r.title} ${r.description}`;
  const out = [];
  for (const o of rows) {
    const sim = similarity(base, `${o.title} ${o.description}`);
    if (sim < 0.12 && !(o.district && o.district === r.district && sim >= 0.08)) continue;
    const reasons = [
      { code: 'SAME_CATEGORY', params: { category: r.category_code } },
      { code: 'DISTANCE', params: { km: +o.distance_km.toFixed(1) } },
    ];
    if (o.district && o.district === r.district) reasons.push({ code: 'SAME_DISTRICT', params: { district: o.district } });
    if (r.disaster_event_id && o.disaster_event_id === r.disaster_event_id) reasons.push({ code: 'SAME_EVENT', params: {} });
    const words = commonWords(base, `${o.title} ${o.description}`);
    reasons.push({ code: 'TEXT_SIMILARITY', params: { pct: Math.round(sim * 100), words: words.join(', ') } });
    out.push({
      id: o.id, title: o.title, status: o.status, moderation_status: o.moderation_status,
      created_at: o.created_at, similarity: sim, distance_km: o.distance_km, reasons,
    });
  }
  out.sort((a, b) => b.similarity - a.similarity);
  return out.slice(0, 5);
}
