// Еріктілер ұйымының кабинеті: команда, кіріс өтініштер, жұмыстағы және аяқталған тапсырмалар, нәтижелер есебі.
// Ұйым координаторының құқығы тек өз ұйымымен шектеледі — әр сұрауда серверде тексеріледі.
import { query } from '../db/pool.js';
import { conflict, forbidden, notFound } from '../http.js';
import { run, addEvent, loadAccess, PUBLIC_COLS, FROM as REQ_FROM } from './requests.js';
import { notify } from './notify.js';

export async function userOrgs(userId) {
  if (!userId) return [];
  return (await query(
    `SELECT o.id, o.name, o.city_id, o.is_demo, m.role FROM organization_members m JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = $1 ORDER BY o.id`, [userId],
  )).rows;
}

/** Ұйымды және қолданушының рөлін тексереді. need='coordinator' болса, тек ұйым координаторына рұқсат. */
export async function requireOrg(user, orgId, need = 'member') {
  const org = (await query('SELECT id, name, description, city_id, is_demo FROM organizations WHERE id=$1', [orgId])).rows[0];
  if (!org) throw notFound('ORG_NOT_FOUND');
  const role = user ? (await query('SELECT role FROM organization_members WHERE org_id=$1 AND user_id=$2', [orgId, user.id])).rows[0]?.role : null;
  if (!role) throw forbidden('ORG_FORBIDDEN');
  if (need === 'coordinator' && role !== 'coordinator') throw forbidden('ORG_COORDINATOR_ONLY');
  return { org, role };
}

export async function orgInfo(user, orgId) {
  const { org, role } = await requireOrg(user, orgId);
  const counts = (await query(
    `SELECT
       (SELECT count(*)::int FROM organization_members WHERE org_id=$1) AS members,
       (SELECT count(*)::int FROM help_requests WHERE org_id=$1 AND status IN ('open','assigned','in_progress','awaiting_confirmation')) AS active,
       (SELECT count(*)::int FROM help_requests WHERE org_id=$1 AND status='completed') AS done`, [orgId],
  )).rows[0];
  return { org, role, counts };
}

export async function members(user, orgId) {
  await requireOrg(user, orgId, 'coordinator');
  return (await query(
    `SELECT u.id, u.full_name, u.phone, m.role, m.joined_at, vp.city_id, vp.district, vp.disaster_support, (vp.user_id IS NOT NULL AND vp.is_active) AS is_volunteer,
            COALESCE((SELECT json_agg(hc.code ORDER BY hc.sort) FROM volunteer_categories vc JOIN help_categories hc ON hc.id = vc.category_id
                       WHERE vc.user_id = u.id), '[]'::json) AS categories,
            (SELECT count(*)::int FROM assignments s JOIN help_requests h ON h.id = s.request_id
              WHERE s.volunteer_id = u.id AND s.is_active AND h.status IN ('assigned','in_progress','awaiting_confirmation')) AS active_tasks,
            (SELECT count(*)::int FROM assignments s JOIN help_requests h ON h.id = s.request_id
              WHERE s.volunteer_id = u.id AND s.is_active AND h.status = 'completed') AS completed
       FROM organization_members m JOIN users u ON u.id = m.user_id LEFT JOIN volunteer_profiles vp ON vp.user_id = u.id
      WHERE m.org_id = $1 ORDER BY m.role, u.full_name`, [orgId],
  )).rows;
}

const VIEWS = {
  incoming: `r.moderation_status = 'approved' AND r.status = 'open' AND r.org_id IS NULL`,
  active: `r.org_id = $1 AND r.moderation_status = 'approved' AND r.status IN ('open','assigned','in_progress','awaiting_confirmation')`,
  done: `r.org_id = $1 AND r.status = 'completed'`,
  review: `r.moderation_status = 'pending'`,
};

