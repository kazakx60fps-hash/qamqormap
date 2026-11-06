// GitHub Pages нұсқасы үшін «сервер»: алдын ала дайындалған оқу деректерінен (data/demo-snapshot.json)
// тек жария GET сұрауларына жауап береді. Сүзгілер сервердегі логикамен бірдей.
// Жеке деректер (мекенжай, телефон, нақты координат, чат) снапшотқа мүлде кірмейді.
// Кіру, өтініш жіберу, модерация сияқты әрекеттер STATIC_DEMO қатесін қайтарады.
// Жаңа хабарлама тек бет жадында сақталады (localStorage қолданылмайды).
import { asset } from './base.js';

let snapPromise = null;
function snapshot() {
  snapPromise ||= fetch(asset('/data/demo-snapshot.json'), { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: 0, code: 'NETWORK' }); return r.json(); })
    .then((s) => Object.assign(s, { cities: s.ref['/cities'].items }))
    .catch((e) => { snapPromise = null; throw Object.assign(e, { status: 0, code: 'NETWORK' }); });
  return snapPromise;
}

const err = (status, code) => Object.assign(new Error(code), { status, code });
const memReports = [];

function km(a, b, c, d) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

const STATUS_GROUPS = {
  active: ['open', 'assigned', 'in_progress', 'awaiting_confirmation'],
  open: ['open'],
  progress: ['assigned', 'in_progress', 'awaiting_confirmation'],
  completed: ['completed'],
};
const ST_ORDER = { open: 0, assigned: 1, in_progress: 1, awaiting_confirmation: 2 };
const URG_ORDER = { high: 0, normal: 1 };

function searchRequests(S, q) {
  const cities = new Map(S.cities.map((c) => [c.id, c]));
  const status = ['active', 'open', 'progress', 'completed', 'all'].includes(q.status) ? q.status : 'active';
  const like = (v, s) => String(v || '').toLowerCase().includes(s.toLowerCase());
  const lat = num(q.near_lat), lng = num(q.near_lng), rad = num(q.radius_km);
  const near = Number.isFinite(lat) && Number.isFinite(lng) && lat !== null ? { lat, lng, rad: rad && rad > 0 ? Math.min(rad, 200) : null } : null;
  let items = S.requests.filter((r) =>
    (!num(q.city_id) || r.city_id === num(q.city_id))
    && (!q.region || cities.get(r.city_id)?.region_code === q.region)
    && (!num(q.category_id) || r.category_id === num(q.category_id))
    && (!q.direction || r.direction === q.direction)
    && (!num(q.event_id) || r.disaster_event_id === num(q.event_id))
    && (!q.disaster_type || r.disaster_type_code === q.disaster_type)
    && (status === 'all' || STATUS_GROUPS[status].includes(r.status))
    && (!q.urgency || r.urgency === q.urgency)
    && (!q.district || like(r.district, q.district))
    && (!q.q || like(r.title, q.q) || like(r.summary, q.q) || like(r.public_place, q.q)))
    .map((r) => ({ ...r, distance_km: near ? km(near.lat, near.lng, r.approx_lat, r.approx_lng) : null }));
  if (near?.rad) items = items.filter((r) => r.distance_km <= near.rad);
  items.sort(near
    ? (a, b) => a.distance_km - b.distance_km || b.id - a.id
    : (a, b) => (ST_ORDER[a.status] ?? 3) - (ST_ORDER[b.status] ?? 3) || (URG_ORDER[a.urgency] ?? 2) - (URG_ORDER[b.urgency] ?? 2)
      || String(b.published_at || '').localeCompare(String(a.published_at || '')) || b.id - a.id);
  const limit = Math.min(Math.max(num(q.limit) || 50, 1), 200);
  const offset = Math.max(num(q.offset) || 0, 0);
  return { total: items.length, items: items.slice(offset, offset + limit), limit, offset };
}

