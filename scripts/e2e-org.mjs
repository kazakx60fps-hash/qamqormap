// Ұйым кабинеті + қажеттіліктер тақтасы + көмек нәтижелері: сайттағы демо сценарийі (Қызылорда, оқу деректері).
// Алдын ала: npm run demo:reset && npm run demo   (Playwright керек)
// Іске қосу: BASE=http://localhost:3000 node scripts/e2e-org.mjs
import fs from 'node:fs';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = path.resolve('screenshots/org');
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const results = [];
const pages = [];
const errors = [];
let n = 0;
async function check(name, fn) {
  n++;
  try { await fn(); results.push(`✔ ${n}. ${name}`); console.log(`✔ ${n}. ${name}`); }
  catch (e) {
    results.push(`✘ ${n}. ${name}: ${e.message.split('\n')[0]}`); console.log(`✘ ${n}. ${name}: ${e.message}`);
    if (process.env.DEBUG_SHOTS) for (const [i, p] of pages.entries()) await p.screenshot({ path: `${process.env.DEBUG_SHOTS}/fail-${n}-${i}.png` }).catch(() => {});
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
async function user(email, { width = 1366, height = 900, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, acceptDownloads: true });
  const page = await ctx.newPage();
  pages.push(page);
  page.on('pageerror', (e) => errors.push(`${email}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap|ERR_TUNNEL|ERR_PROXY|Failed to load resource/.test(m.text())) errors.push(`${email}: ${m.text()}`); });
  if (email) {
    await page.goto(BASE + '/login');
    await page.fill('#f-email', email);
    await page.fill('#f-password', 'Demo12345');
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }), page.click('form button[type="submit"]')]);
  }
  return { ctx, page };
}
const api = async (p) => (await fetch(BASE + '/api' + p)).json();
const ev = (await api('/events?city_id=62&activity=active')).items.find((e) => e.is_demo && e.type_code === 'flood');
assert(ev, 'Қызылорда оқиғасы табылмады — алдымен npm run demo:reset');
const kzoEvent = ev.id;

const C = await user('kzo.coord@demo.qamqormap.kz');
const C2 = await user('ast.org@demo.qamqormap.kz');
const V = await user('kzo.vol1@demo.qamqormap.kz');
const RCP = await user('kzo.recipient@demo.qamqormap.kz');
const G = await user(null);
let rid = null;
let reportBefore = null;

await check('қажеттіліктер тақтасы: күйлер, ресурс бірлігімен бөлек, «Оқу мысалы», тексерудегі өтініш жоқ', async () => {
  await G.page.goto(`${BASE}/events/${kzoEvent}?city=62`);
  await G.page.waitForSelector('#needs-table', { timeout: 15000 });
  assert(await G.page.isVisible('#needs-demo'), '«Оқу мысалы» белгісі жоқ');
  const tiles = await G.page.innerText('.needs-tiles');
  assert(/1\s*Орындаушы қажет/.test(tiles) && /1\s*Көмек расталды/.test(tiles), `күйлер: ${tiles}`);
  const table = await G.page.innerText('#needs-table');
  assert(table.includes('20 бөтелке'), 'ресурс мөлшері (20 бөтелке) жоқ');
  assert(!table.includes('Қарт кісіні туыстарына'), 'тексерудегі өтініш тақтада');
  assert(!(await G.page.innerText('#needs-board')).includes('Қарт кісіні туыстарына'), 'тексерудегі өтініш тізімде');
  await G.page.screenshot({ path: path.join(SHOTS, 'kk-needs-board.png'), fullPage: false });
});

await check('сандарды басу және сүзгілер: «Орындаушы қажет» → тек сол өтініш; аудан/санат сүзгісі', async () => {
  await G.page.click('.needs-count.is-need');
  await G.page.waitForFunction(() => document.querySelectorAll('.needs-item').length === 1);
  assert((await G.page.innerText('.needs-item')).includes('ауыз су'), 'дұрыс өтініш ашылмады');
  assert(new URL(G.page.url()).searchParams.get('n_state') === 'need_executor', 'сүзгі URL-де жоқ');
  await G.page.click('#n-reset');
  await G.page.waitForFunction(() => document.querySelectorAll('.needs-item').length === 3);
  await G.page.selectOption('#n-cat', 'shelter');
  await G.page.waitForFunction(() => document.querySelectorAll('.needs-item').length === 1);
  await G.page.selectOption('#n-cat', '');
  await G.page.waitForFunction(() => document.querySelectorAll('.needs-item').length === 3);
  // Тіл ауысқанда сүзгі сақталады
  await G.page.selectOption('#n-state', 'confirmed');
  await G.page.waitForFunction(() => document.querySelectorAll('.needs-item').length === 1);
  await G.page.click('.lang-desktop [data-lang="ru"]').catch(async () => { await G.page.click('[data-lang="ru"]'); });
  await G.page.waitForFunction(() => document.documentElement.lang === 'ru');
  await G.page.waitForSelector('#needs-board .needs-item');
  assert(await G.page.locator('.needs-item').count() === 1, 'тіл ауысқанда сүзгі жоғалды');
  assert((await G.page.innerText('#needs-board')).includes('Помощь подтверждена'), 'орысша күй атауы жоқ');
  assert((await G.page.innerText('#needs-demo')).includes('Учебный пример'), 'орысша «Учебный пример» жоқ');
  await G.page.screenshot({ path: path.join(SHOTS, 'ru-needs-filtered.png') });
  await G.page.click('[data-lang="kk"]');
});

await check('ұйым кабинеті: команда, кіріс, тексеру кезегі (координаторға ғана), сүзгілер', async () => {
  await C.page.goto(`${BASE}/org?city=62`);
  await C.page.waitForSelector('.org-row', { timeout: 15000 });
  assert(await C.page.isVisible('#org-demo'), 'демо белгісі жоқ');
  const inc = await C.page.innerText('#opanel');
  assert(inc.includes('Су басқан үйге ауыз су жеткізу'), 'кіріс өтініш жоқ');
  assert(/Команда ұсыныстары \(2\)/.test(inc), 'команда ұсыныстары жоқ');
  assert(inc.includes('Осы санатта көмектеседі') && inc.includes('Қызылорда'), 'ерікті санаты/қаласы көрсетілмеген');
  await C.page.screenshot({ path: path.join(SHOTS, 'kk-org-incoming.png') });
  await C.page.click('#otab-review');
  await C.page.waitForSelector('.org-row');
  assert((await C.page.innerText('#opanel')).includes('Қарт кісіні туыстарына'), 'тексеру кезегінде өтініш жоқ');
  await C.page.click('#otab-team');
  await C.page.waitForSelector('.org-member');
  assert(await C.page.locator('.org-member').count() === 3, 'команда саны');
  await C.page.click('#otab-active');
  await C.page.waitForSelector('.org-row');
  await C.page.selectOption('#of-status', 'in_progress');
  await C.page.waitForFunction(() => document.querySelectorAll('.org-row').length === 1);
});

await check('басқа ұйымның координаторы бұл ұйымның кабинетін аша алмайды', async () => {
  const r = await C2.page.evaluate(async (base) => (await fetch(base + '/api/orgs/1/requests?view=active')).status, BASE);
  assert(r === 403, `күтілгені 403, келгені ${r}`);
  await C2.page.goto(`${BASE}/org?org=1`);
  await C2.page.waitForSelector('#opanel');
  assert(!(await C2.page.innerText('body')).includes('Сыр еріктілері'), 'бөтен ұйым кабинеті ашылды');
});

await check('координатор кабинеттен (тақтадан келіп) өтінішті қабылдап, команда еріктісін тағайындайды', async () => {
  reportBefore = await C.page.evaluate(async (base) => (await fetch(base + '/api/orgs/1/report')).json(), BASE);
  await C.page.goto(`${BASE}/events/${kzoEvent}?city=62&n_state=need_executor`);
  await C.page.waitForSelector('.needs-item');
  await C.page.goto(`${BASE}/org?city=62&tab=incoming`);
  await C.page.waitForSelector('[data-accept]');
  rid = Number(await C.page.getAttribute('[data-accept]', 'data-accept'));
  await C.page.click(`[data-accept="${rid}"]`);
  await C.page.waitForSelector(`[data-org-request="${rid}"] [data-assign]`, { timeout: 15000 });
  await C.page.screenshot({ path: path.join(SHOTS, 'kk-org-active-offers.png') });
  await C.page.click(`[data-org-request="${rid}"] [data-assign]`);
  await C.page.click('dialog .dlg-foot .btn:last-child');
  await C.page.waitForFunction((id) => !document.querySelector(`[data-org-request="${id}"] [data-assign]`), rid, { timeout: 15000 });
  const det = await C.page.evaluate(async ([base, id]) => (await fetch(`${base}/api/requests/${id}`)).json(), [BASE, rid]);
  assert(det.request.status === 'assigned', `мәртебе ${det.request.status}`);
  assert(det.private?.address, 'ұйым координаторына мекенжай ашылмады');
  const types = det.events.map((e) => e.type);
  assert(types.includes('org_accepted') && types.includes('assigned'), 'тарихта қабылдау/тағайындау жоқ');
  // Екінші тағайындау әрекеті 409 береді — бір белсенді орындаушы
  const second = await C.page.evaluate(async ([base, id, appId]) => {
    const me = await (await fetch(base + '/api/auth/me')).json();
    return (await fetch(`${base}/api/requests/${id}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify({ application_id: appId }) })).status;
  }, [BASE, rid, det.applications.find((a) => a.status !== 'accepted').id]);
  assert(second === 409 || second === 400, `қайта тағайындау: ${second}`);
});

