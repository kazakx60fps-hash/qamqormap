// Мобильді қосымшаға арналған API тесттері: Bearer сессиясы, демо-кіру, толық цикл, чаттың оқылу күйі, CORS.
// Бөлек тестілік дерекқорда іске қосылады (TEST_DATABASE_URL), оның public схемасы тазаланады.
import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB || TEST_DB === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL бөлек болуы керек.');
process.env.DATABASE_URL = TEST_DB;
process.env.RATE_LIMIT_SCALE = '50';
process.env.UPLOAD_DIR = 'uploads-test';

const { pool } = await import('../server/db/pool.js');
const { migrate } = await import('../server/db/migrate.js');
const { seed } = await import('../server/db/seed.js');
const { createApp } = await import('../server/app.js');
const { config } = await import('../server/config.js');

let server, base;

/** Мобильді клиент: cookie сақтамайды, тек Authorization: Bearer жібереді */
class Mobile {
  constructor() { this.token = null; }
  async req(method, path, body, { form = null, headers: extra = {} } = {}) {
    const headers = { Accept: 'application/json', 'X-Client': 'mobile', ...extra };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + '/api' + path, { method, headers, body: payload });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (data?.token) this.token = data.token;
    return { status: res.status, data, headers: res.headers };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  put(p, b) { return this.req('PUT', p, b); }
}

