// Браузердегі толық сценарий (Playwright). Тестілік серверге қарсы іске қосылады:
//   BASE=http://localhost:3100 node scripts/e2e.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:3100';
const SHOTS = process.env.OUT || 'screenshots';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const errors = [];
const step = (t) => console.log('✓', t);

async function session(viewport = { width: 1366, height: 860 }) {
  const ctx = await browser.newContext({ viewport, geolocation: { latitude: 49.95, longitude: 82.62 }, permissions: [] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { ctx, page };
}
async function login(page, email, password = 'Demo12345') {
  await page.goto(BASE + '/login');
  await page.fill('#f-email', email);
  await page.fill('#f-password', password);
  await page.click('#auth-form button[type=submit]');
  await page.waitForURL(/dashboard/);
}

// 1. Қала таңдау: іздеу латынша, URL-да сақталады
const A = await session();
await A.page.goto(BASE + '/?city=1');
await A.page.click('#city-btn');
await A.page.fill('#city-q', 'Oskemen');
await A.page.waitForSelector('.city-opt');
assert.equal(await A.page.locator('.city-opt').count(), 1);
await A.page.keyboard.press('Enter');
await A.page.waitForFunction(() => location.search.includes('city=84'));
assert.match(await A.page.textContent('#city-btn'), /Өскемен/);
await A.page.reload();
await A.page.waitForSelector('#cur-list .card, #cur-list .rq-card');
assert.match(await A.page.textContent('#city-btn'), /Өскемен/);
assert.match(await A.page.textContent('#cur-list'), /Өтініш қосу/);
step('Қала таңдау (латынша іздеу, URL, бос күй)');
// Escape диалогты жауып, фокусты қайтарады
await A.page.click('#city-btn');
await A.page.keyboard.press('Escape');
assert.equal(await A.page.evaluate(() => document.activeElement?.id), 'city-btn');
step('Escape және фокусты қайтару');

// 2. Тіркелу және өтініш жасау
await A.page.goto(BASE + '/register?city=1');
await A.page.fill('#f-full_name', 'Сәуле Тестова');
await A.page.fill('#f-email', `saule${Date.now()}@test.kz`);
await A.page.fill('#f-password', 'Saule12345');
await A.page.fill('#f-password_confirm', 'Saule1234x');
await A.page.click('#auth-form button[type=submit]');
await A.page.waitForSelector('[data-field="password_confirm"].has-error');
await A.page.fill('#f-password_confirm', 'Saule12345');
await A.page.click('#auth-form button[type=submit]');
await A.page.waitForURL(/dashboard/);
step('Тіркелу (өріс қатесі көрсетілді, кейін сәтті)');

await A.page.goto(BASE + '/requests/new?city=1');
await A.page.click('#rq-form button[type=submit]');
await A.page.waitForSelector('[data-field="title"].has-error');
await A.page.fill('#f-title', 'E2E: дәріханадан дәрі әкелу');
await A.page.selectOption('#f-category_id', { index: 1 });
await A.page.fill('#f-description', 'Көршіге дәріханадан рецепт бойынша дәрі әкеліп беру керек, ақшасын береді.');
await A.page.fill('#f-district', 'Есіл ауданы');
await A.page.fill('#f-public_place', 'Тұран даңғылы маңы');
await A.page.click('#pick-map', { position: { x: 300, y: 180 } });
await A.page.fill('#f-address', 'Тұран даңғылы, 99-үй, 1-пәтер');
await A.page.fill('#f-contact_phone', '+7 705 111 22 33');
await A.page.screenshot({ path: `${SHOTS}/form-filled-desktop.png`, fullPage: true });
await A.page.click('#rq-form button[type=submit]');
await A.page.waitForURL(/\/requests\/\d+\?/);
const reqUrl = new URL(A.page.url());
const reqId = reqUrl.pathname.split('/').pop();
await A.page.waitForSelector('.alert-warn');
assert.match(await A.page.textContent('main'), /тексеруін күтуде/);
step(`Өтініш жасалды (№${reqId}), тексеруде`);

// Жария тізімде жоқ
const anon = await session();
await anon.page.goto(BASE + '/map?city=1');
await anon.page.waitForSelector('#rq-list .rq-card');
assert.ok(!(await anon.page.textContent('#rq-list')).includes('E2E: дәріханадан'));
step('Бекітілмеген өтініш картада көрінбейді');

// 3. Координатор бекітеді
const C = await session();
await login(C.page, 'coordinator@demo.qamqormap.kz');
await C.page.goto(BASE + '/coordinator?city=1');
await C.page.waitForSelector(`[data-approve="${reqId}"]`);
await C.page.click(`[data-approve="${reqId}"]`);
await C.page.waitForSelector(`[data-approve="${reqId}"]`, { state: 'detached' });
step('Координатор бекітті');

// 4. Ерікті ұсыныс жібереді, мекенжайды көрмейді
const V = await session();
await login(V.page, 'daniyar@demo.qamqormap.kz');
await V.page.goto(`${BASE}/requests/${reqId}?city=1`);
await V.page.waitForSelector('[data-act="apply"]');
assert.ok(!(await V.page.textContent('main')).includes('99-үй'));
await V.page.click('[data-act="apply"]');
await V.page.fill('dialog textarea', 'Бүгін кешке әкелемін.');
await V.page.click('dialog .dlg-foot .btn-coral');
await V.page.waitForSelector('[data-act="withdraw"]');
step('Ерікті ұсыныс жіберді (мекенжай жасырын)');

// 5. Автор орындаушыны таңдайды
await A.page.reload();
await A.page.waitForSelector('[data-act="assign"]');
await A.page.click('[data-act="assign"]');
await A.page.click('dialog .dlg-foot .btn-primary');
await A.page.waitForSelector('.private-box');
step('Орындаушы таңдалды');

// 6. Ерікті мекенжайды көреді, чат, бастау, аяқтау
await V.page.reload();
await V.page.waitForSelector('.private-box');
assert.match(await V.page.textContent('.private-box'), /99-үй/);
await V.page.fill('#chat-input', 'Сәлеметсіз бе! 19:00-де келемін.');
await V.page.click('#chat-form button');
await V.page.waitForSelector('.msg.mine');
await A.page.waitForSelector('.msg:not(.mine)', { timeout: 8000 });
step('Мекенжай орындаушыға ашылды; чат SSE арқылы келді');
await V.page.click('[data-act="start"]');
await V.page.waitForSelector('[data-act="submit-completion"]');
await V.page.click('[data-act="submit-completion"]');
await V.page.fill('dialog textarea', 'Дәрі жеткізілді.');
await V.page.click('dialog .dlg-foot .btn-success');
await V.page.waitForSelector('text=Растау күтілуде');
step('Ерікті жұмысты бастап, нәтижені жіберді');

// 7. Автор растайды → статистика
const before = await (await fetch(`${BASE}/api/stats?city_id=1`)).json();
await A.page.reload();
await A.page.waitForSelector('[data-act="confirm"]');
await A.page.click('[data-act="confirm"]');
await A.page.click('dialog .dlg-foot .btn-success');
await A.page.waitForSelector('.alert-success');
const afterS = await (await fetch(`${BASE}/api/stats?city_id=1`)).json();
assert.equal(afterS.completed, before.completed + 1);
await A.page.screenshot({ path: `${SHOTS}/request-completed-desktop.png`, fullPage: true });
step('Нәтиже расталды, статистика +1');

// 8. Карта сүзгілері
await anon.ctx.close();
const F = await session();
const anonPage = F.page;
await anonPage.goto(BASE + '/map?city=1');
await anonPage.waitForSelector('#rq-list .rq-card');
await anonPage.waitForFunction(() => !document.querySelector('#list-h').textContent.includes('жүктелуде'));
const total = await anonPage.locator('#rq-list .rq-card').count();
await anonPage.click('.mt-cats [data-cat="3"]');
await anonPage.waitForFunction(() => location.search.includes('category=3'));
await anonPage.waitForTimeout(500);
const filtered = await anonPage.locator('#rq-list .rq-card').count();
assert.ok(filtered < total);
await anonPage.fill('#fq', 'жоқсөзқызылжасыл');
await anonPage.waitForSelector('[data-reset]');
await anonPage.click('[data-reset]');
await anonPage.waitForFunction(() => !location.search.includes('category'));
step('Карта сүзгілері, бос күй және тазалау');

// 9. Телефон: Карта/Тізім ауыстырғышы
const M = await session({ width: 390, height: 844 });
await M.page.goto(BASE + '/map?city=1');
await M.page.waitForSelector('#rq-list .rq-card');
await M.page.click('.view-switch [data-view="map"]');
await M.page.waitForSelector('.leaflet-marker-icon');
await M.page.waitForTimeout(400);
await M.page.locator('.qm-marker').first().click({ force: true });
await M.page.waitForSelector('#sheet .rq-card');
await M.page.screenshot({ path: `${SHOTS}/map-sheet-mobile.png` });
step('Телефон: карта, белгі және төменгі карточка');

// ═════════ 10. Тіл ауыстыру: қала, форма мәндері және сүзгілер сақталады ═════════
const L = await session();
await login(L.page, 'aigerim@demo.qamqormap.kz');
await L.page.goto(BASE + '/requests/new?city=56');
await L.page.waitForSelector('#rq-form');
await L.page.fill('#f-title', 'Тіл ауыстыру тесті: заттарды тасу');
await L.page.fill('#f-description', 'Тіл ауыстырғанда бұл мәтін жоғалмауы керек, оны тексереміз.');
await L.page.fill('#f-address', 'Тест көшесі, 5-үй');
await L.page.click('#pick-map', { position: { x: 260, y: 160 } });
const latBefore = await L.page.inputValue('input[name=lat]');
assert.ok(latBefore);
await L.page.click('.lang-desktop [data-lang="ru"]');
await L.page.waitForFunction(() => document.documentElement.lang === 'ru');
await L.page.waitForSelector('label[for="f-title"]');
assert.match(await L.page.textContent('label[for="f-title"]'), /Заголовок/);
assert.equal(await L.page.inputValue('#f-title'), 'Тіл ауыстыру тесті: заттарды тасу');
assert.equal(await L.page.inputValue('#f-description'), 'Тіл ауыстырғанда бұл мәтін жоғалмауы керек, оны тексереміз.');
assert.equal(await L.page.inputValue('input[name=lat]'), latBefore);
assert.ok(L.page.url().includes('city=56'));
assert.match(await L.page.textContent('#city-btn'), /Костанай/);
await L.page.click('.lang-desktop [data-lang="en"]');
await L.page.waitForFunction(() => document.documentElement.lang === 'en');
assert.match(await L.page.textContent('label[for="f-title"]'), /Title/);
assert.equal(await L.page.inputValue('#f-address'), 'Тест көшесі, 5-үй');
assert.match(await L.page.textContent('#city-btn'), /Kostanay/);
step('Тіл ауыстыру: форма мәндері, картадағы нүкте және қала сақталды (kk → ru → en)');
// Тіркелген қолданушының тілі базада сақталады: жаңа браузерде кіргенде де ағылшынша
const L2 = await session();
await login(L2.page, 'aigerim@demo.qamqormap.kz');
await L2.page.waitForFunction(() => document.documentElement.lang === 'en');
step('Тіркелген қолданушының тілі PostgreSQL-ден қалпына келді');
// Карта сүзгілері тіл ауысқанда сақталады
await L.page.goto(BASE + '/map?city=56&dir=disaster&dtype=flood');
await L.page.waitForSelector('#rq-list .rq-card, #rq-list .card');
await L.page.click('.lang-desktop [data-lang="kk"]');
await L.page.waitForFunction(() => document.documentElement.lang === 'kk');
assert.ok(L.page.url().includes('dir=disaster') && L.page.url().includes('dtype=flood') && L.page.url().includes('city=56'));
assert.equal(await L.page.inputValue('#fdtype'), 'flood');
step('Тіл ауысқанда карта сүзгілері (бағыт, апат түрі, қала) сақталды');
// Қонақтың тілі браузерде сақталады
const G = await session();
await G.page.goto(BASE + '/about');
await G.page.click('.lang-desktop [data-lang="ru"]');
await G.page.waitForFunction(() => document.documentElement.lang === 'ru');
await G.page.reload();
await G.page.waitForSelector('.about-hero');
assert.equal(await G.page.evaluate(() => document.documentElement.lang), 'ru');
assert.match(await G.page.textContent('.about-hero h1'), /От сообщения/);
step('Қонақтың тілі браузер баптауында сақталды');

// ═════════ 11. Координатор апат оқиғасын жасайды ═════════
await C.page.goto(BASE + '/events/new?city=56');
await C.page.waitForSelector('#ev-form');
await C.page.selectOption('#f-type', 'flood');
await C.page.fill('#f-title', 'E2E оқу мысалы: Есіл өзені бойындағы тасқын');
await C.page.fill('#f-description', 'E2E тест оқиғасы. Нақты оқиға емес, тек тексеруге арналған.');
await C.page.selectOption('#f-city-add', '1');
await C.page.click('#add-city');
await C.page.selectOption('#f-city-add', '18');
await C.page.click('#add-city');
await C.page.click('label:has(input[name=region_codes][value=akm]) .chip');
await C.page.click('#ev-pick-map', { position: { x: 300, y: 150 } });
await C.page.fill('#f-radius_km', '10');
await C.page.fill('#f-source_name', 'E2E');
await C.page.click('#ev-form button[type=submit]');
await C.page.waitForURL(/\/events\/\d+\?/);
const evId = Number(new URL(C.page.url()).pathname.split('/').pop());
await C.page.waitForSelector('.badge-unverified');
await C.page.click('[data-ev-act="verify"]');
await C.page.click('dialog .dlg-foot .btn-primary');
await C.page.waitForSelector('.verify-explain.is-verified');
step(`Координатор оқиға жасап (№${evId}, 2 қала + облыс + нүкте), «тексерді» деп белгіледі`);
// Қарапайым қолданушы оқиға жасай алмайды
await A.page.goto(BASE + '/events/new');
await A.page.waitForSelector('.state.is-locked');
step('Қарапайым қолданушыға оқиға формасы жабық');

// ═════════ 12. Бір оқиғаға бірнеше өтініш ═════════
const linked = [];
for (const [cat, title] of [['evacuation', 'E2E: көшуге көлік керек'], ['water_food', 'E2E: ауыз су жеткізу']]) {
  await A.page.goto(`${BASE}/requests/new?event=${evId}&city=1`);
  await A.page.waitForSelector('#rq-form');
  assert.equal(await A.page.inputValue('#f-disaster_event_id'), String(evId));
  await A.page.waitForSelector('#disaster-box:not([hidden])');
  const catId = await A.page.evaluate((c) => [...document.querySelectorAll('#f-category_id option')].find((o) => o.textContent.includes(c === 'evacuation' ? 'Эвакуация' : 'Су және'))?.value, cat);
  await A.page.selectOption('#f-category_id', catId);
  await A.page.fill('#f-title', title);
  await A.page.fill('#f-description', 'E2E: апатқа байланысты өтініш, қауіпсіз жерде көмек қажет.');
  await A.page.click('#pick-map', { position: { x: 300, y: 180 } });
  await A.page.fill('#f-address', 'Уақытша баспана: Тест көшесі, 7 (жабық)');
  await A.page.fill('#f-contact_phone', '+7 705 222 33 44');
  await A.page.click('#rq-form button[type=submit]');
  await A.page.waitForURL(/\/requests\/\d+\?/);
  linked.push(Number(new URL(A.page.url()).pathname.split('/').pop()));
}
for (const id of linked) {
  const r = await C.page.evaluate(async (rid) => {
    const csrf = (await (await fetch('/api/auth/me')).json()).csrfToken;
    return (await fetch(`/api/requests/${rid}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ decision: 'approve' }) })).status;
  }, id);
  assert.equal(r, 200);
}
await anonPageCheck();
async function anonPageCheck() {
  const P = await session();
  await P.page.goto(`${BASE}/events/${evId}?city=1`);
  await P.page.waitForSelector('.ev-related-grid .rq-card');
  assert.equal(await P.page.locator('.ev-related-grid .rq-card').count(), 2);
  assert.ok(!(await P.page.textContent('main')).includes('Тест көшесі, 7'), 'баспана мекенжайы жария емес');
  await P.ctx.close();
}
step('Бір оқиғаға екі өтініш байланысты; баспана мекенжайы жария бетте жоқ');

// ═════════ 13. Карта: апат сүзгілері, оқиға белгісі және карточкасы ═════════
const MP = await session();
await MP.page.goto(BASE + '/map?city=1&dir=disaster');
await MP.page.waitForSelector('.qm-event-marker');
await MP.page.waitForSelector('#dis-note .alert-emergency');
await MP.page.locator(`.ev-strip .ev-card[data-event-id="${evId}"]`).click({ position: { x: 20, y: 20 } });
await MP.page.waitForSelector('#ev-panel:not([hidden]) .ev-card');
await MP.page.waitForSelector('#ev-related ul li');
assert.match(await MP.page.textContent('#ev-panel'), /Координатор тексерді/);
await MP.page.click('#ev-filter-btn');
await MP.page.waitForFunction((id) => location.search.includes(`event=${id}`), evId);
await MP.page.waitForFunction(() => document.querySelectorAll('#rq-list .rq-card').length === 2);
await MP.page.selectOption('#fverif', 'unverified');
await MP.page.waitForTimeout(700);
assert.equal(await MP.page.locator(`.ev-strip .ev-card[data-event-id="${evId}"]`).count(), 0);
await MP.page.click('#dir-seg [data-dir="everyday"]');
await MP.page.waitForTimeout(700);
assert.equal(await MP.page.locator('.qm-event-marker').count(), 0);
step('Карта: апат бағыты, оқиға белгісі мен карточкасы, байланысты өтініштер сүзгісі, тексеру сүзгісі');

// ═════════ 14. Апатқа байланысты өтінішке ұсыныс: қауіпсіздік растауы міндетті ═════════
await V.page.goto(`${BASE}/requests/${linked[0]}?city=1`);
await V.page.waitForSelector('[data-act="apply"]');
await V.page.click('[data-act="apply"]');
await V.page.click('dialog .dlg-foot .btn-coral');
await V.page.waitForSelector('dialog [data-field="safety_ack"].has-error');
await V.page.check('dialog #f-safety_ack');
await V.page.click('dialog .dlg-foot .btn-coral');
await V.page.waitForSelector('[data-act="withdraw"]');
step('Апат өтінішіне ұсыныс тек қауіпсіздік ережесін растағаннан кейін жіберілді');

// ═════════ 15. Телефон: мобильді мәзірдегі тіл және апат картасы ═════════
const MM = await session({ width: 390, height: 844 });
await MM.page.goto(BASE + '/disasters?city=all');
await MM.page.waitForSelector('.ev-card');
await MM.page.click('#burger');
await MM.page.click('.lang-mobile [data-lang="en"]');
await MM.page.waitForFunction(() => document.documentElement.lang === 'en');
assert.match(await MM.page.textContent('h1'), /Natural disasters/);
const overflow = await MM.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
assert.ok(!overflow, 'телефонда көлденең айналдыру жоқ');
await MM.page.screenshot({ path: `${SHOTS}/disasters-en-mobile.png`, fullPage: true });
await MM.page.goto(BASE + '/map?city=56&dir=disaster');
await MM.page.waitForSelector('#rq-list .rq-card, #rq-list .card');
await MM.page.click('.view-switch [data-view="map"]');
await MM.page.waitForSelector('.qm-event-marker');
await MM.page.waitForTimeout(400);
await MM.page.locator('.qm-event-marker').first().click({ force: true });
await MM.page.waitForSelector('#ev-panel:not([hidden]) .ev-card');
await MM.page.screenshot({ path: `${SHOTS}/map-event-en-mobile.png` });
step('Телефон: мобильді мәзірден тіл ауыстыру, көлденең айналдыру жоқ, оқиға карточкасы');

console.log(errors.length ? ['Консоль қателері:', ...errors].join('\n') : 'Консольде қате жоқ');
await browser.close();
if (errors.length) process.exit(1);
