import { query } from '../db/pool.js';
import { loadAccess, recommendVolunteers, findDuplicates } from './requests.js';

/**
 * Өтініш бетінің деректері. Әр бөлік қолданушының рөліне қарай серверде сүзіледі:
 * жеке мекенжай мен телефон тек иесіне, белсенді орындаушыға және координаторға беріледі.
 */
export async function getDetail(user, id) {
  const a = await loadAccess({ query }, id, user);
  const r = a.r;
  const orgCoords = r.org_id ? new Set((await query(
    `SELECT user_id FROM organization_members WHERE org_id=$1 AND role='coordinator'`, [r.org_id],
  )).rows.map((x) => x.user_id)) : new Set();
  const roleOf = (uid, coord) => (uid === r.author_id ? 'author' : coord ? 'coordinator' : orgCoords.has(uid) ? 'org_coordinator' : 'volunteer');

  const request = {
    id: r.id, title: r.title, description: r.description, city_id: r.city_id, city_name: r.city_name,
    category_id: r.category_id, category_code: r.category_code, category_name: r.category_name, category_color: r.category_color,
    district: r.district, public_place: r.public_place, approx_lat: r.approx_lat, approx_lng: r.approx_lng,
    needed_from: r.needed_from, needed_to: r.needed_to, needed_note: r.needed_note, urgency: r.urgency,
    status: r.status, moderation_status: r.moderation_status, is_demo: r.is_demo,
    created_at: r.created_at, published_at: r.published_at, completed_at: r.completed_at,
    cancel_reason: r.cancel_reason,
    disputed: !!r.disputed_at,
    content_lang: r.content_lang, direction: r.direction,
    disaster_event_id: r.disaster_event_id, disaster_type_code: r.disaster_type_code,
    quantity: r.quantity == null ? null : Number(r.quantity), quantity_unit: r.quantity_unit,
    org: null, org_accepted_at: r.org_accepted_at,
  };
  if (r.org_id) {
    request.org = (await query('SELECT id, name, is_demo FROM organizations WHERE id=$1', [r.org_id])).rows[0] || null;
  }
  if (r.disaster_event_id) {
    const e = (await query(
      `SELECT e.id, e.title, e.activity_status, e.verification_status, e.is_demo, e.content_lang, t.code AS type_code
         FROM disaster_events e JOIN disaster_types t ON t.id = e.type_id WHERE e.id=$1`, [r.disaster_event_id],
    )).rows[0];
    request.event = e || null;
  }
  if (a.isAuthor || a.isCoordinator) {
    request.rejection_reason = r.rejection_reason;
    request.dispute_note = r.dispute_note;
    request.duplicate_of = r.duplicate_of;
  }

  const author = (await query('SELECT full_name FROM users WHERE id=$1', [r.author_id])).rows[0];
  // Жария бетте автордың тек аты көрсетіледі (тегі қысқартылады)
  const [first, last] = (author?.full_name || '').split(' ');
  request.author_display = a.canSeePrivate ? author?.full_name : `${first}${last ? ' ' + last[0] + '.' : ''}`;

  let privateInfo = null;
  if (a.canSeePrivate) {
    const p = (await query('SELECT address, exact_lat, exact_lng, contact_phone FROM request_private WHERE request_id=$1', [id])).rows[0];
    privateInfo = p || null;
  }

  const ev = (await query(
    `SELECT e.id, e.event_type, e.from_status, e.to_status, e.note, e.created_at, e.actor_id,
            u.full_name AS actor_name, u.is_coordinator AS actor_coord
       FROM request_events e LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.request_id=$1 ORDER BY e.created_at, e.id`, [id],
  )).rows;
  const events = ev.map((e) => {
    const role = e.actor_id ? roleOf(e.actor_id, e.actor_coord) : 'system';
    const out = { id: e.id, type: e.event_type, from: e.from_status, to: e.to_status, created_at: e.created_at, actor_role: role };
    if (a.canSeePrivate) {
      out.actor_name = e.actor_name;
      out.note = e.note;
    } else if (['cancelled'].includes(e.event_type)) {
      out.note = e.note;
    }
    return out;
  });

  const attachments = (await query(
    `SELECT id, original_name, mime_type, size_bytes, width, height, visibility, created_at FROM attachments WHERE request_id=$1 ORDER BY id`, [id],
  )).rows.filter((t) => t.visibility === 'public' || a.canSeePrivate);

  let applications = null;
  if (a.isAuthor || a.isCoordinator || a.isOrgCoordinator) {
    applications = (await query(
      `SELECT ap.id, ap.volunteer_id, ap.message, ap.status, ap.created_at, u.full_name,
              vp.district, vp.bio, vp.city_id AS volunteer_city_id,
              EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = $2 AND om.user_id = ap.volunteer_id) AS in_org_team,
              EXISTS (SELECT 1 FROM volunteer_categories vc WHERE vc.user_id = ap.volunteer_id AND vc.category_id = $3) AS category_match,
              (SELECT count(*)::int FROM assignments s JOIN help_requests h ON h.id=s.request_id
                WHERE s.volunteer_id = ap.volunteer_id AND h.status='completed') AS completed_count
         FROM applications ap JOIN users u ON u.id = ap.volunteer_id
         LEFT JOIN volunteer_profiles vp ON vp.user_id = ap.volunteer_id
        WHERE ap.request_id=$1 ORDER BY ap.status = 'active' DESC, ap.created_at`, [id, r.org_id, r.category_id],
    )).rows;
  }

  let myApplication = null;
  if (user && !a.isAuthor) {
    myApplication = (await query(
      `SELECT id, status, message, created_at FROM applications WHERE request_id=$1 AND volunteer_id=$2 ORDER BY id DESC LIMIT 1`,
      [id, user.id],
    )).rows[0] || null;
  }

  const assignee = a.asg
    ? { volunteer_id: a.asg.volunteer_id, full_name: a.canSeePrivate ? a.asg.volunteer_name : a.asg.volunteer_name.split(' ')[0], assigned_at: a.asg.assigned_at }
    : null;

  let recommendations = null;
  let duplicates = null;
  if ((a.isAuthor || a.isCoordinator) && r.moderation_status === 'approved' && r.status === 'open') {
    recommendations = await recommendVolunteers(r);
  }
  if (a.isCoordinator && ['pending', 'approved'].includes(r.moderation_status)) {
    duplicates = await findDuplicates(r);
  }

  return {
    request,
    private: privateInfo,
    events,
    attachments,
    applications,
    my_application: myApplication,
    assignee,
    recommendations,
    duplicates,
    viewer: {
      is_author: a.isAuthor,
      is_assignee: a.isAssignee,
      is_coordinator: a.isCoordinator,
      is_org_coordinator: a.isOrgCoordinator,
      can_see_private: a.canSeePrivate,
      can_chat: a.canChat,
      logged_in: !!user,
    },
  };
}