await check('ерікті орындалғанын белгілейді, алушы растайды; тарихта кім, қашан', async () => {
  const det = await C.page.evaluate(async ([base, id]) => (await fetch(`${base}/api/requests/${id}`)).json(), [BASE, rid]);
  const volEmail = det.assignee.full_name.startsWith('Ерасыл') ? V : await user('kzo.vol2@demo.qamqormap.kz');
  await volEmail.page.goto(`${BASE}/requests/${rid}`);
  await volEmail.page.click('[data-act="start"]');
  await volEmail.page.waitForSelector('[data-act="submit-completion"], [data-act="report"], [data-act="done"]', { timeout: 15000 });
  await volEmail.page.click('[data-act="submit-completion"], [data-act="report"], [data-act="done"]');
  await volEmail.page.fill('dialog textarea, .dialog textarea', 'Су жеткізілді');
  await volEmail.page.click('dialog .dlg-foot .btn:last-child');
  await volEmail.page.waitForFunction(() => document.body.innerText.includes('Растау күтілуде'), null, { timeout: 15000 });
  await RCP.page.goto(`${BASE}/requests/${rid}`);
  await RCP.page.click('[data-act="confirm"]');
  await RCP.page.click('dialog .dlg-foot .btn:last-child');
  await RCP.page.waitForFunction(() => document.body.innerText.includes('Көмек расталды'), null, { timeout: 15000 });
  const hist = await RCP.page.innerText('.timeline');
  for (const s of ['Ұйым өтінішті жұмысқа қабылдады', 'Орындаушы таңдалды', 'Нәтиже расталды']) assert(hist.includes(s), `тарихта «${s}» жоқ`);
  assert(hist.includes('ұйым координаторы'), 'тарихта ұйым координаторы рөлі жоқ');
  await RCP.page.screenshot({ path: path.join(SHOTS, 'kk-request-history.png') });
});