let n = 0;
async function mobileUser(name, city_id = 1) {
  const c = new Mobile();
  const r = await c.post('/auth/register', {
    full_name: name, email: `m${++n}_${Date.now()}@test.kz`, password: 'Test12345', password_confirm: 'Test12345', city_id, lang: 'ru',
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.token, 'Мобильді тіркелу токен қайтаруы керек');
  assert.equal(r.headers.get('set-cookie'), null, 'Мобильді сессияға cookie қойылмауы керек');
  c.id = r.data.user.id;
  return c;
}

before(async () => {
  const c = await pool.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  c.release();
  await migrate({ log: () => {} });
  await seed({ log: () => {} });
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await pool.end();
});

test('мобильді кіру: Bearer токені, CSRF талап етілмейді, cookie мен токен араласпайды', async () => {
  const m = new Mobile();
  const r = await m.post('/auth/login', { email: 'aigerim@demo.qamqormap.kz', password: 'Demo12345' });
  assert.equal(r.status, 200);
  assert.match(r.data.token, /^[A-Za-z0-9_-]{40,}$/);
  const me = await m.get('/auth/me');
  assert.equal(me.data.user.email, 'aigerim@demo.qamqormap.kz');
  // Bearer арқылы өзгерту сұрауы CSRF тақырыбынсыз өтеді
  const lang = await m.req('PATCH', '/auth/language', { lang: 'en' });
  assert.equal(lang.status, 200);
  // Базада тек хэш сақталады
  const row = (await pool.query('SELECT id, client FROM sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [me.data.user.id])).rows[0];
  assert.equal(row.client, 'mobile');
  assert.notEqual(row.id, r.data.token);
  // Мобильді токенді cookie ретінде жіберуге болмайды
  const asCookie = await fetch(base + '/api/auth/me', { headers: { Cookie: `qm_session=${r.data.token}` } }).then((x) => x.json());
  assert.equal(asCookie.user, null);
  // Сайттың cookie сессиясы бұрынғыдай CSRF талап етеді
  const web = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'aigerim@demo.qamqormap.kz', password: 'Demo12345' }),
  });
  const cookie = web.headers.get('set-cookie').split(';')[0];
  const webBody = await web.json();
  assert.equal(webBody.token, undefined, 'Сайтқа токен берілмейді');
  const noCsrf = await fetch(base + '/api/auth/language', { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{"lang":"ru"}' });
  assert.equal(noCsrf.status, 403);
  // Cookie токенін Bearer ретінде жіберуге болмайды
  const asBearer = await fetch(base + '/api/auth/me', { headers: { Authorization: `Bearer ${cookie.split('=')[1]}` } }).then((x) => x.json());
  assert.equal(asBearer.user, null);
  // Шығу токенді жояды
  assert.equal((await m.post('/auth/logout')).status, 200);
  assert.equal((await m.get('/auth/me')).data.user, null);
});

test('демо-кіру тек DEMO_LOGIN қосулы кезде және тек демо аккаунттарға', async () => {
  config.demoLogin = false;
  const off = await new Mobile().post('/auth/demo-login', { role: 'author' });
  assert.equal(off.status, 403);
  assert.equal(off.data.code, 'DEMO_DISABLED');
  assert.equal((await new Mobile().get('/auth/demo')).data.enabled, false);
  config.demoLogin = true;
  const list = await new Mobile().get('/auth/demo');
  assert.deepEqual(list.data.accounts.map((a) => a.role), ['author', 'volunteer', 'coordinator', 'org_coordinator', 'org_volunteer', 'recipient']);
  assert.equal(list.data.accounts[0].email, undefined, 'Email жария тізімде көрсетілмейді');
  for (const [role, coord] of [['author', false], ['volunteer', false], ['coordinator', true]]) {
    const m = new Mobile();
    const r = await m.post('/auth/demo-login', { role });
    assert.equal(r.status, 200, role);
    assert.equal(r.data.user.is_coordinator, coord);
    if (role === 'volunteer') assert.equal(r.data.user.is_volunteer, true);
    assert.ok(m.token);
  }
  assert.equal((await new Mobile().post('/auth/demo-login', { role: 'admin' })).status, 400);
  config.demoLogin = false;
});

test('толық цикл мобильді токендермен: қайтару → түзету → жариялау → бір орындаушы → растау → статистика бір рет', async () => {
  config.demoLogin = true;
  const author = await mobileUser('Мобиль Автор');
  const coord = new Mobile();
  await coord.post('/auth/demo-login', { role: 'coordinator' });
  const v1 = await mobileUser('Мобиль Ерікті Бір');
  const v2 = await mobileUser('Мобиль Ерікті Екі');
  const stranger = await mobileUser('Мобиль Бөгде');
  for (const v of [v1, v2]) {
    const cats = (await v.get('/categories')).data.items.map((c) => c.id);
    const s = await v.put('/me/volunteer', { city_id: 56, category_ids: cats, radius_km: 30, is_active: true, disaster_support: true });
    assert.equal(s.status, 200, JSON.stringify(s.data));
  }
  const flood = (await author.get('/events?city_id=56')).data.items.find((e) => e.type_code === 'flood');
  assert.ok(flood, 'Қостанайдағы су тасқыны (оқу мысалы) табылуы керек');
  const water = (await author.get('/categories')).data.items.find((c) => c.code === 'water_food');
  const body = {
    city_id: 56, category_id: water.id, title: 'Мобильден: ауыз су жеткізу', description: 'Уақытша тұрған отбасыға 20 литр ауыз су жеткізу керек, кіреберісте күтеміз.',
    district: 'Орталық', public_place: 'Мектеп маңы', lat: 53.214, lng: 63.632, urgency: 'high', address: 'Тест көшесі 5, 12-пәтер',
    contact_phone: '87015556677', disaster_event_id: flood.id, content_lang: 'ru',
  };
  const created = await author.post('/requests', body);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.id;
  assert.equal(created.data.moderation_status, 'pending');

  // Координатор себебімен түзетуге қайтарады
  assert.equal((await coord.post(`/requests/${id}/review`, { decision: 'reject', reason: 'Уақытын нақтылаңыз' })).status, 200);
  const rej = await author.get(`/requests/${id}`);
  assert.equal(rej.data.request.moderation_status, 'rejected');
  assert.equal(rej.data.request.rejection_reason, 'Уақытын нақтылаңыз');
  // Автор түзетіп, қайта жібереді
  const upd = await author.put(`/requests/${id}`, { ...body, needed_note: 'Бүгін 18:00-ден кейін', submit: true });
  assert.equal(upd.status, 200, JSON.stringify(upd.data));
  assert.equal((await author.get(`/requests/${id}`)).data.request.moderation_status, 'pending');
  const queue = await coord.get('/coordinator/queue');
  assert.ok(queue.data.items.some((q) => q.id === id));
  assert.equal((await coord.post(`/requests/${id}/review`, { decision: 'approve' })).status, 200);

  // Жария бетте жеке деректер жоқ
  const pub = await stranger.get(`/requests/${id}`);
  assert.equal(pub.data.private, null);
  assert.equal(pub.data.viewer.can_chat, false);
  assert.equal((await stranger.get(`/requests/${id}/messages`)).status, 403);
  const list = await stranger.get(`/requests?event_id=${flood.id}`);
  assert.ok(list.data.items.some((x) => x.id === id), 'Өтініш оқиғаға байланыстырылған тізімде болуы керек');
  assert.ok(!JSON.stringify(list.data).includes('Тест көшесі 5'), 'Тізімде нақты мекенжай болмауы керек');

  // Апат өтінішіне қауіпсіздік растауынсыз ұсыныс жіберілмейді
  assert.equal((await v1.post(`/requests/${id}/applications`, { message: 'Көмектесемін' })).data.code, 'SAFETY_ACK_REQUIRED');
  assert.equal((await v1.post(`/requests/${id}/applications`, { message: 'Көмектесемін', safety_ack: true })).status, 201);
  assert.equal((await v2.post(`/requests/${id}/applications`, { message: 'Мен де', safety_ack: true })).status, 201);
  const apps = (await author.get(`/requests/${id}`)).data.applications;
  assert.equal(apps.length, 2);

  // Бір мезетте екі орындаушыны таңдау: тек біреуі өтеді
  const [a, b] = await Promise.all(apps.map((ap) => author.post(`/requests/${id}/assign`, { application_id: ap.id })));
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409], JSON.stringify([a.data, b.data]));
  const active = (await pool.query('SELECT count(*)::int AS n FROM assignments WHERE request_id=$1 AND is_active', [id])).rows[0].n;
  assert.equal(active, 1);
  const chosen = a.status === 200 ? apps[0] : apps[1];
  const assignee = chosen.volunteer_id === v1.id ? v1 : v2;
  const other = assignee === v1 ? v2 : v1;

  // Орындаушы мекенжайды көреді, екіншісі көрмейді
  assert.equal((await assignee.get(`/requests/${id}`)).data.private.address, 'Тест көшесі 5, 12-пәтер');
  assert.equal((await other.get(`/requests/${id}`)).data.private, null);

  // Чат және оқылу күйі
  const msg = await assignee.post(`/requests/${id}/messages`, { body: 'Сәлеметсіз бе, 18:30-да барамын' });
  assert.equal(msg.status, 201);
  let chats = await author.get('/me/chats');
  const chat = chats.data.items.find((c) => c.id === id);
  assert.equal(chat.unread, 1);
  assert.equal((await author.get('/me/summary')).data.unread_chats, 1);
  const before = await assignee.get(`/requests/${id}/messages`);
  assert.ok(before.data.others_read_id < msg.data.id);
  assert.equal((await author.post(`/requests/${id}/messages/read`, { last_id: msg.data.id })).status, 200);
  chats = await author.get('/me/chats');
  assert.equal(chats.data.items.find((c) => c.id === id).unread, 0);
  assert.equal((await author.get('/me/summary')).data.unread_chats, 0);
  const afterRead = await assignee.get(`/requests/${id}/messages`);
  assert.equal(afterRead.data.others_read_id, Number(msg.data.id));
  assert.equal((await stranger.post(`/requests/${id}/messages/read`, {})).status, 403);

  // Орындау → растау → статистика бір рет
  const statsBefore = (await stranger.get('/stats?city_id=56')).data.completed;
  assert.equal((await assignee.post(`/requests/${id}/start`)).status, 200);
  assert.equal((await assignee.post(`/requests/${id}/submit-completion`, { note: 'Су жеткізілді' })).status, 200);
  assert.equal((await stranger.post(`/requests/${id}/confirm-completion`)).status, 403);
  assert.equal((await author.post(`/requests/${id}/confirm-completion`)).status, 200);
  const again = await author.post(`/requests/${id}/confirm-completion`);
  assert.equal(again.data.already, true, 'Қайта растау статистиканы өзгертпейді');
  const statsAfter = (await stranger.get('/stats?city_id=56')).data.completed;
  assert.equal(statsAfter, statsBefore + 1);

  // Хабарламалар алушыға params-пен жетеді
  const notes = (await author.get('/me/notifications')).data.items.map((x) => x.type);
  for (const t of ['rejected', 'approved', 'application', 'completion_submitted']) {
    assert.ok(notes.includes(t), `${t} хабарламасы болуы керек: ${notes}`);
  }
  config.demoLogin = false;
});