export async function listRequests(user, orgId, q) {
  await requireOrg(user, orgId, 'coordinator');
  const view = VIEWS[q.view] ? q.view : 'incoming';
  const params = [orgId];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  const where = [VIEWS[view]];
  if (Number(q.city_id)) where.push(`r.city_id = ${p(Number(q.city_id))}`);
  if (Number(q.category_id)) where.push(`r.category_id = ${p(Number(q.category_id))}`);
  if (Number(q.event_id)) where.push(`r.disaster_event_id = ${p(Number(q.event_id))}`);
  if (['open', 'assigned', 'in_progress', 'awaiting_confirmation', 'completed'].includes(q.status)) where.push(`r.status = ${p(q.status)}`);
  const rows = (await query(
    `SELECT ${PUBLIC_COLS}, r.org_accepted_at,
            (SELECT u.full_name FROM assignments s JOIN users u ON u.id = s.volunteer_id WHERE s.request_id = r.id AND s.is_active) AS assignee_name
       ${REQ_FROM} WHERE ${where.join(' AND ')} AND ($1::int IS NOT NULL)
      ORDER BY r.urgency = 'high' DESC, r.updated_at DESC LIMIT 200`, params,
  )).rows;
  // Команда мүшелерінің ұсыныстары: аты, қаласы және осы санатта көмектесе ме — координатор салыстыруы үшін
  if (rows.length && view !== 'review' && view !== 'done') {
    const offers = (await query(
      `SELECT ap.id AS application_id, ap.request_id, ap.message, ap.created_at, u.id AS volunteer_id, u.full_name,
              vp.city_id AS volunteer_city_id, m.role,
              EXISTS (SELECT 1 FROM volunteer_categories vc JOIN help_requests h ON h.id = ap.request_id
                       WHERE vc.user_id = u.id AND vc.category_id = h.category_id) AS category_match,
              COALESCE((SELECT json_agg(hc.code ORDER BY hc.sort) FROM volunteer_categories vc JOIN help_categories hc ON hc.id = vc.category_id
                         WHERE vc.user_id = u.id), '[]'::json) AS categories
         FROM applications ap JOIN users u ON u.id = ap.volunteer_id
         JOIN organization_members m ON m.user_id = ap.volunteer_id AND m.org_id = $1
         LEFT JOIN volunteer_profiles vp ON vp.user_id = u.id
        WHERE ap.status = 'active' AND ap.request_id = ANY($2) ORDER BY ap.created_at`, [orgId, rows.map((r) => r.id)],
    )).rows;
    const other = (await query(
      `SELECT ap.request_id, count(*)::int AS n FROM applications ap
        WHERE ap.status = 'active' AND ap.request_id = ANY($2)
          AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.org_id = $1 AND m.user_id = ap.volunteer_id)
        GROUP BY ap.request_id`, [orgId, rows.map((r) => r.id)],
    )).rows;
    for (const r of rows) {
      r.team_offers = offers.filter((o) => o.request_id === r.id);
      r.other_offers = other.find((o) => o.request_id === r.id)?.n ?? 0;
    }
  }
  return { view, items: rows };
}

/** Ұйым өтінішті жұмысқа қабылдайды. Бір өтініш — бір ұйым (FOR UPDATE + тексеру). */
export async function accept(user, orgId, requestId) {
  const { org } = await requireOrg(user, orgId, 'coordinator');
  return run(async (db, after) => {
    const a = await loadAccess(db, requestId, user, { lock: true });
    if (a.r.org_id && a.r.org_id !== orgId) throw conflict('ORG_ALREADY_ACCEPTED');
    if (a.r.org_id === orgId) return { ok: true, already: true };
    if (a.r.moderation_status !== 'approved' || a.r.status !== 'open') throw conflict('ORG_ACCEPT_STAGE', { status: a.r.status });
    await db.query(`UPDATE help_requests SET org_id=$2, org_accepted_at=now(), org_accepted_by=$3, updated_at=now() WHERE id=$1`, [requestId, orgId, user.id]);
    await addEvent(db, requestId, user.id, 'org_accepted', 'open', 'open', org.name);
    await notify(db, after, { userIds: [a.r.author_id], requestId, type: 'org_accepted', params: { title: a.r.title, org: org.name } });
    return { ok: true };
  });
}

// ───────── Көмек нәтижелері ─────────
function reportFilter(orgId, f) {
  const params = [orgId, f.from, f.to];
  const extra = [];
  if (f.cityId) { params.push(f.cityId); extra.push(`h.city_id = $${params.length}`); }
  if (f.eventId) { params.push(f.eventId); extra.push(`h.disaster_event_id = $${params.length}`); }
  return { params, cond: extra.length ? ' AND ' + extra.join(' AND ') : '' };
}

/**
 * Көрсеткіштер тек PostgreSQL-дегі жазбалардан:
 *  accepted   — кезеңде ұйым қабылдаған өтініштер (org_accepted_at кезең ішінде);
 *  confirmed  — ұйымның өтініштерінің ішінде көмекті алушының өзі растағандары (completed оқиғасының авторы = өтініш иесі,
 *               растау уақыты кезең ішінде; бұл оқиға бір өтінішке бір рет жазылады, сондықтан қайта растау санды өсірмейді);
 *  open_need  — қазіргі сәтте ұйым қабылдаған, бірақ орындаушысы жоқ ашық өтініштер;
 *  median     — жарияланудан алғашқы орындаушы тағайындалғанға дейінгі медиана (сағат), екі уақыты да бар өтініштер бойынша.
 */
