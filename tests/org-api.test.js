// Ұйым кабинеті, қажеттіліктер тақтасы және көмек нәтижелері есебінің API тесттері (Қызылорда оқу сценарийі).
import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB || TEST_DB === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL бөлек болуы керек.');
process.env.DATABASE_URL = TEST_DB;
process.env.RATE_LIMIT_SCALE = '50';

const { pool } = await import('../server/db/pool.js');
const { migrate } = await import('../server/db/migrate.js');
const { seed } = await import('../server/db/seed.js');
const { createApp } = await import('../server/app.js');

let server, base;
class M {
  constructor() { this.token = null; }
  async req(method, path, body, raw = false) {
    const headers = { Accept: 'application/json', 'X-Client': 'mobile' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + '/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (raw) return res;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (data?.token) this.token = data.token;
    return { status: res.status, data };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
}
async function login(email) {
  const m = new M();
  const r = await m.post('/auth/login', { email, password: 'Demo12345' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  m.user = r.data.user;
  return m;
}
const D = '@demo.qamqormap.kz';
let coord, coord2, vol1, vol2, recipient, outsider, guest, org1, org2, ev, ids = {};

before(async () => {
  const c = await pool.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  c.release();
  await migrate({ log: () => {} });
  await seed({ log: () => {} });
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  coord = await login(`kzo.coord${D}`);
  coord2 = await login(`ast.org${D}`);
  vol1 = await login(`kzo.vol1${D}`);
  vol2 = await login(`kzo.vol2${D}`);
  recipient = await login(`kzo.recipient${D}`);
  outsider = await login(`aigerim${D}`);
  guest = new M();
  org1 = coord.user.orgs[0];
  org2 = coord2.user.orgs[0];
  for (const r of (await pool.query(`SELECT id, demo_key FROM help_requests WHERE demo_key LIKE 'kzo-%'`)).rows) ids[r.demo_key] = r.id;
  ev = (await pool.query(`SELECT id FROM disaster_events WHERE demo_key='demo-flood-kzo'`)).rows[0].id;
});
after(async () => { server?.close(); await pool.end(); });

test('ұйым мүшелігі: кіргенде ұйым мен рөл қайтарылады, бөтен ұйымның кабинеті жабық', async () => {
  assert.equal(org1.role, 'coordinator');
  assert.equal(vol1.user.orgs[0].role, 'volunteer');
  assert.equal((await coord.get(`/orgs/${org1.id}/members`)).data.items.length, 3);
  assert.equal((await coord2.get(`/orgs/${org1.id}/members`)).data.code, 'ORG_FORBIDDEN');
  assert.equal((await coord2.get(`/orgs/${org1.id}/requests?view=active`)).status, 403);
  assert.equal((await coord2.get(`/orgs/${org1.id}/report`)).status, 403);
  assert.equal((await vol1.get(`/orgs/${org1.id}/requests`)).data.code, 'ORG_COORDINATOR_ONLY');
  assert.equal((await outsider.get(`/orgs/${org1.id}`)).status, 403);
  assert.equal((await guest.get(`/orgs/${org1.id}`)).status, 401);
});

test('қажеттіліктер тақтасы: тек жарияланған өтініштер, күйлер, ресурс бірлігімен бөлек, сүзгілер', async () => {
  const n = (await guest.get(`/events/${ev}/needs`)).data;
  assert.equal(n.event.is_demo, true);
  assert.equal(n.totals.total, 3, 'тексерудегі өтініш жария тақтаға кірмеуі керек');
  assert.ok(!n.items.some((r) => r.id === ids['kzo-flood-4']));
  assert.deepEqual({ ne: n.totals.need_executor, as: n.totals.assigned, cf: n.totals.confirmed }, { ne: 1, as: 1, cf: 1 });
  const water = n.groups.find((g) => g.category_code === 'water_food');
  assert.deepEqual(water.resources, [{ unit: 'bottle', amount: 20 }]);
  assert.equal(water.district, 'Тасбөгет кенті');
  assert.ok(!JSON.stringify(n).includes('Жібек жолы'), 'тақтада нақты мекенжай болмауы керек');
  const f1 = (await guest.get(`/events/${ev}/needs?state=need_executor`)).data;
  assert.deepEqual(f1.items.map((r) => r.id), [ids['kzo-flood-1']]);
  const f2 = (await guest.get(`/events/${ev}/needs?category=shelter`)).data;
  assert.equal(f2.totals.total, 1);
  const f3 = (await guest.get(`/events/${ev}/needs?district=${encodeURIComponent('Тасбөгет кенті')}`)).data;
  assert.equal(f3.totals.total, 2);
});

test('кабинет: тексеру кезегі координаторға көрінеді, кіріс, сүзгілер, команда ұсыныстары', async () => {
  const review = (await coord.get(`/orgs/${org1.id}/requests?view=review&event_id=${ev}`)).data.items;
  assert.ok(review.some((r) => r.id === ids['kzo-flood-4']), 'тексеру кезегінде өтініш жоқ');
  assert.equal((await guest.get(`/requests/${ids['kzo-flood-4']}`)).status, 404, 'тексерудегі өтініш жария емес');
  const inc = (await coord.get(`/orgs/${org1.id}/requests?view=incoming&city_id=62&event_id=${ev}`)).data.items;
  const r1 = inc.find((r) => r.id === ids['kzo-flood-1']);
  assert.ok(r1);
  assert.equal(r1.team_offers.length, 2);
  assert.ok(r1.team_offers.every((o) => o.volunteer_city_id === 62 && o.category_match === true));
  assert.equal((await coord.get(`/orgs/${org1.id}/requests?view=incoming&city_id=1&event_id=${ev}`)).data.items.length, 0, 'қала сүзгісі');
  const active = (await coord.get(`/orgs/${org1.id}/requests?view=active&status=in_progress`)).data.items;
  assert.deepEqual(active.map((r) => r.id), [ids['kzo-flood-2']]);
  // Қабылдағанға дейін ұйым координаторы жеке деректерді көрмейді
  assert.equal((await coord.get(`/requests/${ids['kzo-flood-1']}`)).data.private, null);
});

test('қабылдау: бір ұйым ғана; басқа ұйым басқара алмайды; тек команда еріктісі тағайындалады; қатар тағайындауда бір орындаушы', async () => {
  const rid = ids['kzo-flood-1'];
  const [a, b] = await Promise.all([coord.post(`/orgs/${org1.id}/requests/${rid}/accept`), coord2.post(`/orgs/${org2.id}/requests/${rid}/accept`)]);
  const ok = [a, b].filter((x) => x.status === 200);
  assert.equal(ok.length, 1, JSON.stringify([a.data, b.data]));
  // Тест анық болуы үшін 1-ұйым жеңбеген болса, қолмен қалпына келтіреміз
  if (a.status !== 200) {
    await pool.query(`UPDATE help_requests SET org_id=$2 WHERE id=$1`, [rid, org1.id]);
  }
  assert.equal((await coord2.post(`/orgs/${org2.id}/requests/${rid}/accept`)).data.code, 'ORG_ALREADY_ACCEPTED');
  const det = (await coord.get(`/requests/${rid}`)).data;
  assert.ok(det.private?.address, 'қабылдағаннан кейін ұйым координаторына мекенжай ашылуы керек');
  assert.equal(det.viewer.is_org_coordinator, true);
  assert.equal((await coord2.get(`/requests/${rid}`)).data.private, null, 'басқа ұйымға мекенжай жабық');
  const apps = det.applications.filter((x) => x.status === 'active');
  assert.equal(apps.length, 2);
  assert.ok(apps.every((x) => x.in_org_team && x.volunteer_city_id === 62));
  // Басқа ұйымның координаторы тағайындай алмайды
  assert.equal((await coord2.post(`/requests/${rid}/assign`, { application_id: apps[0].id })).status, 403);
  // Командадан тыс ерікті ұсыныс жіберсе, ұйым координаторы оны таңдай алмайды
  const outsiderApply = await outsider.post(`/requests/${rid}/applications`, { message: 'Көмектесемін', safety_ack: true });
  assert.equal(outsiderApply.status, 201);
  const outApp = (await coord.get(`/requests/${rid}`)).data.applications.find((x) => x.volunteer_id === outsider.user.id);
  assert.equal(outApp.in_org_team, false);
  assert.equal((await coord.post(`/requests/${rid}/assign`, { application_id: outApp.id })).data.code, 'ASSIGN_TEAM_ONLY');
  // Бір мезетте екі тағайындау
  const [x, y] = await Promise.all(apps.map((ap) => coord.post(`/requests/${rid}/assign`, { application_id: ap.id })));
  assert.deepEqual([x.status, y.status].sort(), [200, 409]);
  const n = (await pool.query('SELECT count(*)::int AS n FROM assignments WHERE request_id=$1 AND is_active', [rid])).rows[0].n;
  assert.equal(n, 1);
  const hist = (await coord.get(`/requests/${rid}`)).data.events;
  const accepted = hist.find((e) => e.type === 'org_accepted');
  assert.equal(accepted.actor_role, 'org_coordinator');
  assert.ok(accepted.actor_name && accepted.created_at);
  assert.equal(hist.find((e) => e.type === 'assigned').actor_role, 'org_coordinator');
});

test('есеп: растаудан кейін жаңарады, қайта растау санды өсірмейді, медиана n-мен; CSV-де жеке дерек жоқ', async () => {
  const before = (await coord.get(`/orgs/${org1.id}/report?event_id=${ev}`)).data;
  assert.equal(before.demo, true);
  assert.equal(before.accepted, 3);
  assert.equal(before.confirmed, 1);
  assert.equal(before.open_need, 0);
  assert.ok(before.median_n >= 2 && before.median_hours > 0);
  const rid = ids['kzo-flood-1'];
  const det = (await coord.get(`/requests/${rid}`)).data;
  const assignee = det.assignee.volunteer_id === vol1.user.id ? vol1 : vol2;
  assert.equal((await assignee.post(`/requests/${rid}/start`)).status, 200);
  assert.equal((await assignee.post(`/requests/${rid}/submit-completion`, { note: 'Су жеткізілді' })).status, 200);
  assert.equal((await recipient.post(`/requests/${rid}/confirm-completion`)).status, 200);
  assert.equal((await recipient.post(`/requests/${rid}/confirm-completion`)).data.already, true);
  const after1 = (await coord.get(`/orgs/${org1.id}/report?event_id=${ev}`)).data;
  assert.equal(after1.confirmed, 2);
  assert.equal(after1.median_n, before.median_n, 'медиана тағайындау бойынша есептеледі, растау оны өзгертпейді');
  assert.equal(before.median_n, 3);
  const needs = (await guest.get(`/events/${ev}/needs`)).data;
  assert.equal(needs.totals.confirmed, 2);
  assert.equal(needs.totals.need_executor, 0);
  // Кезең сүзгісі: болашақ кезеңде дерек жоқ
  const empty = (await coord.get(`/orgs/${org1.id}/report?from=2030-01-01&to=2030-01-31`)).data;
  assert.equal(empty.accepted + empty.confirmed, 0);
  assert.equal(empty.median_hours, null);
  assert.equal((await coord.get(`/orgs/${org1.id}/report?from=2026-05-10&to=2026-05-01`)).status, 400);
  // CSV
  const res = await coord.req('GET', `/orgs/${org1.id}/report.csv?lang=ru&event_id=${ev}&city_id=62`, undefined, true);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  const csv = await res.text();
  assert.match(csv, /Демонстрационные данные/);
  assert.match(csv, /Помощь подтвердил получатель;2;/);
  assert.match(csv, /Кызылорда/);
  for (const bad of ['+7 700', 'Жібек жолы', 'оқу дерегі)', 'Су жеткізілді', '@demo']) assert.ok(!csv.includes(bad), `CSV ішінде жеке дерек: ${bad}`);
  assert.equal((await coord2.req('GET', `/orgs/${org1.id}/report.csv`, undefined, true)).status, 403);
});