test('мобильден фото жүктеу: тек автор, жеке фото бөгдеге жабық', async () => {
  const author = await mobileUser('Фото Автор');
  const other = await mobileUser('Фото Бөгде');
  const created = await author.post('/requests', {
    city_id: 1, category_id: 1, title: 'Фото тесті', description: 'Мобильден фото жүктеуді тексеруге арналған өтініш мәтіні.',
    lat: 51.128, lng: 71.43, address: 'Тест көшесі, 1', contact_phone: '87011234567', urgency: 'low',
  });
  const id = created.data.id;
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#2457F5' } }).png().toBuffer();
  const form = new FormData();
  form.append('photo', new Blob([png], { type: 'image/png' }), 'photo.png');
  const up = await author.req('POST', `/requests/${id}/attachments`, undefined, { form });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  const form2 = new FormData();
  form2.append('photo', new Blob([png], { type: 'image/png' }), 'x.png');
  assert.equal((await other.req('POST', `/requests/${id}/attachments`, undefined, { form: form2 })).status, 403);
  const res = await fetch(`${base}/api/attachments/${up.data.id}`, { headers: { Authorization: `Bearer ${other.token}` } });
  assert.equal(res.status, 404, 'Жарияланбаған өтініштің фотосы бөгдеге көрінбейді');
  const own = await fetch(`${base}/api/attachments/${up.data.id}`, { headers: { Authorization: `Bearer ${author.token}` } });
  assert.equal(own.status, 200);
});

test('CORS тек рұқсат етілген көздерге', async () => {
  const pre = await fetch(`${base}/api/requests`, { method: 'OPTIONS', headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
  const evil = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: '{"email":"a@b.cd","password":"x"}',
  });
  assert.equal(evil.status, 403);
  config.corsOrigins.push('http://localhost:8081');
  const ok = await fetch(`${base}/api/requests`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:8081');
  assert.match(ok.headers.get('access-control-allow-headers'), /Authorization/);
  config.corsOrigins.length = 0;
});