await check('тақта мен есеп жаңа мәндерді көрсетеді; қайта растау санды өзгертпейді', async () => {
  await G.page.goto(`${BASE}/events/${kzoEvent}?city=62`);
  await G.page.waitForSelector('#needs-table');
  const tiles = await G.page.innerText('.needs-tiles');
  assert(/0\s*Орындаушы қажет/.test(tiles) && /2\s*Көмек расталды/.test(tiles), `тақта жаңармады: ${tiles}`);
  await RCP.page.evaluate(async ([base, id]) => {
    const me = await (await fetch(base + '/api/auth/me')).json();
    await fetch(`${base}/api/requests/${id}/confirm-completion`, { method: 'POST', headers: { 'X-CSRF-Token': me.csrfToken } });
  }, [BASE, rid]);
  await C.page.goto(`${BASE}/org?city=62&tab=report`);
  await C.page.waitForSelector('#m-confirmed', { timeout: 15000 });
  const conf = Number((await C.page.innerText('#m-confirmed .org-metric-val')).trim());
  assert(conf === reportBefore.confirmed + 1, `расталған: ${reportBefore.confirmed} → ${conf}`);
  assert(Number((await C.page.innerText('#m-accepted .org-metric-val')).trim()) === reportBefore.accepted + 1, 'қабылданған саны жаңармады');
  assert((await C.page.innerText('#m-median')).includes('Есепке'), 'медиананың n мәні жоқ');
  assert(await C.page.isVisible('#report-demo'), '«Демонстрациялық деректер» белгісі жоқ');
  assert(await C.page.isVisible('#report-cats'), 'санаттар бойынша кесте жоқ');
  await C.page.screenshot({ path: path.join(SHOTS, 'kk-org-report.png') });
});

