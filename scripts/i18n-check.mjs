// Барлық беттерді үш тілде ашып, консоль қателерін, жетіспейтін аударма кілттерін
// және аралас тілді (интерфейсте басқа тілдің әріптері) тексереді.
//   BASE=http://localhost:3000 node scripts/i18n-check.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.OUT || '';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const KZ = /[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/;
const CYR = /[А-Яа-яЁё]/;
let problems = 0;

async function scan(page) {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('[data-ugc], [data-i18n-skip], script, style, .leaflet-tile-container, noscript').forEach((n) => n.remove());
    return clone.innerText;
  });
}

const PAGES = (process.env.PAGES || '/?city=1;/map?city=1;/map?city=56&dir=disaster;/disasters?city=all;/events/1?city=56;/requests/1?city=1;/about;/login;/register;/incidents;/incidents?g=fire&at=3').split(';');
const USERS = (process.env.USERS || ',coordinator@demo.qamqormap.kz,kzo.coord@demo.qamqormap.kz').split(',');
const AUTH_PAGES = ['/dashboard?city=1', '/dashboard?tab=notifications&city=1', '/dashboard?tab=profile&city=1', '/requests/new?city=1', '/coordinator?city=1', '/coordinator?view=reports&city=1', '/events/new?city=1', '/requests/2?city=1'];

for (const lang of ['kk', 'ru', 'en']) {
  for (const user of USERS) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript((l) => { try { localStorage.setItem('qm_lang', l); } catch {} }, lang);
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => {
      const tx = m.text();
      if (m.type() === 'error' && !/tile\.openstreetmap|ERR_|Failed to load resource/.test(tx)) errs.push(tx);
      if (m.type() === 'warning' && tx.includes('[i18n]')) errs.push(tx);
    });
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    if (user) {
      await page.goto(BASE + '/login');
      await page.fill('#f-email', user);
      await page.fill('#f-password', 'Demo12345');
      await page.click('#auth-form button[type=submit]');
      await page.waitForURL(/dashboard/);
      // Тіркелген қолданушы: тілді базаға сақтау үшін ауыстырғышты басамыз
      await page.click(`.lang-desktop [data-lang="${lang}"]`).catch(() => {});
      await page.waitForTimeout(400);
    }
    const ORG_PAGES = ['/org?city=62', '/org?city=62&tab=active', '/org?city=62&tab=review', '/org?city=62&tab=team', '/org?city=62&tab=report', `/events/${process.env.KZO_EVENT || 4}?city=62`];
    const list = user?.startsWith('kzo.') ? ORG_PAGES : user ? [...AUTH_PAGES] : PAGES;
    for (const p of list) {
      await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1300);
      const htmlLang = await page.evaluate(() => document.documentElement.lang);
      const text = await scan(page);
      const issues = [];
      if (htmlLang !== lang) issues.push(`html lang=${htmlLang}`);
      if (lang !== 'kk') {
        const lines = text.split('\n').filter((l) => KZ.test(l));
        if (lines.length) issues.push('KZ әріптері: ' + lines.slice(0, 3).join(' | '));
      }
      if (lang === 'en') {
        const lines = text.split('\n').filter((l) => CYR.test(l));
        if (lines.length) issues.push('кирилл: ' + lines.slice(0, 3).join(' | '));
      }
      if (OUT) await page.screenshot({ path: `${OUT}/${lang}-${user ? 'coord' : 'guest'}${p.replace(/[/?=&]+/g, '_')}.png` });
      if (issues.length || errs.length) {
        problems++;
        console.log(`✗ [${lang}${user ? ' coord' : ''}] ${p}\n   ${[...issues, ...errs].join('\n   ')}`);
        errs.length = 0;
      } else console.log(`✓ [${lang}${user ? ' coord' : ''}] ${p}`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(problems ? `Ақаулар: ${problems}` : 'Барлық бет таза: аралас аударма және консоль қатесі жоқ');
process.exit(problems ? 1 : 0);