export async function report(user, orgId, f) {
  const { org } = await requireOrg(user, orgId, 'coordinator');
  const { params, cond } = reportFilter(orgId, f);
  const main = (await query(
    `SELECT
       count(*) FILTER (WHERE h.org_accepted_at >= $2 AND h.org_accepted_at < $3)::int AS accepted,
       count(*) FILTER (WHERE h.status = 'completed' AND EXISTS (
         SELECT 1 FROM request_events e WHERE e.request_id = h.id AND e.event_type = 'completed' AND e.actor_id = h.author_id
            AND e.created_at >= $2 AND e.created_at < $3))::int AS confirmed,
       count(*) FILTER (WHERE h.status = 'open' AND h.moderation_status = 'approved')::int AS open_need,
       bool_or(h.is_demo) AS has_demo
     FROM help_requests h WHERE h.org_id = $1 ${cond}`, params,
  )).rows[0];
  const med = (await query(
    `SELECT count(*)::int AS n,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (h.first_assigned_at - h.published_at)) / 3600) AS hours
       FROM help_requests h
      WHERE h.org_id = $1 AND h.published_at IS NOT NULL AND h.first_assigned_at IS NOT NULL
        AND h.first_assigned_at >= h.published_at AND h.first_assigned_at >= $2 AND h.first_assigned_at < $3 ${cond}`, params,
  )).rows[0];
  const byCategory = (await query(
    `SELECT hc.code, hc.direction,
            count(*) FILTER (WHERE h.org_accepted_at >= $2 AND h.org_accepted_at < $3)::int AS accepted,
            count(*) FILTER (WHERE h.status = 'completed' AND EXISTS (
              SELECT 1 FROM request_events e WHERE e.request_id = h.id AND e.event_type = 'completed' AND e.actor_id = h.author_id
                 AND e.created_at >= $2 AND e.created_at < $3))::int AS confirmed,
            count(*) FILTER (WHERE h.status = 'open' AND h.moderation_status = 'approved')::int AS open_need
       FROM help_requests h JOIN help_categories hc ON hc.id = h.category_id
      WHERE h.org_id = $1 ${cond} GROUP BY hc.code, hc.direction, hc.sort ORDER BY hc.sort`, params,
  )).rows.filter((c) => c.accepted || c.confirmed || c.open_need);
  return {
    org: { id: org.id, name: org.name, is_demo: org.is_demo },
    filters: { from: f.from.toISOString(), to: f.to.toISOString(), city_id: f.cityId || null, event_id: f.eventId || null },
    accepted: main.accepted, confirmed: main.confirmed, open_need: main.open_need,
    median_hours: med.n ? Math.round(Number(med.hours) * 10) / 10 : null, median_n: med.n,
    by_category: byCategory,
    demo: !!(org.is_demo || main.has_demo),
  };
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV: тек жиынтық көрсеткіштер (телефон, мекенжай, хат жоқ). Тақырыптар таңдалған тілде келеді. */
export function reportCsv(rep, labels) {
  const L = (k) => labels[k] || k;
  const rows = [
    [L('title'), rep.org.name],
    [L('period'), `${rep.filters.from.slice(0, 10)} — ${new Date(new Date(rep.filters.to).getTime() - 1).toISOString().slice(0, 10)}`],
    [L('city'), labels.cityName || L('all')],
    [L('event'), labels.eventName || L('all')],
  ];
  if (rep.demo) rows.push([L('demo'), L('demoText')]);
  rows.push([]);
  rows.push([L('metric'), L('value'), L('explain')]);
  rows.push([L('accepted'), rep.accepted, L('acceptedHint')]);
  rows.push([L('confirmed'), rep.confirmed, L('confirmedHint')]);
  rows.push([L('openNeed'), rep.open_need, L('openNeedHint')]);
  rows.push([L('median'), rep.median_hours ?? '', `${L('medianHint')} (n = ${rep.median_n})`]);
  rows.push([]);
  rows.push([L('category'), L('accepted'), L('confirmed'), L('openNeed')]);
  for (const c of rep.by_category) rows.push([labels[`cat_${c.code}`] || c.code, c.accepted, c.confirmed, c.open_need]);
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
