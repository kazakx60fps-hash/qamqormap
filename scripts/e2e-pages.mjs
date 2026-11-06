// GitHub Pages статикалық демо нұсқасын тексеру (Playwright).
//   node scripts/serve-pages.mjs &   node scripts/e2e-pages.mjs [URL]
// URL әдепкіде http://localhost:4173/qamqormap — жарияланған сілтемені де беруге болады.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright/index.mjs');
const URL0 = (process.argv[2] || process.env.PAGES_URL || 'http://localhost:4173/qamqormap').replace(/\/+$/, '');
const SHOTS = process.env.SHOTS || '';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const results = [], errors = [];
let n = 0;
async function check(name, fn) {
  n++;
  try { await fn(); results.push(`✔ ${n}. ${name}`); } catch (e) { results.push(`✘ ${n}. ${name}: ${e.message.split('\n')[0]}`); }
  console.log(results.at(-1));
}
const assert = (c, m) => { if (!c) throw new Error(m); };
async function page(vp = { width: 1366, height: 860 }, mobile = false) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap|ERR_TUNNEL|ERR_PROXY|ERR_CONNECTION|status of 404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  return p;
}
const P = await page();

await check('басты бет ашылады, «Демо нұсқа» жолағы көрінеді, API қатесі жоқ', async () => {
  await P.goto(URL0 + '/');
  await P.waitForSelector('#static-banner', { timeout: 15000 });
  assert((await P.textContent('#static-banner')).includes('GitHub Pages'), 'жолақ мәтіні');
  await P.waitForSelector('.site-header .brand');
  assert(!(await P.$('.state-error')), 'бетте қате күйі бар');
});

await check('оқиғалар картасы: Қазақстан, 8 оқиға, түр сүзгілері, «Оқу мысалы»', async () => {
  await P.goto(URL0 + '/incidents');
  await P.waitForSelector('.inc-card', { state: 'attached', timeout: 15000 });
  const total = Number(await P.textContent('#inc-g-all .inc-chip-n'));
  assert(total >= 5, `оқиға саны ${total}`);
  for (const g of ['fire', 'flood', 'earthquake', 'accident', 'misc']) assert(await P.$(`#inc-g-${g}`), `сүзгі ${g}`);
  assert((await P.$$('.qm-event-marker')).length === total, 'белгілер саны тізіммен сәйкес емес');
  assert((await P.textContent('.inc-list')).includes('Оқу мысалы'), 'оқу мысалы белгісі жоқ');
  await P.click('#inc-g-fire');
  await P.waitForFunction(() => document.querySelectorAll('.inc-card').length === Number(document.querySelector('#inc-g-fire .inc-chip-n').textContent));
  await P.click('#inc-g-all');
});