await check('есеп сүзгілері және бос күй; CSV таңдалған сүзгілермен, жеке деректерсіз', async () => {
  await C.page.fill('#of-from', '2030-01-01');
  await C.page.dispatchEvent('#of-from', 'change');
  await C.page.fill('#of-to', '2030-01-31');
  await C.page.dispatchEvent('#of-to', 'change');
  await C.page.waitForSelector('#report-empty', { timeout: 10000 });
  await C.page.click('[data-preset="30"]');
  await C.page.waitForSelector('#m-confirmed');
  await C.page.selectOption('#of-event', String(kzoEvent));
  await C.page.waitForSelector('#m-confirmed');
  const href = await C.page.getAttribute('#csv-link', 'href');
  assert(href.includes(`event_id=${kzoEvent}`) && href.includes('city_id=62'), `CSV сүзгісі: ${href}`);
  const [dl] = await Promise.all([C.page.waitForEvent('download'), C.page.click('#csv-link')]);
  const file = path.join(SHOTS, 'report.csv');
  await dl.saveAs(file);
  const csv = fs.readFileSync(file, 'utf8');
  assert(csv.includes('Демонстрациялық деректер'), 'CSV-де демо белгісі жоқ');
  assert(csv.includes('Алушы растаған көмек;2'), `CSV мәні: ${csv.slice(0, 300)}`);
  for (const bad of ['+7 700', 'Жібек жолы', 'пәтер', 'Су жеткізілді', '@demo']) assert(!csv.includes(bad), `CSV-де жеке дерек: ${bad}`);
});

await check('телефон көрінісі (390 px): кабинет пен тақтада көлденең айналу жоқ', async () => {
  const M = await user('kzo.coord@demo.qamqormap.kz', { width: 390, height: 844, mobile: true });
  for (const url of [`/org?city=62&tab=report`, `/org?city=62&tab=active`, `/events/${kzoEvent}?city=62`]) {
    await M.page.goto(BASE + url);
    await M.page.waitForTimeout(1200);
    const ov = await M.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(ov <= 1, `${url}: көлденең айналу ${ov}px`);
  }
  await M.page.screenshot({ path: path.join(SHOTS, 'kk-needs-mobile.png') });
  await M.ctx.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
console.log(errors.length ? `\nКонсоль қателері:\n${errors.slice(0, 10).join('\n')}` : '\nКонсольде қате жоқ');
const failed = results.filter((r) => r.startsWith('✘')).length;
console.log(`Нәтиже: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