function cityMatch(S, e, cityId) {
  const c = S.cities.find((x) => x.id === cityId);
  if (!c) return false;
  return (e.areas || []).some((a) => a.city_id === cityId || (a.region_code && a.region_code === c.region_code))
    || (e.lat != null && km(c.lat, c.lng, e.lat, e.lng) <= 60);
}
function regionMatch(S, e, region) {
  return (e.areas || []).some((a) => a.region_code === region || (a.city_id && S.cities.find((x) => x.id === a.city_id)?.region_code === region));
}
function listEvents(S, q) {
  const items = S.events.filter((e) =>
    (!num(q.city_id) || cityMatch(S, e, num(q.city_id)))
    && (!q.region || regionMatch(S, e, q.region))
    && (!q.type || e.type_code === q.type)
    && (!['active', 'resolved'].includes(q.activity) || e.activity_status === q.activity)
    && (!['verified', 'unverified'].includes(q.verification) || e.verification_status === q.verification));
  items.sort((a, b) => (b.activity_status === 'active') - (a.activity_status === 'active') || String(b.updated_at).localeCompare(String(a.updated_at)));
  return { items: items.slice(0, Math.min(Math.max(num(q.limit) || 100, 1), 200)) };
}

const NEED_STATES = ['need_executor', 'assigned', 'awaiting', 'confirmed'];
function needs(S, id, q) {
  const base = S.needs[id];
  if (!base) throw err(404, 'EVENT_NOT_FOUND');
  const all = base.items;
  const district = typeof q.district === 'string' ? q.district : undefined;
  const items = all.filter((r) =>
    (!num(q.city_id) || r.city_id === num(q.city_id))
    && (district === undefined || (r.district || '') === district)
    && (!q.category || r.category_code === q.category)
    && (!NEED_STATES.includes(q.state) || r.need_state === q.state));
  const zero = () => ({ need_executor: 0, assigned: 0, awaiting: 0, confirmed: 0 });
  const totals = zero();
  const groups = new Map();
  for (const r of items) {
    const key = `${r.city_id}|${r.district || ''}|${r.category_code}`;
    if (!groups.has(key)) groups.set(key, { city_id: r.city_id, district: r.district, category_code: r.category_code, counts: zero(), total: 0, resources: {} });
    const g = groups.get(key);
    g.counts[r.need_state]++;
    g.total++;
    totals[r.need_state]++;
    if (r.quantity != null && r.quantity_unit) g.resources[r.quantity_unit] = (g.resources[r.quantity_unit] || 0) + Number(r.quantity);
  }
  totals.total = items.length;
  return {
    ...base,
    totals,
    items,
    groups: [...groups.values()].map((g) => ({ ...g, resources: Object.entries(g.resources).map(([unit, amount]) => ({ unit, amount })) })),
  };
}

export async function staticApi(path, { method = 'GET', body, query = {} } = {}) {
  const S = await snapshot();
  const q = Object.fromEntries(Object.entries(query || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const [p, qs] = path.split('?');
  if (qs) for (const [k, v] of new URLSearchParams(qs)) q[k] = v;
  let m;
  if (method === 'GET') {
    if (p === '/auth/me') return { user: null, csrfToken: null, unread: 0 };
    if (p === '/health') return { ok: true, static: true };
    if (['/cities', '/categories', '/regions', '/disaster-types', '/map-config'].includes(p)) return S.ref[p];
    if (p === '/stats') return S.stats[num(q.city_id) || 'all'] || S.stats.all;
    if (p === '/requests') return searchRequests(S, q);
    if ((m = p.match(/^\/requests\/(\d+)$/))) { const d = S.details[m[1]]; if (!d) throw err(404, 'REQUEST_NOT_FOUND'); return d; }
    if (p === '/events') return listEvents(S, q);
    if ((m = p.match(/^\/events\/(\d+)$/))) { const d = S.eventDetails[m[1]]; if (!d) throw err(404, 'EVENT_NOT_FOUND'); return d; }
    if ((m = p.match(/^\/events\/(\d+)\/needs$/))) return needs(S, m[1], q);
  }
  if (method === 'POST' && p === '/disaster-reports') {
    // Демо: хабарлама ешқайда жіберілмейді, тек осы бет ашық тұрғанда көрінеді
    if (!body?.type || !body?.description || String(body.description).trim().length < 20) throw err(400, 'VALIDATION');
    const rep = { id: 900000 + memReports.length + 1, status: 'pending', created_at: new Date().toISOString(), static: true };
    memReports.push({ ...body, ...rep });
    return rep;
  }
  throw err(403, 'STATIC_DEMO');
}