await check('белгіні басқанда карточка (попап) ашылады, «Толығырақ» оқиға бетіне апарады', async () => {
  await P.evaluate(() => document.querySelector('.qm-event-marker').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await P.waitForSelector('.inc-pop h3', { timeout: 5000 });
  await P.click('.inc-pop a.btn');
  await P.waitForSelector('#needs-board, .needs-head', { timeout: 15000 });
  assert(/\/qamqormap\/events\/\d+/.test(P.url()), `URL: ${P.url()}`);
});

await check('қала іздеу: «Қызылорда» → карта мен тізім сол қалаға ауысады', async () => {
  await P.goto(URL0 + '/incidents');
  await P.waitForSelector('#inc-q');
  await P.fill('#inc-q', 'Қызыл');
  await P.waitForSelector('#inc-sugg li[data-city]');
  await P.keyboard.press('Enter');
  await P.waitForFunction(() => document.querySelector('#inc-list-h').textContent.startsWith('Қызылорда'), null, { timeout: 8000 });
  assert(P.url().includes('at='), 'URL-де қала жоқ');
});

await check('тайлдар жүктелмесе: офлайн демо карта және ескерту', async () => {
  await P.goto(URL0 + '/incidents');
  await P.waitForSelector('#inc-offline, .leaflet-tile-loaded', { timeout: 16000 });
  if (await P.$('#inc-offline')) {
    await P.waitForFunction(() => document.querySelectorAll('.leaflet-qmOffline-pane path').length > 3, null, { timeout: 8000 });
  }
});

await check('жаңа хабарлама: картадан нүкте → форма → тек осы бетте «тексеруде» белгісі', async () => {
  await P.click('#inc-add');
  await P.waitForSelector('.inc-note.is-pick');
  const box = await P.locator('#inc-map').boundingBox();
  await P.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await P.waitForSelector('#inc-form');
  await P.selectOption('#f-type', 'fire');
  await P.fill('#f-description', 'Оқу тексеруі: далада түтін көрінеді, адамдар жоқ.');
  await P.click('dialog .dlg-foot .btn:last-child');
  await P.waitForSelector('.qm-report.is-mine', { timeout: 8000 });
  assert((await P.textContent('.inc-list')).includes('тексеруде'), 'тізімде жоқ');
});

await check('көмек картасы, апаттар, өтініш беті ашылады', async () => {
  await P.goto(URL0 + '/map');
  await P.waitForSelector('.rq-card', { timeout: 15000 });
  const href = await P.getAttribute('.rq-card a[href*="/requests/"]', 'href');
  assert(href.startsWith('/qamqormap/requests/'), `сілтеме: ${href}`);
  await P.goto(URL0 + '/disasters');
  await P.waitForSelector('.ev-card', { timeout: 15000 });
  await P.goto(URL0 + href.replace('/qamqormap', ''));
  await P.waitForSelector('h1', { timeout: 15000 });
  assert(!(await P.textContent('main')).includes('+7 7'), 'телефон көрінеді');
});

await check('кіру беті: статикалық нұсқа туралы түсінікті хабар', async () => {
  await P.goto(URL0 + '/login');
  await P.waitForSelector('#static-auth-note');
  await P.fill('#f-email', 'x@example.kz');
  await P.fill('#f-password', 'whatever1');
  await P.click('#auth-form button[type=submit]');
  await P.waitForFunction(() => document.querySelector('.form-alert')?.textContent.includes('GitHub Pages'), null, { timeout: 5000 });
});

await check('орысша және ағылшынша: карта беті аударылған', async () => {
  await P.goto(URL0 + '/incidents');
  await P.waitForSelector('#inc-h');
  await P.click('.lang-desktop [data-lang="ru"]');
  await P.waitForFunction(() => document.querySelector('#inc-h')?.textContent.includes('Карта происшествий'));
  await P.click('.lang-desktop [data-lang="en"]');
  await P.waitForFunction(() => document.querySelector('#inc-h')?.textContent.includes('Incident map'));
  await P.click('.lang-desktop [data-lang="kk"]');
});

const M = await page({ width: 390, height: 844 }, true);
await check('телефон (390 px): элементтер бір-бірін жаппайды, көлденең айналдыру жоқ', async () => {
  await M.goto(URL0 + '/incidents');
  await M.waitForSelector('.inc-card', { state: 'attached', timeout: 15000 });
  await M.waitForTimeout(10500);
  const r = await M.evaluate(() => {
    const rect = (s) => document.querySelector(s)?.getBoundingClientRect();
    const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const zoom = rect('.leaflet-control-zoom'), reset = rect('#inc-reset'), sw = rect('.inc-switch'), attr = rect('.leaflet-control-attribution'), note = rect('.inc-note'), add = rect('#inc-add');
    return { scrollX: document.documentElement.scrollWidth > window.innerWidth + 1,
      pairs: { 'zoom×reset': hit(zoom, reset), 'zoom×note': hit(zoom, note), 'reset×note': hit(reset, note), 'switch×attr': hit(sw, attr), 'switch×note': hit(sw, note) },
      addVisible: !!add && add.width > 0 };
  });
  assert(!r.scrollX, 'көлденең айналдыру бар');
  const bad = Object.entries(r.pairs).filter(([, v]) => v).map(([k]) => k);
  assert(!bad.length, `қабаттасу: ${bad.join(', ')}`);
  assert(r.addVisible, '«Қосу» батырмасы көрінбейді');
  if (SHOTS) await M.screenshot({ path: `${SHOTS}/pages-phone.png` });
});

await browser.close();
console.log('\n' + results.join('\n'));
console.log(errors.length ? `\nКонсоль қателері:\n${[...new Set(errors)].slice(0, 10).join('\n')}` : '\nКонсольде қате жоқ');
const failed = results.filter((r) => r.startsWith('✘')).length;
console.log(`Нәтиже: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
