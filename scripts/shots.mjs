// Презентацияға арналған скриншоттар: сайт (1440×900, ×2) және мобильді қосымшаның веб-нұсқасы (390×844, ×3).
// Демо дерекқормен жұмыс істейді — экрандағы оқиғалар мен өтініштер «Оқу мысалы».
//   SITE=http://localhost:3000 APP=http://localhost:8081 OUT=shots-out node scripts/shots.mjs
import fs from 'node:fs';
import path from 'node:path';

const pw = process.env.PLAYWRIGHT_PATH ? await import(process.env.PLAYWRIGHT_PATH) : await import('playwright');
const { chromium } = pw.default?.chromium ? pw.default : pw;
const SITE = process.env.SITE || 'http://localhost:3000';
const APP = process.env.APP || 'http://localhost:8081';
const OUT = path.resolve(process.env.OUT || 'shots-out');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const done = [];
const fail = [];
async function step(name, fn) {
  try { await fn(); done.push(name); console.log('✔', name); } catch (e) { fail.push(`${name}: ${e.message.split('\n')[0]}`); console.log('✘', name, e.message.split('\n')[0]); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function tiles(frameOrPage, min = 6) {
  try { await frameOrPage.waitForFunction((n) => document.querySelectorAll('.leaflet-tile-loaded').length >= n, min, { timeout: 15000 }); } catch { /* офлайн режим */ }
  await sleep(1500);
}

const ev = (await (await fetch(`${SITE}/api/events?limit=200`)).json()).items;
const flood = ev.find((e) => e.type_code === 'flood' && e.areas?.some((a) => a.city_id === 62)) || ev.find((e) => e.type_code === 'flood');

// ───── Сайт ─────
const site = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'kk-KZ' });
const S = await site.newPage();
await step('site-incidents', async () => {
  await S.goto(`${SITE}/incidents?city=1`);
  await S.waitForSelector('.qm-event-marker');
  await tiles(S);
  await S.evaluate(() => {
    const m = [...document.querySelectorAll('.qm-event-marker')].find((x) => /Қызылорда/.test(x.title)) || document.querySelector('.qm-event-marker');
    m.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await S.waitForSelector('.inc-pop h3');
  await sleep(900);
  await S.screenshot({ path: path.join(OUT, 'site-incidents.png') });
});
await step('site-map', async () => {
  await S.goto(`${SITE}/map?city=1`);
  await S.waitForSelector('.rq-card');
  await tiles(S);
  await S.screenshot({ path: path.join(OUT, 'site-map.png') });
});
await step('site-cities', async () => {
  await S.goto(`${SITE}/incidents?city=1`);
  await S.waitForSelector('#city-btn');
  await tiles(S);
  await S.click('#city-btn');
  await sleep(800);
  await S.screenshot({ path: path.join(OUT, 'site-cities.png') });
  await S.keyboard.press('Escape');
});
for (const lang of ['ru', 'en']) {
  await step(`site-${lang}`, async () => {
    await S.goto(`${SITE}/incidents?city=1`);
    await S.waitForSelector('.qm-event-marker');
    await S.click(`.lang-desktop [data-lang="${lang}"]`);
    await sleep(1200);
    await tiles(S, 4);
    await S.screenshot({ path: path.join(OUT, `site-${lang}.png`) });
    await S.click('.lang-desktop [data-lang="kk"]');
    await sleep(800);
  });
}
await step('site-event', async () => {
  await S.goto(`${SITE}/events/${flood.id}?city=62`);
  await S.waitForSelector('#needs-board, .needs-head');
  await tiles(S, 3);
  await S.screenshot({ path: path.join(OUT, 'site-event.png') });
  await S.locator('#needs-board').scrollIntoViewIfNeeded();
  await sleep(600);
  await S.screenshot({ path: path.join(OUT, 'site-needs.png') });
});
await step('site-report', async () => {
  await S.goto(`${SITE}/login?city=1`);
  await S.click('[data-demo="daniyar@demo.qamqormap.kz"]');
  await S.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  await S.goto(`${SITE}/incidents?city=1`);
  await S.waitForSelector('.qm-event-marker');
  await tiles(S);
  await S.click('#inc-add');
  await S.waitForSelector('.inc-note.is-pick');
  await sleep(500);
  await S.screenshot({ path: path.join(OUT, 'site-pick.png') });
  const box = await S.locator('#inc-map').boundingBox();
  await S.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await S.waitForSelector('#inc-form');
  await S.selectOption('#f-type', 'fire');
  await S.fill('#f-description', 'Демо мысал: дала жағында түтін көрінеді, адамдар жоқ сияқты.');
  await sleep(400);
  await S.screenshot({ path: path.join(OUT, 'site-report-form.png') });
  await S.click('dialog .dlg-foot .btn:last-child');
  await S.waitForSelector('.qm-report.is-mine', { timeout: 10000 });
  await sleep(1500);
  await S.screenshot({ path: path.join(OUT, 'site-report-done.png') });
});

// ───── Мобильді қосымша (Expo веб-нұсқасы) ─────
const app = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'kk-KZ' });
const A = await app.newPage();
const tid = (id) => A.locator(`[data-testid="${id}"]`).first();
const frame = (id) => A.frameLocator(`[data-testid="${id}-frame"]`);
const frameTiles = async (id) => {
  const f = A.frames().find((x) => x !== A.mainFrame());
  if (f) await tiles(f, 4); else await sleep(3000);
  void id;
};
await step('app-home', async () => {
  await A.goto(`${APP}/`);
  await sleep(2500);
  await frameTiles('home');
  await A.screenshot({ path: path.join(OUT, 'app-home.png') });
});
await step('app-incidents', async () => {
  await A.goto(`${APP}/incidents`);
  await tid('incidents-screen').waitFor({ timeout: 20000 });
  await frame('inc-map').locator('.ev').first().waitFor({ timeout: 15000 });
  await frameTiles('inc-map');
  await A.screenshot({ path: path.join(OUT, 'app-incidents.png') });
});
await step('app-sheet', async () => {
  await frame('inc-map').locator('.ev').nth(2).dispatchEvent('click');
  await tid('inc-sheet').waitFor({ timeout: 8000 });
  await sleep(700);
  await A.screenshot({ path: path.join(OUT, 'app-sheet.png') });
});
await step('app-report', async () => {
  await A.goto(`${APP}/profile`);
  await tid('demo-volunteer').waitFor({ timeout: 15000 });
  await tid('demo-volunteer').click();
  await tid('profile-card').waitFor({ timeout: 15000 });
  await A.goto(`${APP}/incidents`);
  await frame('inc-map').locator('.ev').first().waitFor({ timeout: 15000 });
  await frameTiles('inc-map');
  await tid('inc-add').click();
  await tid('inc-pick-note').waitFor();
  await sleep(400);
  await A.screenshot({ path: path.join(OUT, 'app-pick.png') });
  const box = await A.locator('[data-testid="inc-map-frame"]').boundingBox();
  await A.mouse.click(box.x + box.width * 0.30, box.y + box.height * 0.60);
  await tid('rep-point').waitFor({ timeout: 10000 });
  await tid('rep-type-fire').click();
  await tid('rep-desc').fill('Демо мысал: дала жағында түтін көрінеді, адамдар жоқ сияқты.');
  await sleep(500);
  await A.screenshot({ path: path.join(OUT, 'app-report.png') });
});

await browser.close();
fs.writeFileSync(path.join(OUT, 'README.md'), `# Презентация скриншоттары\n\nДемо дерекқор (оқу мысалдары). Түсірілген: ${new Date().toISOString()}\n\n${done.map((d) => `- ✔ ${d}`).join('\n')}\n${fail.map((d) => `- ✘ ${d}`).join('\n')}\n`);
console.log(`\n${done.length} дайын, ${fail.length} қате`);
