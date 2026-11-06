// Мобильді қосымша (Expo веб-нұсқасы, 390×844): қажеттіліктер тақтасы, ұйым кабинеті, нәтижелер есебі.
// Алдын ала: npm run demo:reset && CORS_ORIGINS=http://localhost:8081 npm run demo; node mobile/scripts/serve-web.mjs
// Іске қосу: node mobile/scripts/e2e-org-web.mjs   (кейін: npm run demo:reset)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright/index.mjs');
const APP = process.env.APP_URL || 'http://localhost:8081';
const API = process.env.API_URL || 'http://localhost:3000';
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../screenshots/mobile');
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const results = [];
const errors = [];
let n = 0;
async function check(name, fn) {
  n++;
  try { await fn(); results.push(`✔ ${n}. ${name}`); console.log(`✔ ${n}. ${name}`); }
  catch (e) { results.push(`✘ ${n}. ${name}: ${e.message.split('\n')[0]}`); console.log(`✘ ${n}. ${name}: ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_PROXY|tile\.openstreetmap/.test(m.text())) errors.push(`[${name}] ${m.text().slice(0, 200)}`); });
  return { ctx, page };
}
const tid = (p, id) => p.locator(`[data-testid="${id}"]`).first();
const visible = (p, id, timeout = 15000) => tid(p, id).waitFor({ state: 'visible', timeout });
async function demo(p, role) {
  await p.goto(`${APP}/profile`);
  await visible(p, `demo-${role}`);
  await tid(p, `demo-${role}`).click();
  await visible(p, 'profile-card');
}
const ev = (await (await fetch(`${API}/api/events?city_id=62`)).json()).items.find((e) => e.is_demo && e.type_code === 'flood');
assert(ev, 'Қызылорда оқиғасы жоқ — npm run demo:reset');

const C = await phone('org-coord');
const V = await phone('volunteer');
const RC = await phone('recipient');
const G = await phone('guest');
let rid = null;
let confirmedBefore = 0;

await check('оқиға экранындағы «Қажеттіліктер»: күйлер, «Оқу мысалы», ресурс бірлігімен, тексерудегі өтініш жоқ', async () => {
  await G.page.goto(`${APP}/event/${ev.id}`);
  await visible(G.page, 'needs-board');
  await visible(G.page, 'needs-demo');
  await visible(G.page, 'needs-tile-need_executor');
  const txt = await tid(G.page, 'needs-board').innerText();
  assert(txt.includes('20 бөтелке'), 'ресурс жоқ');
  assert(!txt.includes('Қарт кісіні туыстарына'), 'тексерудегі өтініш тақтада');
  await tid(G.page, 'needs-board').scrollIntoViewIfNeeded();
  await G.page.screenshot({ path: path.join(SHOTS, 'kk-needs-board-mobile.png') });
});

await check('санды басқанда сол күйдегі тізім ашылады', async () => {
  await tid(G.page, 'needs-count-water_food-need_executor').click();
  await G.page.waitForFunction(() => document.querySelectorAll('[data-testid="needs-item"]').length === 1, null, { timeout: 10000 });
  assert((await tid(G.page, 'needs-list').innerText()).includes('ауыз су'), 'дұрыс өтініш емес');
  await tid(G.page, 'needs-reset').click();
  await G.page.waitForFunction(() => document.querySelectorAll('[data-testid="needs-item"]').length === 3, null, { timeout: 10000 });
});

await check('ұйым координаторы: профильден кабинет, кіріс, команда ұсыныстары (қала, санат)', async () => {
  await demo(C.page, 'org_coordinator');
  await visible(C.page, 'go-org');
  await tid(C.page, 'go-org').click();
  await visible(C.page, 'org-screen');
  const accept = C.page.locator('[data-testid^="org-accept-"]').first();
  await accept.waitFor({ timeout: 15000 });
  rid = Number((await accept.getAttribute('data-testid')).replace('org-accept-', ''));
  const txt = await tid(C.page, `org-req-${rid}`).innerText();
  assert(/Команда ұсыныстары \(2\)/.test(txt) && txt.includes('Осы санатта көмектеседі') && txt.includes('Қызылорда'), 'ұсыныстар толық емес');
  await C.page.screenshot({ path: path.join(SHOTS, 'kk-org-incoming-mobile.png') });
  await tid(C.page, 'org-tab-review').click();
  await C.page.waitForFunction(() => document.body.innerText.includes('Қарт кісіні туыстарына'), null, { timeout: 10000 });
  const r0 = await fetch(`${API}/api/orgs/1/report`, { headers: { Authorization: 'Bearer ' + await C.page.evaluate(() => localStorage.getItem('qm_token')) } });
  confirmedBefore = (await r0.json()).confirmed;
});

await check('қабылдау → команда еріктісін тағайындау (бір орындаушы)', async () => {
  await tid(C.page, 'org-tab-incoming').click();
  await visible(C.page, `org-accept-${rid}`);
  await tid(C.page, `org-accept-${rid}`).click();
  const btn = C.page.locator('[data-testid^="org-assign-"]').first();
  await btn.waitFor({ timeout: 15000 });
  await btn.click();
  await tid(C.page, 'org-assign-dlg-ok').click();
  await C.page.waitForFunction(() => !document.querySelector('[data-testid^="org-assign-"]:not([data-testid="org-assign-dlg"])'), null, { timeout: 15000 });
  const det = await (await fetch(`${API}/api/requests/${rid}`)).json();
  assert(det.request.status === 'assigned', `мәртебе ${det.request.status}`);
  assert(det.request.org?.name.includes('Сыр'), 'ұйым көрсетілмеді');
});

await check('ерікті «Көмек орындалды», алушы растайды (мобильден)', async () => {
  const det = await (await fetch(`${API}/api/requests/${rid}`)).json();
  await demo(V.page, det.assignee.full_name.startsWith('Ерасыл') ? 'org_volunteer' : 'org_volunteer');
  if (!det.assignee.full_name.startsWith('Ерасыл')) {
    // екінші ерікті таңдалса — оның аккаунтымен кіреміз
    await V.page.goto(`${APP}/login`);
    await tid(V.page, 'login-email').fill('kzo.vol2@demo.qamqormap.kz');
    await tid(V.page, 'login-password').fill('Demo12345');
    await tid(V.page, 'login-submit').click();
    await V.page.waitForTimeout(1000);
  }
  await V.page.goto(`${APP}/request/${rid}`);
  await tid(V.page, 'start').click();
  await visible(V.page, 'done');
  await tid(V.page, 'done').click();
  await tid(V.page, 'report-dlg-input').fill('Су жеткізілді');
  await tid(V.page, 'report-dlg-ok').click();
  await visible(V.page, 'status-awaiting_confirmation');
  await demo(RC.page, 'recipient');
  await RC.page.goto(`${APP}/request/${rid}`);
  await tid(RC.page, 'confirm').click();
  await tid(RC.page, 'confirm-dlg-ok').click();
  await visible(RC.page, 'alert-completed');
  const hist = await tid(RC.page, 'history').innerText();
  assert(hist.includes('Ұйым өтінішті жұмысқа қабылдады'), 'тарихта ұйым қабылдауы жоқ');
});

await check('тақта мен есеп жаңарды; CSV жүктеледі, жеке дерек жоқ', async () => {
  await G.page.goto(`${APP}/event/${ev.id}`);
  await visible(G.page, 'needs-tile-confirmed');
  assert((await tid(G.page, 'needs-tile-need_executor').innerText()).startsWith('0'), 'орындаушы қажет саны 0 болуы керек');
  assert((await tid(G.page, 'needs-tile-confirmed').innerText()).startsWith('2'), 'расталған саны 2 болуы керек');
  await C.page.goto(`${APP}/org?tab=report`);
  await visible(C.page, 'metric-confirmed-value');
  const v = Number(await tid(C.page, 'metric-confirmed-value').innerText());
  assert(v === confirmedBefore + 1, `расталған: ${confirmedBefore} → ${v}`);
  await visible(C.page, 'report-demo');
  assert((await tid(C.page, 'metric-median').innerText()).includes('Есепке'), 'медиана n жоқ');
  await C.page.screenshot({ path: path.join(SHOTS, 'kk-org-report-mobile.png') });
  const [dl] = await Promise.all([C.page.waitForEvent('download'), tid(C.page, 'report-csv').click()]);
  const f = path.join(SHOTS, 'report-mobile.csv');
  await dl.saveAs(f);
  const csv = fs.readFileSync(f, 'utf8');
  assert(csv.includes('Демонстрациялық деректер') || csv.includes('Демонстрационные') || csv.includes('Demonstration'), 'CSV демо белгісі жоқ');
  for (const bad of ['+7 700', 'Жібек жолы', 'Су жеткізілді', '@demo']) assert(!csv.includes(bad), `CSV-де ${bad}`);
});

await check('орысша және ағылшынша: кабинет пен тақта аударылған', async () => {
  await C.page.goto(`${APP}/profile`);
  await tid(C.page, 'lang-profile-ru').click();
  await C.page.goto(`${APP}/org?tab=report`);
  await visible(C.page, 'metric-confirmed');
  assert((await C.page.evaluate(() => document.body.innerText)).includes('Помощь подтвердил получатель'), 'ru есеп');
  await C.page.goto(`${APP}/event/${ev.id}`);
  await visible(C.page, 'needs-demo');
  assert((await tid(C.page, 'needs-demo').innerText()).includes('Учебный пример'), 'ru «Учебный пример»');
  await C.page.goto(`${APP}/profile`);
  await tid(C.page, 'lang-profile-en').click();
  await C.page.goto(`${APP}/org?tab=incoming`);
  await visible(C.page, 'org-screen');
  assert((await C.page.evaluate(() => document.body.innerText)).includes('Organisation workspace'), 'en кабинет');
  await C.page.goto(`${APP}/profile`);
  await tid(C.page, 'lang-profile-kk').click();
});

await browser.close();
console.log('\n' + results.join('\n'));
console.log(errors.length ? `\nКонсоль қателері:\n${errors.slice(0, 10).join('\n')}` : '\nКонсольде қате жоқ');
const failed = results.filter((r) => r.startsWith('✘')).length;
console.log(`Нәтиже: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
