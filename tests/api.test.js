// QamqorMap API тесттері. Бөлек тестілік дерекқорда іске қосылады (TEST_DATABASE_URL).
// НАЗАР АУДАРЫҢЫЗ: тестілік дерекқордың public схемасы әр іске қосуда тазаланады.
import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB || TEST_DB === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL бөлек дерекқорды көрсетуі керек (негізгі базамен бірдей болмауы тиіс).');
}
process.env.DATABASE_URL = TEST_DB;
process.env.RATE_LIMIT_SCALE = '50';
process.env.UPLOAD_DIR = 'uploads-test';

const { pool } = await import('../server/db/pool.js');
const { migrate } = await import('../server/db/migrate.js');
const { createApp } = await import('../server/app.js');

let server, base;

class Client {
  constructor() { this.cookie = ''; this.csrf = null; }
  async req(method, path, body, { raw = false, form = null, noCsrf = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (this.cookie) headers.Cookie = this.cookie;
    if (this.csrf && method !== 'GET' && !noCsrf) headers['X-CSRF-Token'] = this.csrf;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + '/api' + path, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    if (raw) return res;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (data?.csrfToken) this.csrf = data.csrfToken;
    return { status: res.status, data };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  put(p, b) { return this.req('PUT', p, b); }
  del(p) { return this.req('DELETE', p); }
}

let n = 0;
async function user(name, { city_id = 1, coordinator = false } = {}) {
  const c = new Client();
  const email = `u${++n}_${Date.now()}@test.kz`;
  const r = await c.post('/auth/register', { full_name: name, email, password: 'Test12345', password_confirm: 'Test12345', city_id, is_coordinator: true });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.user.is_coordinator, false, 'Тіркелу кезінде координатор құқығы берілмеуі керек');
  c.id = r.data.user.id;
  c.email = email;
  if (coordinator) {
    await pool.query('UPDATE users SET is_coordinator=true WHERE id=$1', [c.id]);
  }
  return c;
}

const sample = (over = {}) => ({
  city_id: 1, category_id: 1, title: 'Тестілік өтініш: азық-түлік', description: 'Қарт адамға азық-түлік жеткізу керек, тізімді өзі береді.',
  district: 'Есіл ауданы', public_place: 'Мәңгілік Ел маңы', lat: 51.128, lng: 71.430, urgency: 'normal',
  address: 'Тест көшесі, 1-үй, 2-пәтер', contact_phone: '87011234567', needed_note: '', ...over,
});

let author, coord, vol1, vol2, stranger;

before(async () => {
  const c = await pool.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  c.release();
  await migrate({ log: () => {} });
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  author = await user('Өтініш Иесі');
  coord = await user('Координатор Тест', { coordinator: true });
  vol1 = await user('Ерікті Бір');
  vol2 = await user('Ерікті Екі');
  stranger = await user('Бөгде Адам');
  for (const v of [vol1, vol2]) {
    const r = await v.put('/me/volunteer', { city_id: 1, radius_km: 10, category_ids: [1], available_days: [1, 2, 3, 4, 5, 6, 7], time_from: '08:00', time_to: '22:00', base_lat: 51.13, base_lng: 71.43 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
});

after(async () => {
  server?.close();
  await pool.end();
});

async function approved(over) {
  const r = await author.post('/requests', sample(over));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const a = await coord.post(`/requests/${r.data.id}/review`, { decision: 'approve' });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  return r.data.id;
}

test('валидация: қате өрістер серверде қазақша хабармен қабылданбайды', async () => {
  const r = await author.post('/requests', sample({ title: 'аз', lat: null, contact_phone: '123' }));
  assert.equal(r.status, 400);
  assert.equal(r.data.code, 'VALIDATION');
  assert.equal(r.data.field_codes.title.code, 'MIN_LENGTH');
  assert.equal(r.data.field_codes.title.params.min, 5);
  assert.ok(r.data.fields.title.includes('таңба'), 'қазақша қосалқы мәтін де бар');
  assert.ok(r.data.fields.lat);
  assert.ok(r.data.fields.contact_phone);
});

test('CSRF белгісіз өзгерту сұрауы қабылданбайды', async () => {
  const r = await author.req('POST', '/requests', sample(), { noCsrf: true });
  assert.equal(r.status, 403);
});

test('кірмеген қолданушы өтініш жасай алмайды', async () => {
  const r = await new Client().post('/requests', sample());
  assert.equal(r.status, 401);
});

test('өтініш PostgreSQL-де сақталады және бекітілмеген өтініш жария тізімде жоқ', async () => {
  const r = await author.post('/requests', sample({ title: 'Жарияланбаған тест өтініші' }));
  assert.equal(r.status, 201);
  assert.equal(r.data.moderation_status, 'pending');
  const pub = await new Client().get('/requests?city_id=1&status=all&limit=200');
  assert.ok(!pub.data.items.some((x) => x.id === r.data.id));
  assert.equal((await stranger.get(`/requests/${r.data.id}`)).status, 404);
  assert.equal((await author.get(`/requests/${r.data.id}`)).status, 200);

  // «Қайта іске қосу»: жаңа, тәуелсіз қосылыммен дерекқордан оқу
  const client = new pg.Client({ connectionString: TEST_DB });
  await client.connect();
  const row = (await client.query('SELECT title, moderation_status FROM help_requests WHERE id=$1', [r.data.id])).rows[0];
  await client.end();
  assert.equal(row.title, 'Жарияланбаған тест өтініші');
});

test('жоба (draft) координаторға да көрінбейді', async () => {
  const r = await author.post('/requests', sample({ submit: false }));
  assert.equal(r.data.moderation_status, 'draft');
  assert.equal((await coord.get(`/requests/${r.data.id}`)).status, 404);
});

test('жария API нақты мекенжайды, телефонды және нақты координатты қайтармайды', async () => {
  const id = await approved();
  const pub = await new Client().get('/requests?city_id=1&limit=200');
  const item = pub.data.items.find((x) => x.id === id);
  assert.ok(item);
  const json = JSON.stringify(pub.data);
  assert.ok(!json.includes('Тест көшесі'));
  assert.ok(!json.includes('701 123'));
  for (const k of ['address', 'contact_phone', 'exact_lat', 'exact_lng']) assert.ok(!(k in item));
  const { haversineKm } = await import('../server/services/textsim.js');
  const shift = haversineKm(51.128, 71.430, item.approx_lat, item.approx_lng);
  assert.ok(shift >= 0.2 && shift <= 0.5, `жария нүкте нақты нүктеден ығысқан: ${shift}`);
  const d = await stranger.get(`/requests/${id}`);
  assert.equal(d.data.private, null);
  assert.ok(!JSON.stringify(d.data).includes('Тест көшесі'));
  const own = await author.get(`/requests/${id}`);
  assert.equal(own.data.private.address, 'Тест көшесі, 1-үй, 2-пәтер');
});

test('қалалар бойынша деректер мен статистика оқшауланған', async () => {
  const id2 = await approved({ city_id: 2, lat: 43.24, lng: 76.89, title: 'Алматыдағы тест өтініші' });
  const astana = await new Client().get('/requests?city_id=1&limit=200');
  const almaty = await new Client().get('/requests?city_id=2&limit=200');
  assert.ok(!astana.data.items.some((x) => x.id === id2));
  assert.ok(almaty.data.items.every((x) => x.city_id === 2));
  assert.ok(almaty.data.items.some((x) => x.id === id2));
  const s1 = await new Client().get('/stats?city_id=1');
  const s2 = await new Client().get('/stats?city_id=2');
  assert.equal(s2.data.active, 1);
  assert.ok(s1.data.active >= 1);
  // Нүкте қаладан тым алыс болса — қате
  const far = await author.post('/requests', sample({ city_id: 1, lat: 43.24, lng: 76.89 }));
  assert.equal(far.status, 400);
});

test('толық жұмыс тәртібі: ұсыныс → қатар тағайындау → чат → орындау → бір рет растау', async () => {
  const id = await approved();
  const a1 = await vol1.post(`/requests/${id}/applications`, { message: 'Көмектесемін' });
  const a2 = await vol2.post(`/requests/${id}/applications`, { message: 'Мен де' });
  assert.equal(a1.status, 201);
  assert.equal(a2.status, 201);
  assert.equal((await vol1.post(`/requests/${id}/applications`, {})).status, 409, 'қайталанған ұсыныс');
  assert.equal((await author.post(`/requests/${id}/applications`, {})).status, 403, 'өз өтінішіне ұсыныс');

  // Ұсыныс жіберген ерікті мекенжайды әлі көрмейді
  assert.equal((await vol1.get(`/requests/${id}`)).data.private, null);

  // Бір мезетте екі тағайындау: біреуі ғана сәтті
  const [r1, r2] = await Promise.all([
    author.post(`/requests/${id}/assign`, { application_id: a1.data.id }),
    coord.post(`/requests/${id}/assign`, { application_id: a2.data.id }),
  ]);
  const codes = [r1.status, r2.status].sort();
  assert.deepEqual(codes, [200, 409], JSON.stringify([r1.data, r2.data]));
  const active = (await pool.query('SELECT volunteer_id FROM assignments WHERE request_id=$1 AND is_active', [id])).rows;
  assert.equal(active.length, 1);
  const chosen = active[0].volunteer_id === vol1.id ? vol1 : vol2;
  const other = chosen === vol1 ? vol2 : vol1;

  // Жеке деректер мен чат қолжетімділігі
  assert.equal((await chosen.get(`/requests/${id}`)).data.private.contact_phone, '+7 701 123 45 67');
  assert.equal((await other.get(`/requests/${id}`)).data.private, null);
  assert.equal((await other.get(`/requests/${id}/messages`)).status, 403);
  assert.equal((await stranger.post(`/requests/${id}/messages`, { body: 'сәлем' })).status, 403);
  assert.equal((await chosen.post(`/requests/${id}/messages`, { body: 'Сағат 18:00-де барамын' })).status, 201);
  const msgs = await author.get(`/requests/${id}/messages`);
  assert.equal(msgs.data.items.length, 1);

  // Рұқсат етілмеген ауысулар
  assert.equal((await chosen.post(`/requests/${id}/submit-completion`)).status, 409, 'бастамай аяқтау');
  assert.equal((await other.post(`/requests/${id}/start`)).status, 403, 'бөгде ерікті бастай алмайды');
  assert.equal((await author.post(`/requests/${id}/confirm-completion`)).status, 409, 'ерте растау');

  assert.equal((await chosen.post(`/requests/${id}/start`)).status, 200);
  assert.equal((await chosen.post(`/requests/${id}/submit-completion`, { note: 'Жеткізілді' })).status, 200);
  const st = (await author.get(`/requests/${id}`)).data.request.status;
  assert.equal(st, 'awaiting_confirmation', 'ерікті аяқтаса да растау күтіледі');

  const before = (await new Client().get('/stats?city_id=1')).data.completed;
  const [c1, c2] = await Promise.all([
    author.post(`/requests/${id}/confirm-completion`),
    author.post(`/requests/${id}/confirm-completion`),
  ]);
  assert.equal(c1.status, 200);
  assert.equal(c2.status, 200);
  assert.equal((await author.post(`/requests/${id}/confirm-completion`)).data.already, true);
  const afterStats = (await new Client().get('/stats?city_id=1')).data.completed;
  assert.equal(afterStats, before + 1, 'растау статистикаға бір рет қосылады');
  const ev = (await pool.query(`SELECT count(*)::int AS n FROM request_events WHERE request_id=$1 AND event_type='completed'`, [id])).rows[0].n;
  assert.equal(ev, 1);
});

test('түзетуге қайтару, қайта жіберу, ұсынысты кері қайтару және тоқтату', async () => {
  const r = await author.post('/requests', sample());
  const id = r.data.id;
  assert.equal((await author.post(`/requests/${id}/review`, { decision: 'approve' })).status, 403, 'автор өзі бекіте алмайды');
  assert.equal((await coord.post(`/requests/${id}/review`, { decision: 'reject', reason: '' })).status, 400);
  assert.equal((await coord.post(`/requests/${id}/review`, { decision: 'reject', reason: 'Уақытты нақтылаңыз' })).status, 200);
  assert.equal((await author.put(`/requests/${id}`, { ...sample({ needed_note: 'Сенбі күні' }), submit: true })).status, 200);
  assert.equal((await author.get(`/requests/${id}`)).data.request.moderation_status, 'pending');
  await coord.post(`/requests/${id}/review`, { decision: 'approve' });
  assert.equal((await vol1.post(`/requests/${id}/applications`, {})).status, 201);
  assert.equal((await vol1.del(`/requests/${id}/applications/mine`)).status, 200);
  assert.equal((await vol1.post(`/requests/${id}/applications`, {})).status, 201, 'кері қайтарғаннан кейін қайта жіберуге болады');
  assert.equal((await stranger.post(`/requests/${id}/cancel`, { reason: 'Бөгде адам' })).status, 403);
  assert.equal((await author.post(`/requests/${id}/cancel`, { reason: 'Көмек енді қажет емес' })).status, 200);
  assert.equal((await author.post(`/requests/${id}/cancel`, { reason: 'Тағы бір рет' })).status, 409);
});

test('координатор орындаушыны ауыстырады, тарих сақталады', async () => {
  const id = await approved();
  const a1 = await vol1.post(`/requests/${id}/applications`, {});
  const a2 = await vol2.post(`/requests/${id}/applications`, {});
  await author.post(`/requests/${id}/assign`, { application_id: a1.data.id });
  assert.equal((await author.post(`/requests/${id}/assign`, { application_id: a2.data.id, reason: 'Ауыстыру керек', replace: true })).status, 403);
  assert.equal((await coord.post(`/requests/${id}/assign`, { application_id: a2.data.id })).status, 409, 'replace белгісіз ауыстыру жоқ');
  const r = await coord.post(`/requests/${id}/assign`, { application_id: a2.data.id, reason: 'Бірінші ерікті ауырып қалды', replace: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const rows = (await pool.query('SELECT volunteer_id, is_active, end_reason FROM assignments WHERE request_id=$1 ORDER BY id', [id])).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].is_active, false);
  assert.equal(rows[0].end_reason, 'Бірінші ерікті ауырып қалды');
  assert.equal(rows[1].volunteer_id, vol2.id);
  assert.equal((await vol1.get(`/requests/${id}`)).data.private, null, 'босатылған ерікті мекенжайды көрмейді');
});

test('ұсынылатын еріктілер мен қайталану белгілері түсіндірмемен беріледі', async () => {
  const id = await approved({ title: 'Әжеге сүт пен нан жеткізу керек', needed_from: '2030-01-07T15:00:00+05:00' });
  const d = await author.get(`/requests/${id}`);
  assert.ok(d.data.recommendations.length >= 1);
  assert.ok(d.data.recommendations[0].reasons.some((x) => x.code === 'CITY' && x.params.city_id === 1));
  const dup = await author.post('/requests', sample({ title: 'Әжеге сүт пен нан жеткізу керек', lat: 51.1285, lng: 71.4305 }));
  const cd = await coord.get(`/requests/${dup.data.id}`);
  assert.ok(cd.data.duplicates.some((x) => x.id === id), JSON.stringify(cd.data.duplicates));
  assert.equal(d.data.duplicates, null, 'автор қайталау талдауын көрмейді');
});

test('сурет: формат тексеріледі, жеке сурет бөгде адамға берілмейді', async () => {
  const id = await approved();
  const bad = new FormData();
  bad.append('photo', new Blob(['not an image'], { type: 'text/plain' }), 'a.txt');
  assert.equal((await author.req('POST', `/requests/${id}/attachments`, undefined, { form: bad })).status, 400);
  const fake = new FormData();
  fake.append('photo', new Blob(['not really png'], { type: 'image/png' }), 'a.png');
  assert.equal((await author.req('POST', `/requests/${id}/attachments`, undefined, { form: fake })).status, 400);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const ok = new FormData();
  ok.append('photo', new Blob([png], { type: 'image/png' }), '../../evil name.png');
  const up = await author.req('POST', `/requests/${id}/attachments`, undefined, { form: ok });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  assert.equal(up.data.visibility, 'participants');
  assert.ok(!up.data.original_name.includes('/'));
  assert.equal((await stranger.req('GET', `/attachments/${up.data.id}`, undefined, { raw: true })).status, 403);
  assert.equal((await author.req('GET', `/attachments/${up.data.id}`, undefined, { raw: true })).status, 200);
  assert.equal((await stranger.req('POST', `/requests/${id}/attachments`, undefined, { form: ok })).status, 403);
});

test('координатор бөлімі қарапайым қолданушыға жабық', async () => {
  assert.equal((await stranger.get('/coordinator/queue')).status, 403);
  assert.equal((await coord.get('/coordinator/queue?city_id=1')).status, 200);
});

test('анықтамалық: барлық қалалар мен іздеу варианттары бар', async () => {
  const c = await new Client().get('/cities');
  assert.ok(c.data.items.length >= 89);
  const osk = c.data.items.find((x) => x.name_kk === 'Өскемен');
  assert.ok(osk.search_text.includes('усть-каменогорск') && osk.search_text.includes('oskemen'));
});

// ─────────────────── Тіл және тұрақты кодтар ───────────────────

test('тіл баптауы PostgreSQL-де сақталады, қате тіл қабылданбайды', async () => {
  const u = await user('Тіл Тексеруші');
  assert.equal((await u.get('/auth/me')).data.user.preferred_lang, null);
  const bad = await u.req('PATCH', '/auth/language', { lang: 'de' });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.field_codes.lang.code, 'LANG_INVALID');
  assert.equal((await u.req('PATCH', '/auth/language', { lang: 'en' })).status, 200);
  assert.equal((await u.get('/auth/me')).data.user.preferred_lang, 'en');
  const row = (await pool.query('SELECT preferred_lang FROM users WHERE id=$1', [u.id])).rows[0];
  assert.equal(row.preferred_lang, 'en');
  // Кірмеген қолданушы тілді базаға сақтай алмайды (тек браузер баптауы)
  assert.equal((await new Client().req('PATCH', '/auth/language', { lang: 'ru' })).status, 401);
});

test('backend тұрақты қате кодтарын және хабарлама параметрлерін қайтарады', async () => {
  const nf = await stranger.get('/requests/999999');
  assert.equal(nf.status, 404);
  assert.equal(nf.data.code, 'REQUEST_NOT_FOUND');
  const id = await approved();
  await vol1.post(`/requests/${id}/applications`, { message: 'Көмектесемін' });
  const notes = await author.get('/me/notifications');
  const n = notes.data.items.find((x) => x.type === 'application' && x.request_id === id);
  assert.ok(n, 'хабарлама жазылды');
  assert.equal(n.params.name, 'Ерікті Бір');
  assert.ok(n.params.title, 'қолданушы мәтіні өзгеріссіз параметрде');
  const conflictRes = await vol1.post(`/requests/${id}/applications`, {});
  assert.equal(conflictRes.data.code, 'ALREADY_APPLIED');
});

// ─────────────────── Табиғи апаттар ───────────────────

let floodId;
const flood = (over = {}) => ({
  type: 'flood', title: 'Тест: өзен бойындағы су тасқыны', description: 'Тестілік оқиға сипаттамасы, нақты емес.',
  started_at: new Date(Date.now() - 3600e3).toISOString(), city_ids: [1, 18], region_codes: ['akm'],
  lat: 51.2, lng: 71.5, radius_km: 12, location_note: 'Өзен бойы', source_name: 'Тест', source_url: 'https://example.kz/news',
  ...over,
});

test('оқиғаны тек координатор жасайды; бірнеше қала, облыс және нүкте сақталады', async () => {
  assert.equal((await author.post('/events', flood())).status, 403);
  assert.equal((await new Client().post('/events', flood())).status, 401);
  const bad = await coord.post('/events', flood({ city_ids: [], region_codes: [], lat: null, lng: null, radius_km: null }));
  assert.equal(bad.status, 400);
  assert.equal(bad.data.field_codes.areas.code, 'AREA_REQUIRED');
  assert.equal((await coord.post('/events', flood({ source_url: 'javascript:alert(1)' }))).data.field_codes.source_url.code, 'INVALID_URL');
  const r = await coord.post('/events', flood());
  assert.equal(r.status, 201, JSON.stringify(r.data));
  floodId = r.data.id;
  const d = await coord.get(`/events/${floodId}`);
  assert.equal(d.data.event.verification_status, 'unverified');
  assert.deepEqual(d.data.event.areas.map((a) => a.city_id || a.region_code).sort(), [1, 18, 'akm'].sort());
  assert.equal(d.data.history[0].action, 'created');
  // Жария бетте тарих жоқ
  assert.equal((await stranger.get(`/events/${floodId}`)).data.history, null);
});

test('оқиға жаңартылады: өзгерістер мен тексеру авторы тарихта сақталады', async () => {
  const u = await coord.put(`/events/${floodId}`, flood({ title: 'Тест: су тасқыны (жаңартылды)', city_ids: [1], verification_status: 'verified' }));
  assert.equal(u.status, 200, JSON.stringify(u.data));
  assert.ok(u.data.changed.includes('title') && u.data.changed.includes('city_ids'));
  const row = (await pool.query('SELECT verification_status, verified_by FROM disaster_events WHERE id=$1', [floodId])).rows[0];
  assert.equal(row.verification_status, 'verified');
  assert.equal(row.verified_by, coord.id);
  const h = (await coord.get(`/events/${floodId}`)).data.history.map((x) => x.action);
  assert.deepEqual(h, ['created', 'updated', 'verified']);
  assert.equal((await author.post(`/events/${floodId}/verification`, { status: 'unverified' })).status, 403);
});

test('бірнеше өтініш бір оқиғаға байланыстырылады; санат пен оқиға күйі тексеріледі', async () => {
  const cats = Object.fromEntries((await pool.query('SELECT code, id FROM help_categories')).rows.map((x) => [x.code, x.id]));
  const everyday = await author.post('/requests', sample({ disaster_event_id: floodId }));
  assert.equal(everyday.status, 400);
  assert.equal(everyday.data.field_codes.category_id.code, 'EVENT_CATEGORY');
  const ids = [];
  for (const cat of ['evacuation', 'shelter', 'water_food']) {
    const r = await author.post('/requests', sample({ category_id: cats[cat], disaster_event_id: floodId, title: `Апат өтініші: ${cat}` }));
    assert.equal(r.status, 201, JSON.stringify(r.data));
    await coord.post(`/requests/${r.data.id}/review`, { decision: 'approve' });
    ids.push(r.data.id);
  }
  const ev = await stranger.get(`/events/${floodId}`);
  assert.deepEqual(ev.data.requests.map((x) => x.id).sort(), ids.sort());
  assert.ok(!JSON.stringify(ev.data).includes('Тест көшесі'), 'байланысты өтініштерде мекенжай жоқ');
  const pub = await new Client().get(`/requests?event_id=${floodId}&direction=disaster`);
  assert.equal(pub.data.total, 3);
  assert.ok(pub.data.items.every((x) => x.disaster_type_code === 'flood'));
  const everydayList = await new Client().get('/requests?direction=everyday&limit=200');
  assert.ok(everydayList.data.items.every((x) => x.direction === 'everyday'));
  // Координатор бар өтінішті байланыстырады / ажыратады
  const extra = await author.post('/requests', sample({ category_id: cats.essentials, title: 'Апатқа кейін байланысатын өтініш' }));
  await coord.post(`/requests/${extra.data.id}/review`, { decision: 'approve' });
  assert.equal((await author.post(`/requests/${extra.data.id}/event`, { event_id: floodId })).status, 403);
  assert.equal((await coord.post(`/requests/${extra.data.id}/event`, { event_id: floodId })).status, 200);
  assert.equal((await stranger.get(`/events/${floodId}`)).data.requests.length, 4);
  // Аяқталған оқиғаға жаңа өтініш байланыспайды
  assert.equal((await coord.post(`/events/${floodId}/activity`, { status: 'resolved' })).status, 200);
  const late = await author.post('/requests', sample({ category_id: cats.shelter, disaster_event_id: floodId }));
  assert.equal(late.data.field_codes.disaster_event_id.code, 'EVENT_RESOLVED');
  await coord.post(`/events/${floodId}/activity`, { status: 'active' });
});

test('апатқа қатысты өтінішке ұсыныс тек қауіпсіздік растауымен; ұсыныстар тек келіскен еріктілерге', async () => {
  const cats = Object.fromEntries((await pool.query('SELECT code, id FROM help_categories')).rows.map((x) => [x.code, x.id]));
  const r = await author.post('/requests', sample({ category_id: cats.water_food, disaster_event_id: floodId, title: 'Ауыз су жеткізу (тест)' }));
  await coord.post(`/requests/${r.data.id}/review`, { decision: 'approve' });
  const noAck = await vol1.post(`/requests/${r.data.id}/applications`, { message: 'Көмектесемін' });
  assert.equal(noAck.status, 400);
  assert.equal(noAck.data.code, 'SAFETY_ACK_REQUIRED');
  assert.equal((await vol1.post(`/requests/${r.data.id}/applications`, { message: 'Көмектесемін', safety_ack: true })).status, 201);
  // Ұсынылатын еріктілер: санат бар, бірақ disaster_support жоқ → ұсынылмайды
  await vol2.put('/me/volunteer', { city_id: 1, radius_km: 10, category_ids: [cats.water_food], base_lat: 51.13, base_lng: 71.43 });
  let rec = (await author.get(`/requests/${r.data.id}`)).data.recommendations;
  assert.ok(!rec.some((x) => x.user_id === vol2.id));
  await vol2.put('/me/volunteer', { city_id: 1, radius_km: 10, category_ids: [cats.water_food], base_lat: 51.13, base_lng: 71.43, disaster_support: true });
  rec = (await author.get(`/requests/${r.data.id}`)).data.recommendations;
  const v2 = rec.find((x) => x.user_id === vol2.id);
  assert.ok(v2 && v2.reasons.some((x) => x.code === 'DISASTER_READY'));
});

test('оқиғалар сүзгісі: қала (облыс арқылы да), түр, өзектілік, тексеру', async () => {
  const fire = await coord.post('/events', flood({ type: 'wildfire', title: 'Тест: дала өрті', city_ids: [], region_codes: ['abai'], lat: 49.2, lng: 79.7, radius_km: 5 }));
  const list = async (q) => (await new Client().get(`/events?${q}`)).data.items.map((x) => x.id);
  assert.ok((await list('city_id=4')).includes(fire.data.id), 'Семей — Абай облысында');
  assert.ok(!(await list('city_id=4')).includes(floodId));
  assert.ok((await list('city_id=18')).includes(floodId), 'Қосшы — Ақмола облысында');
  assert.ok((await list('type=wildfire')).every((id) => id !== floodId));
  assert.ok((await list('verification=unverified')).includes(fire.data.id));
  assert.ok(!(await list('verification=unverified')).includes(floodId));
  await coord.post(`/events/${fire.data.id}/activity`, { status: 'resolved' });
  assert.ok(!(await list('activity=active')).includes(fire.data.id));
  assert.ok((await list('activity=resolved')).includes(fire.data.id));
});

test('қолданушы хабары жария емес; координатор оны оқиғаға байланыстырады', async () => {
  const bad = await author.post('/disaster-reports', { type: 'mudflow', description: 'қысқа' });
  assert.equal(bad.status, 400);
  const rep = await author.post('/disaster-reports', { type: 'mudflow', city_id: 2, description: 'Тау бөктерінде сел жүрді деген хабар естідім, тексеріңіздер.' });
  assert.equal(rep.status, 201, JSON.stringify(rep.data));
  assert.equal((await author.get('/coordinator/disaster-reports')).status, 403);
  assert.ok(!(await new Client().get('/events?limit=200')).data.items.some((x) => x.title.includes('сел жүрді')));
  const mine = await author.get('/me/disaster-reports');
  assert.equal(mine.data.items[0].status, 'pending');
  const ev = await coord.post('/events', flood({ type: 'mudflow', title: 'Тест: сел (хабар бойынша)', city_ids: [2], region_codes: [], lat: null, lng: null, radius_km: null, report_id: rep.data.id }));
  assert.equal(ev.status, 201, JSON.stringify(ev.data));
  const after = (await author.get('/me/disaster-reports')).data.items.find((x) => x.id === rep.data.id);
  assert.equal(after.status, 'linked');
  assert.equal(after.event_id, ev.data.id);
  assert.equal((await coord.post(`/coordinator/disaster-reports/${rep.data.id}/dismiss`, { note: 'Қайталау' })).data.code, 'REPORT_HANDLED');
  const n = (await author.get('/me/notifications')).data.items.find((x) => x.type === 'report_accepted');
  assert.ok(n && n.params.event_id === ev.data.id);
});
