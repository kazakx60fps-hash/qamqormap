// Беттердің скриншоттары және консоль қателерін тексеру (Playwright қажет):
//   node scripts/screens.mjs
// Айнымалылар: BASE, OUT, PAGES="путь|атау;...", LOGIN=email, FULL=1
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3000';
const out = process.env.OUT || 'screenshots';
const pages = (process.env.PAGES || '/?city=1|home;/map?city=1|map;/requests/1?city=1|request;/about|about;/login|login')
  .split(';').map((x) => x.split('|'));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
for (const [vw, vh, tag] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
  if (process.env.ONLY && process.env.ONLY !== tag) continue;
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/cartocdn|ERR_|net::|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  if (process.env.LOGIN) {
    await page.goto(BASE + '/login');
    await page.fill('#f-email', process.env.LOGIN);
    await page.fill('#f-password', 'Demo12345');
    await page.click('#auth-form button[type=submit]');
    await page.waitForURL(/dashboard/);
  }
  for (const [path, name] of pages) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/${name}-${tag}.png`, fullPage: process.env.FULL === '1' });
  }
  console.log(tag, errs.length ? errs : 'консольде қате жоқ');
  await ctx.close();
}
await browser.close();
