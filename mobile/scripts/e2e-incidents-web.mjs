// Мобильді қосымша (Expo веб-нұсқасы, 390×844): «Оқиғалар картасы» экраны.
// Алдын ала: npm run demo:reset && CORS_ORIGINS=http://localhost:8081 npm run demo; npx expo export --platform web --output-dir dist-web; node mobile/scripts/serve-web.mjs
// Іске қосу: node mobile/scripts/e2e-incidents-web.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright/index.mjs');
const APP = process.env.APP_URL || 'http://localhost:8081';
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../screenshots/mobile');
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const results = [], errors = [];
let n = 0;
async function check(name, fn) {
  n++;
  try { await fn(); results.push(`✔ ${n}. ${name}`); } catch (e) { results.push(`✘ ${n}. ${name}: ${e.message.split('\n')[0]}`); }
  console.log(results.at(-1));
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_PROXY|tile\.openstreetmap/.test(m.text())) errors.push(m.text().slice(0, 200)); });
const tid = (id) => p.locator(`[data-testid="${id}"]`).first();
const frame = () => p.frameLocator('[data-testid="inc-map-frame"]');

await check('экран ашылады: түр сүзгілері санымен, карта, «Бүкіл Қазақстан»', async () => {
  await p.goto(`${APP}/incidents`);
  await tid('incidents-screen').waitFor({ timeout: 20000 });
  await tid('inc-g-all').waitFor();
  for (const g of ['fire', 'flood', 'earthquake', 'accident', 'misc']) await tid(`inc-g-${g}`).waitFor();
  assert((await tid('inc-city').innerText()).includes('Бүкіл Қазақстан'), 'Қазақстан көрінісі емес');
  await frame().locator('.ev').first().waitFor({ timeout: 15000 });
  const total = await frame().locator('.ev').count();
  assert(total >= 5, `белгілер саны ${total}`);
});

await check('тайлдар жүктелмесе: офлайн демо карта (шекара) және ескерту', async () => {
  await tid('inc-offline').waitFor({ timeout: 16000 });
  assert(await frame().locator('.leaflet-off-pane path').count() > 3, 'шекара сызылмады');
  await p.screenshot({ path: path.join(SHOTS, 'kk-incidents-map-mobile.png') });
  const r = await p.evaluate(() => {
    const rect = (id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
    const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const note = rect('inc-offline');
    return ['inc-zoom-in', 'inc-zoom-out', 'inc-reset', 'inc-add', 'inc-city'].filter((id) => hit(note, rect(id)));
  });
  assert(!r.length, `ескерту жабады: ${r.join(', ')}`);
});

await check('белгіні басқанда төменгі карточка ашылады', async () => {
  await frame().locator('.ev').first().dispatchEvent('click');
  await tid('inc-sheet').waitFor({ timeout: 8000 });
  await tid('inc-open').waitFor();
  await p.screenshot({ path: path.join(SHOTS, 'kk-incidents-sheet-mobile.png') });
});

await check('«Өрт» сүзгісі белгілерді азайтады; «Тізім» көрінісі', async () => {
  const all = await frame().locator('.ev').count();
  await tid('inc-g-fire').click();
  await p.waitForTimeout(600);
  const fire = await frame().locator('.ev').count();
  assert(fire > 0 && fire < all, `өрт ${fire} / барлығы ${all}`);
  await p.locator('[data-testid="inc-view"] [role="button"], [data-testid="inc-view"] div[tabindex]').last().click();
  await tid('inc-list').waitFor();
  assert((await tid('inc-list').innerText()).includes('Оқу мысалы'), 'оқу мысалы белгісі жоқ');
  await tid('inc-g-all').click();
});

await check('жаңа хабарлама: картадан нүкте → форма (нүкте, жақын қала) → жіберу → «тексеруде» белгісі', async () => {
  await p.goto(`${APP}/profile`);
  await tid('demo-volunteer').waitFor({ timeout: 15000 });
  await tid('demo-volunteer').click();
  await tid('profile-card').waitFor({ timeout: 15000 });
  await p.goto(`${APP}/incidents`);
  await frame().locator('.ev').first().waitFor({ timeout: 15000 });
  await tid('inc-add').click();
  await tid('inc-pick-note').waitFor();
  const box = await p.locator('[data-testid="inc-map-frame"]').boundingBox();
  await p.mouse.click(box.x + box.width * 0.30, box.y + box.height * 0.60);
  await tid('rep-point').waitFor({ timeout: 10000 });
  await tid('rep-type-fire').click();
  await tid('rep-desc').fill('Оқу тексеруі: далада түтін көрінеді, адамдар жоқ.');
  await tid('report-send').click();
  await tid('incidents-screen').waitFor({ timeout: 15000 });
  await frame().locator('.rp.mine').first().waitFor({ timeout: 15000 });
  await p.screenshot({ path: path.join(SHOTS, 'kk-incidents-report-mobile.png') });
});

await browser.close();
console.log('\n' + results.join('\n'));
console.log(errors.length ? `\nКонсоль қателері:\n${[...new Set(errors)].slice(0, 10).join('\n')}` : '\nКонсольде қате жоқ');
const failed = results.filter((r) => r.startsWith('✘')).length;
console.log(`Нәтиже: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
