// Оқиғалар картасының API тесттері: оқиға түрлері мен топтары, картадан нүктесі бар хабарлама,
// хабарлама жария тізімге шықпайды және тек автор мен координаторға көрінеді.
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
let author, other, coordinator, guest;

before(async () => {
  const c = await pool.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  c.release();
  await migrate({ log: () => {} });
  await seed({ log: () => {} });
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  author = await login(`daniyar${D}`);
  other = await login(`aigerim${D}`);
  coordinator = await login(`coordinator${D}`);
  guest = new M();
});
after(async () => { server?.close(); await pool.end(); });

test('оқиға түрлері: табиғи және «оқиға» түрлері, сүзгі топтары; бұрынғы түрлер сақталған', async () => {
  const r = await guest.get('/disaster-types');
  assert.equal(r.status, 200);
  const codes = r.data.items.map((x) => x.code);
  for (const c of ['flood', 'earthquake', 'wildfire', 'fire', 'accident', 'incident_other']) assert.ok(codes.includes(c), c);
  assert.equal(r.data.items.find((x) => x.code === 'flood').kind, 'natural');
  assert.equal(r.data.items.find((x) => x.code === 'accident').kind, 'incident');
  assert.deepEqual(r.data.groups.map((g) => g.code), ['fire', 'flood', 'earthquake', 'accident', 'misc']);
  // әр түр дәл бір топқа кіреді
  for (const c of codes) assert.equal(r.data.groups.filter((g) => g.types.includes(c)).length, 1, c);
});

test('демо оқиғалар картада: бәрі «оқу мысалы», нүктесі бар; қала сүзгісі жұмыс істейді', async () => {
  const all = (await guest.get('/events?limit=200')).data.items;
  assert.ok(all.length >= 8);
  assert.ok(all.every((e) => e.is_demo && e.title.startsWith('Оқу мысалы')));
  assert.ok(all.some((e) => e.type_code === 'fire') && all.some((e) => e.type_code === 'accident'));
  const shym = (await guest.get('/events?city_id=3')).data.items;
  assert.ok(shym.some((e) => e.type_code === 'fire'));
  assert.ok(!shym.some((e) => e.type_code === 'accident'), 'Қарағанды оқиғасы Шымкентте көрінбеуі керек');
});

test('картадан нүктесі бар хабарлама: жария тізімде жоқ, автор мен координатор ғана көреді', async () => {
  const bad = await author.post('/disaster-reports', { type: 'fire', city_id: 3, lat: 30, lng: 69.6, description: 'Оқу тексеруі: далада түтін көрінеді.' });
  assert.equal(bad.status, 400, 'Қазақстаннан тыс нүкте қабылданбауы керек');
  const g = await guest.post('/disaster-reports', { type: 'fire', city_id: 3, lat: 42.3, lng: 69.6, description: 'Оқу тексеруі: далада түтін көрінеді.' });
  assert.equal(g.status, 401, 'Қонақ хабарлама жібере алмайды');
  const r = await author.post('/disaster-reports', { type: 'fire', city_id: 3, lat: 42.31, lng: 69.61, description: 'Оқу тексеруі: далада түтін көрінеді, адамдар жоқ.' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const mine = (await author.get('/me/disaster-reports')).data.items;
  const it = mine.find((x) => x.id === r.data.id);
  assert.ok(it && it.status === 'pending' && it.lat === 42.31 && it.lng === 69.61 && it.type_code === 'fire');
  assert.ok(!(await other.get('/me/disaster-reports')).data.items.some((x) => x.id === r.data.id), 'басқа қолданушы көрмеуі керек');
  assert.equal((await other.get('/coordinator/disaster-reports?status=pending')).status, 403);
  assert.ok((await coordinator.get('/coordinator/disaster-reports?status=pending')).data.items.some((x) => x.id === r.data.id));
  const pub = JSON.stringify((await guest.get('/events?limit=200')).data);
  assert.ok(!pub.includes('адамдар жоқ'), 'тексерілмеген хабарлама жария тізімде');
});
