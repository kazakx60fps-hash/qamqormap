// Мобильді қосымшаның (Expo веб-нұсқасы, телефон көрінісі 390×844) толық сценарийі ортақ API-ға қарсы.
// Алдын ала: демо сервер (CORS_ORIGINS=http://localhost:8081 npm run demo) және `node mobile/scripts/serve-web.mjs`.
// Іске қосу: node mobile/scripts/e2e-web.mjs   (кейін демо дерекқорды тазалаңыз: npm run demo:reset)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PW = process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const APP = process.env.APP_URL || 'http://localhost:8081';
const API = process.env.API_URL || 'http://localhost:3000';
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(here, '../../screenshots/mobile');
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const results = [];
const errors = [];
let step = 0;
async function check(name, fn) {
  step++;
  try {
    await fn();
    results.push(`✔ ${step}. ${name}`);
    console.log(`✔ ${step}. ${name}`);
  } catch (e) {
    results.push(`✘ ${step}. ${name}: ${e.message.split('\n')[0]}`);
    console.log(`✘ ${step}. ${name}: ${e.message}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

async function newPhone(name, { width = 390, height = 844 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'kk-KZ' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] PAGEERROR ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY|tile\.openstreetmap/i.test(m.text()) && !(name === 'offline' && /ERR_CONNECTION_REFUSED/.test(m.text()))) errors.push(`[${name}] ${m.text().slice(0, 240)}`);
  });
  return { ctx, page };
}
const tid = (p, id) => p.locator(`[data-testid="${id}"]`).first();
const tap = async (p, id) => { await tid(p, id).click(); };
const fill = async (p, id, v) => { await tid(p, id).fill(v); };
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, `${n}.png`) });
const visible = (p, id, timeout = 10000) => tid(p, id).waitFor({ state: 'visible', timeout });
const text = (p) => p.evaluate(() => document.body.innerText);
const apiGet = async (p) => (await fetch(API + '/api' + p)).json();

/** Көрінетін интерфейс мәтіні (қолданушы мәтіні мен жергілікті атаулардан басқа) */
async function uiText(p) {
  return p.evaluate(() => {
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 3) { if (n.textContent.trim()) out.push(n.textContent.trim()); return; }
      if (n.nodeType !== 1) return;
      const el = n;
      if (el.closest('[data-ugc],[data-local]') || el.tagName === 'IFRAME' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      for (const c of el.childNodes) walk(c);
      if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.placeholder) out.push(el.placeholder);
    };
    walk(document.body);
    return out.join(' | ');
  });
}
async function demoLogin(p, role) {
  await p.goto(`${APP}/profile`);
  await visible(p, `demo-${role}`);
  await tap(p, `demo-${role}`);
  await visible(p, 'profile-card');
}
async function tapMap(p, frameId, xFrac = 0.5, yFrac = 0.5) {
  const fr = p.locator(`[data-testid="${frameId}-frame"]`);
  await fr.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const box = await fr.boundingBox();
  await p.mouse.click(box.x + box.width * xFrac, box.y + box.height * yFrac);
}

const G = await newPhone('guest');
const A = await newPhone('author');
const V = await newPhone('volunteer');
const K = await newPhone('coordinator');
let reqId = null;
let disReqId = null;
const stamp = Date.now().toString().slice(-5);
const TITLE = `Мобильден: дәріханадан дәрі әкелу ${stamp}`;

// ───── 1. Карта, тілдер, қалалар ─────
await check('басты экран — карта; жоғарыда қала, іздеу, бағыт сүзгілері; әдепкі тіл қазақша', async () => {
  await G.page.goto(APP);
  await visible(G.page, 'map-screen', 20000);
  await visible(G.page, 'sheet-state-mid');
  assert(await G.page.evaluate(() => document.documentElement.lang) === 'kk', 'html lang kk емес');
  assert(await tid(G.page, 'search-input').getAttribute('placeholder') === 'Көмек немесе қала іздеу', 'іздеу жазуы');
  for (const id of ['city-button', 'dir-all', 'dir-everyday', 'dir-disaster', 'filters-button', 'tab-index', 'tab-requests', 'fab-add', 'tab-notifications', 'tab-profile']) await visible(G.page, id);
  await G.page.waitForTimeout(800);
  await shot(G.page, 'kk-map-mid');
});

await check('тіл ауысады (KK → RU → EN), сүзгі мен қала сақталады, аралас аударма жоқ', async () => {
  await tap(G.page, 'dir-disaster');
  await visible(G.page, 'emergency-notice');
  await tap(G.page, 'lang-home-ru');
  assert(await G.page.evaluate(() => document.documentElement.lang) === 'ru', 'html lang ru емес');
  assert(await tid(G.page, 'search-input').getAttribute('placeholder') === 'Поиск помощи или города', 'ru жазуы');
  assert(await tid(G.page, 'dir-disaster').getAttribute('aria-selected') === 'true', 'ru: «Табиғи апаттар» сүзгісі сақталмады');
  const ru = await uiText(G.page);
  const kz = ru.match(/[^|]*[әғқңөұүһі][^|]*/i);
  assert(!kz, `RU интерфейсінде қазақ әрпі: ${kz?.[0]}`);
  await shot(G.page, 'ru-map-disaster');
  await tap(G.page, 'lang-home-en');
  assert(await G.page.evaluate(() => document.documentElement.lang) === 'en', 'html lang en емес');
  const en = await uiText(G.page);
  const cyr = en.match(/[^|]*[Ѐ-ӿ][^|]*/);
  assert(!cyr, `EN интерфейсінде кириллица: ${cyr?.[0]}`);
  assert((await tid(G.page, 'city-button').innerText()).includes('Astana'), 'EN: қала атауы аударылмады');
  await shot(G.page, 'en-map-disaster');
  await tap(G.page, 'lang-home-kk');
  await tap(G.page, 'dir-all');
});

await check('қалалар анықтамалығы толық: іздеу қазақша/орысша/латынша, облыс бойынша топтау, «Бүкіл Қазақстан»', async () => {
  const total = (await apiGet('/cities')).items.length;
  assert(total >= 80, `қала саны аз: ${total}`);
  await tap(G.page, 'city-button');
  await visible(G.page, 'city-picker');
  assert((await text(G.page)).includes(`${total} елді мекен`), 'анықтамалықтағы қала саны көрсетілмеді');
  for (const q of ['Oskemen', 'Усть-Каменогорск', 'Өскемен']) {
    await fill(G.page, 'city-search', q);
    await G.page.waitForTimeout(150);
    assert((await tid(G.page, 'city-picker').innerText()).includes('Өскемен'), `«${q}» бойынша Өскемен табылмады`);
  }
  await fill(G.page, 'city-search', '');
  await shot(G.page, 'kk-city-picker');
  await tap(G.page, 'city-all');
  assert((await tid(G.page, 'city-button').innerText()).includes('Бүкіл Қазақстан'), '«Бүкіл Қазақстан» таңдалмады');
  await G.page.waitForTimeout(600);
  const allTitle = await tid(G.page, 'sheet').innerText();
  assert(/Бүкіл Қазақстан: \d+ өтініш/.test(allTitle), 'панель тақырыбы жаңармады');
  await tap(G.page, 'city-button');
  await fill(G.page, 'city-search', 'Қостанай');
  await G.page.locator('[data-testid^="city-"]').filter({ hasText: 'Қостанай' }).first().click();
  await G.page.waitForTimeout(800);
  assert((await tid(G.page, 'sheet').innerText()).includes('Қостанай'), 'Қостанай таңдалмады');
});

await check('іздеу жолы: қала ұсынысы және өтініштерді мәтінмен іздеу', async () => {
  await fill(G.page, 'search-input', 'Астан');
  await visible(G.page, 'search-suggest');
  await tap(G.page, 'suggest-city-1');
  await G.page.waitForTimeout(800);
  assert((await tid(G.page, 'city-button').innerText()).includes('Астана'), 'ұсыныстан қала таңдалмады');
});

await check('төменгі панельдің үш күйі және «Карта / Тізім» ауыстырғышы батырмалармен', async () => {
  await visible(G.page, 'sheet-state-mid');
  await tap(G.page, 'sheet-up');
  await visible(G.page, 'sheet-state-expanded');
  assert(await tid(G.page, 'view-toggle-list').getAttribute('aria-selected') === 'true', 'толық күйде «Тізім» таңдалмады');
  await shot(G.page, 'kk-sheet-expanded');
  await tap(G.page, 'sheet-down');
  await visible(G.page, 'sheet-state-mid');
  await tap(G.page, 'sheet-down');
  await visible(G.page, 'sheet-state-collapsed');
  assert((await tid(G.page, 'sheet').innerText()).match(/\d+ өтініш/), 'жиналған күйде тақырып пен сан жоқ');
  await visible(G.page, 'zoom-in');
  await shot(G.page, 'kk-sheet-collapsed');
  await tap(G.page, 'view-toggle-list');
  await visible(G.page, 'sheet-state-expanded');
  await tap(G.page, 'view-toggle-map');
  await visible(G.page, 'sheet-state-mid');
});

await check('карта мен тізім байланысы: белгі → карточка, карточка → белгі', async () => {
  const frame = G.page.frameLocator('[data-testid="map-frame"]');
  await frame.locator('.rq').first().waitFor({ timeout: 20000 });
  await frame.locator('.rq').first().evaluate((el) => el.click());
  await visible(G.page, 'selected-card');
  const txt = await tid(G.page, 'selected-card').innerText();
  assert(/Толығырақ/.test(txt), 'таңдалған карточкада «Толығырақ» жоқ');
  await shot(G.page, 'kk-marker-selected');
  // Тізімнен басқа карточканы таңдау → картадағы белгі ерекшеленеді
  const card = G.page.locator('[data-testid^="req-card-"]').first();
  const id = (await card.getAttribute('data-testid')).replace('req-card-', '');
  await card.click();
  await G.page.waitForTimeout(500);
  const sel = await frame.locator('.rq.sel').count();
  assert(sel === 1, 'тізімнен таңдағанда белгі ерекшеленбеді');
  assert((await tid(G.page, 'selected-card').getAttribute('data-testid')) === 'selected-card', 'таңдалған карточка жоқ');
  console.log('   таңдалған өтініш', id);
});

await check('табиғи оқиғалар картада ромб белгімен; оқиға карточкасы және байланысты өтініштер', async () => {
  await G.page.goto(`${APP}/`);
  await visible(G.page, 'map-screen');
  await tap(G.page, 'dir-disaster');
  const frame = G.page.frameLocator('[data-testid="map-frame"]');
  await frame.locator('.ev').first().waitFor({ timeout: 10000 });
  assert(await frame.locator('.ev .demo').count() > 0, 'оқу мысалы белгісі картада жоқ');
  await frame.locator('.ev').first().evaluate((el) => el.click());
  await visible(G.page, 'selected-card');
  const t = await tid(G.page, 'selected-card').innerText();
  assert(/Оқу мысалы/.test(t), 'оқиға карточкасында «Оқу мысалы» жоқ');
  assert(/Тексерілмеген|Координатор тексерді/.test(t), 'тексеру мәртебесі жоқ');
  assert(/Жаңартылды/.test(t), 'жаңарту уақыты жоқ');
  await shot(G.page, 'kk-event-selected');
  await tap(G.page, 'selected-event-requests');
  await visible(G.page, 'event-filter');
  await tap(G.page, 'event-filter-clear');
});

// ───── 2. Толық цикл ─────
await check('демо-кіру: автор, ерікті, координатор — серверлік сессия', async () => {
  await demoLogin(A.page, 'author');
  await demoLogin(V.page, 'volunteer');
  await demoLogin(K.page, 'coordinator');
  await visible(K.page, 'role-coordinator');
  await shot(K.page, 'kk-profile-coordinator');
});

await check('жаңа өтініш: қала қойылған, тіл ауысқанда енгізілген мәтін сақталады, тексеруге жіберіледі', async () => {
  await A.page.goto(`${APP}/`);
  await visible(A.page, 'fab-add');
  await tap(A.page, 'fab-add');
  await visible(A.page, 'request-form');
  assert((await tid(A.page, 'f-city').innerText()).includes('Астана'), 'қала қойылмады');
  await tap(A.page, 'cat-food');
  await fill(A.page, 'f-title', TITLE);
  await fill(A.page, 'f-description', 'Қарт кісіге дәріханадан рецепт бойынша дәрі әкелу керек, тізімді өзі береді.');
  await tap(A.page, 'lang-form-ru');
  assert(await tid(A.page, 'f-title').inputValue() === TITLE, 'тіл ауысқанда тақырып жоғалды');
  assert((await text(A.page)).includes('Попросить помощь'), 'форма орысшаға ауыспады');
  await shot(A.page, 'ru-request-form');
  await tap(A.page, 'lang-form-kk');
  await tap(A.page, 'day-d1');
  await tap(A.page, 'slot-evening');
  await tapMap(A.page, 'f-map', 0.55, 0.45);
  await A.page.waitForTimeout(300);
  assert((await tid(A.page, 'f-point-state').innerText()).includes('Нүкте таңдалды'), 'нүкте таңдалмады');
  await fill(A.page, 'f-address', 'Тест көшесі 7, 15-пәтер');
  await fill(A.page, 'f-phone', '+7 701 555 66 77');
  await tap(A.page, 'form-submit');
  await visible(A.page, 'alert-pending', 15000);
  reqId = Number(A.page.url().match(/request\/(\d+)/)[1]);
  assert(reqId > 0, 'өтініш нөмірі жоқ');
  await shot(A.page, 'kk-request-pending');
});

await check('модерация: координатор кезекте көреді және себебімен түзетуге қайтарады', async () => {
  await K.page.goto(`${APP}/coordinator`);
  await visible(K.page, `coord-req-${reqId}`, 15000);
  await shot(K.page, 'kk-coordinator-queue');
  await tap(K.page, `coord-req-${reqId}`);
  await visible(K.page, 'reject');
  await tap(K.page, 'reject');
  await fill(K.page, 'reject-dlg-input', 'Дәрінің атауын және уақытын нақтылаңыз');
  await tap(K.page, 'reject-dlg-ok');
  await visible(K.page, 'moderation-rejected');
});

await check('автор себебін көреді, түзетіп, қайта жібереді; координатор жариялайды', async () => {
  await A.page.goto(`${APP}/request/${reqId}`);
  await visible(A.page, 'alert-rejected');
  assert((await tid(A.page, 'alert-rejected').innerText()).includes('Дәрінің атауын'), 'себеп көрінбейді');
  await tap(A.page, 'edit');
  await visible(A.page, 'request-form');
  await A.page.waitForTimeout(500);
  await fill(A.page, 'f-description', 'Қарт кісіге дәріханадан парацетамол мен витамин әкелу керек, ертең 18:00-ден кейін.');
  await tap(A.page, 'form-submit');
  await visible(A.page, 'alert-pending', 15000);
  await K.page.goto(`${APP}/request/${reqId}`);
  await visible(K.page, 'approve');
  await tap(K.page, 'approve');
  await K.page.waitForFunction(() => document.querySelector('[data-testid="history"]')?.innerText.includes('Координатор бекітті'), null, { timeout: 10000 });
  const hist = await tid(K.page, 'history').innerText();
  for (const s of ['Түзетуге қайтарылды', 'Түзетіліп, қайта жіберілді', 'Координатор бекітті']) assert(hist.includes(s), `тарихта «${s}» жоқ`);
});

await check('жеке деректер: бөгдеге және ұсыныс жіберген еріктіге мекенжай жабық', async () => {
  await G.page.goto(`${APP}/request/${reqId}`);
  await visible(G.page, 'private-locked');
  assert(!(await text(G.page)).includes('Тест көшесі 7'), 'қонаққа мекенжай көрінді');
  await V.page.goto(`${APP}/request/${reqId}`);
  await visible(V.page, 'apply');
  await tap(V.page, 'apply');
  await fill(V.page, 'apply-msg', 'Ертең кешке әкеле аламын');
  await tap(V.page, 'apply-ok');
  await visible(V.page, 'offer-sent');
  assert(!(await text(V.page)).includes('Тест көшесі 7'), 'ұсыныс жіберген еріктіге мекенжай көрінді');
});

await check('автор орындаушыны таңдайды; енді ерікті мекенжай мен телефонды көреді', async () => {
  await A.page.goto(`${APP}/request/${reqId}`);
  const btn = A.page.locator('[data-testid^="assign-"]').first();
  await btn.waitFor({ timeout: 10000 });
  await btn.click();
  await tap(A.page, 'assign-dlg-ok');
  await visible(A.page, 'status-assigned');
  await V.page.goto(`${APP}/request/${reqId}`);
  await visible(V.page, 'private-address');
  assert((await tid(V.page, 'private-address').innerText()).includes('Тест көшесі 7'), 'орындаушыға мекенжай ашылмады');
  assert((await tid(V.page, 'private-phone').innerText()).includes('701'), 'телефон ашылмады');
  await shot(V.page, 'kk-request-assignee-private');
});

await check('чат: тек қатысушылар; оқылмаған саны және «Оқылды» күйі сақталады', async () => {
  await tap(V.page, 'open-chat');
  await visible(V.page, 'chat-input');
  await fill(V.page, 'chat-input', 'Сәлеметсіз бе! Ертең 18:30-да барамын.');
  await tap(V.page, 'chat-send');
  await visible(V.page, 'msg-sent');
  await G.page.goto(`${APP}/chat/${reqId}`);
  await G.page.waitForTimeout(1500);
  assert(!(await text(G.page)).includes('18:30-да барамын'), 'қонаққа чат көрінді');
  await A.page.goto(`${APP}/notifications`);
  await tap(A.page, 'notif-seg-chats');
  await visible(A.page, `chat-item-${reqId}`);
  assert(/\b1\b/.test(await tid(A.page, `chat-item-${reqId}`).innerText()), 'оқылмаған хат саны көрсетілмеді');
  await tap(A.page, `chat-item-${reqId}`);
  await visible(A.page, 'msg-theirs');
  await shot(A.page, 'kk-chat');
  await visible(V.page, 'msg-read', 12000);
  await A.page.goto(`${APP}/notifications`);
  await tap(A.page, 'notif-seg-chats');
  await visible(A.page, `chat-item-${reqId}`);
  assert(!/\b1\b$/.test((await tid(A.page, `chat-item-${reqId}`).innerText()).trim()), 'оқылғаннан кейін де сан тұр');
});

await check('орындау → автор растайды → статистика бір рет жаңарады', async () => {
  const before = (await apiGet('/stats?city_id=1')).completed;
  await V.page.goto(`${APP}/request/${reqId}`);
  await tap(V.page, 'start');
  await visible(V.page, 'status-in_progress');
  await tap(V.page, 'done');
  await fill(V.page, 'report-dlg-input', 'Дәрі жеткізілді');
  await tap(V.page, 'report-dlg-ok');
  await visible(V.page, 'status-awaiting_confirmation');
  await A.page.goto(`${APP}/request/${reqId}`);
  await tap(A.page, 'confirm');
  await tap(A.page, 'confirm-dlg-ok');
  await visible(A.page, 'alert-completed');
  const after = (await apiGet('/stats?city_id=1')).completed;
  assert(after === before + 1, `статистика: ${before} → ${after}`);
  await A.page.goto(`${APP}/`);
  await visible(A.page, 'intro-block');
  assert((await tid(A.page, 'intro-block').innerText()).includes(String(after)), 'картадағы статистика жаңармады');
  await shot(A.page, 'kk-request-completed-stats');
});

await check('хабарламалар алушының тілінде және оқылу күйі сақталады', async () => {
  await A.page.goto(`${APP}/notifications`);
  await visible(A.page, 'notif-seg');
  await A.page.waitForTimeout(500);
  const kk = await text(A.page);
  assert(kk.includes('Өтінішіңіз жарияланды') || kk.includes('Жаңа көмек ұсынысы'), 'хабарлама жоқ');
  await A.page.goto(`${APP}/profile`);
  await tap(A.page, 'lang-profile-en');
  await A.page.goto(`${APP}/notifications`);
  await A.page.waitForTimeout(800);
  const en = await text(A.page);
  assert(en.includes('Your request is published'), 'хабарлама ағылшыншаға аударылмады');
  await shot(A.page, 'en-notifications');
  if (await tid(A.page, 'read-all').count()) await tap(A.page, 'read-all');
  await A.page.waitForTimeout(800);
  const s = await A.page.evaluate(async (api) => (await fetch(api + '/api/me/summary', { headers: { Authorization: 'Bearer ' + localStorage.getItem('qm_token'), 'X-Client': 'mobile' } })).json(), API);
  assert(s.unread === 0, `оқылмаған қалды: ${s.unread}`);
  const me = await A.page.evaluate(async (api) => (await fetch(api + '/api/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('qm_token') } })).json(), API);
  assert(me.user.preferred_lang === 'en', 'тіл профильде (PostgreSQL) сақталмады');
  await A.page.goto(`${APP}/profile`);
  await tap(A.page, 'lang-profile-kk');
});

// ───── 3. Табиғи апат ─────
let eventId = null;
await check('оқиға беті: түрі, облысы, аумағы, жаңарту, дереккөз, тексеру, «Көмек қажет» / «Көмектескім келеді»', async () => {
  const ev = (await apiGet('/events?city_id=1&activity=active')).items.find((e) => e.is_demo);
  eventId = ev.id;
  await A.page.goto(`${APP}/event/${eventId}`);
  await visible(A.page, 'event-screen');
  await visible(A.page, 'event-demo-banner');
  await visible(A.page, 'verify-explain');
  const t = await text(A.page);
  for (const s of ['Апат түрі', 'Облыс', 'Аумағы', 'Соңғы жаңарту', 'Дереккөз', '112']) assert(t.includes(s), `оқиға бетінде «${s}» жоқ`);
  await visible(A.page, 'event-need-help');
  await visible(A.page, 'event-want-help');
  await shot(A.page, 'kk-event');
});

await check('«Көмек қажет» → оқиғаға байланысқан өтініш; апат санаты міндетті', async () => {
  await tap(A.page, 'event-need-help');
  await visible(A.page, 'request-form');
  await A.page.waitForTimeout(800);
  await visible(A.page, 'form-disaster-note');
  assert(await tid(A.page, 'cat-food').count() === 0, 'оқиға таңдалғанда күнделікті санаттар көрінбеуі керек');
  await tap(A.page, 'cat-water_food');
  await fill(A.page, 'f-title', `Боран: ауыз су жеткізу ${stamp}`);
  await fill(A.page, 'f-description', 'Боран кезінде үйден шыға алмай отырған отбасыға 20 литр ауыз су жеткізу керек.');
  await tapMap(A.page, 'f-map', 0.5, 0.5);
  await fill(A.page, 'f-address', 'Тест көшесі 9, 3-пәтер');
  await fill(A.page, 'f-phone', '87015550011');
  await tap(A.page, 'form-submit');
  await visible(A.page, 'alert-pending', 15000);
  disReqId = Number(A.page.url().match(/request\/(\d+)/)[1]);
  await visible(A.page, 'request-event');
  await K.page.goto(`${APP}/request/${disReqId}`);
  await tap(K.page, 'approve');
  await K.page.waitForFunction(() => !document.querySelector('[data-testid="moderation-pending"]'), null, { timeout: 10000 });
  await G.page.goto(`${APP}/event/${eventId}`);
  await visible(G.page, `req-card-${disReqId}`, 10000);
});

await check('апат өтінішіне ұсыныс тек қауіпсіздік ережесін растағаннан кейін', async () => {
  await V.page.goto(`${APP}/request/${disReqId}?apply=1`);
  await visible(V.page, 'apply-dlg');
  await tap(V.page, 'apply-ok');
  await visible(V.page, 'safety-error');
  await shot(V.page, 'kk-safety-ack');
  await tap(V.page, 'safety-ack');
  await tap(V.page, 'apply-ok');
  await visible(V.page, 'offer-sent');
});

await check('координатор оқиғаны тексерді деп белгілейді; тарих сақталады; қарапайым қолданушыда басқару жоқ', async () => {
  await K.page.goto(`${APP}/event/${eventId}`);
  await visible(K.page, 'event-verify');
  const wasVerified = (await text(K.page)).includes('Тексерілмеген деп белгілеу');
  await tap(K.page, 'event-verify');
  await tap(K.page, 'verify-dlg-ok');
  await K.page.waitForTimeout(800);
  await visible(K.page, wasVerified ? 'verify-unverified' : 'verify-verified');
  await visible(K.page, 'event-history');
  await A.page.goto(`${APP}/event/${eventId}`);
  await visible(A.page, 'event-screen');
  assert(await tid(A.page, 'event-edit').count() === 0, 'қарапайым қолданушыда оқиғаны өңдеу батырмасы бар');
  // қайтару
  await tap(K.page, 'event-verify');
  await tap(K.page, 'verify-dlg-ok');
});

await check('координатор жаңа оқиға жасайды (бірнеше қала + облыс)', async () => {
  await K.page.goto(`${APP}/event-form`);
  await visible(K.page, 'event-form');
  await tap(K.page, 'ev-type-flood');
  await fill(K.page, 'ev-title', `Оқу жаттығуы: су тасқыны ${stamp}`);
  await fill(K.page, 'ev-desc', 'Мобильді қосымшадан жасалған тексеру оқиғасы.');
  await tap(K.page, 'ev-region-akm');
  await tap(K.page, 'ev-add-city');
  await fill(K.page, 'city-search', 'Астана');
  await tap(K.page, 'city-1');
  await tap(K.page, 'ev-save');
  await visible(K.page, 'event-screen', 15000);
  assert((await text(K.page)).includes(`Оқу жаттығуы: су тасқыны ${stamp}`), 'жаңа оқиға ашылмады');
});

// ───── 4. Сақталу және сайтпен үйлесімділік ─────
await check('қосымшаны қайта ашқанда сессия мен деректер сақталады', async () => {
  await A.page.close();
  A.page = await A.ctx.newPage();
  await A.page.goto(`${APP}/requests?seg=mine`);
  await visible(A.page, `req-card-${reqId}`, 15000);
  await A.page.goto(`${APP}/profile`);
  await visible(A.page, 'profile-card');
});

await check('мобильден жасалған өтініш сайтта сол API арқылы көрінеді', async () => {
  const site = await browser.newPage();
  await site.goto(`${API}/requests/${reqId}`, { waitUntil: 'networkidle' });
  await site.waitForTimeout(800);
  const t = await site.evaluate(() => document.body.innerText);
  assert(t.includes(TITLE), 'сайтта өтініш көрінбеді');
  assert(t.includes('Аяқталды') || t.includes('расталды'), 'сайтта мәртебе «Аяқталды» емес');
  await site.screenshot({ path: path.join(SHOTS, 'site-shows-mobile-request.png') });
  await site.close();
});

// ───── 5. Тар экран, басу аймақтары ─────
await check('тар экран (320×640): көлденең айналу жоқ, басты батырмалар ≥ 40 px', async () => {
  const N = await newPhone('narrow', { width: 320, height: 640 });
  await N.page.goto(APP);
  await visible(N.page, 'map-screen', 20000);
  const ov = await N.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(ov <= 0, `көлденең айналу ${ov}px`);
  for (const id of ['tab-index', 'tab-requests', 'fab-add', 'tab-notifications', 'tab-profile', 'filters-button', 'city-button', 'zoom-in', 'sheet-up']) {
    const b = await tid(N.page, id).boundingBox();
    assert(b && b.height >= 40 && b.width >= 40, `${id}: ${b?.width}×${b?.height}`);
  }
  await shot(N.page, 'kk-narrow-320');
  await N.page.goto(`${APP}/disasters`);
  await visible(N.page, 'emergency-full');
  await shot(N.page, 'kk-narrow-disasters');
  await N.ctx.close();
});

await check('сервер қолжетімсіз: қате күйі, «Қайталау» және сервер мекенжайын баптау арқылы қалпына келу', async () => {
  const E = await newPhone('offline');
  await E.page.goto(APP);
  await E.page.evaluate(() => localStorage.setItem('qm_api_url', 'http://localhost:3999'));
  await E.page.reload();
  await visible(E.page, 'state-error', 30000);
  await visible(E.page, 'retry');
  await shot(E.page, 'kk-server-error');
  await tap(E.page, 'open-settings');
  await fill(E.page, 'api-url', API);
  await tap(E.page, 'api-check');
  await visible(E.page, 'api-ok');
  await tap(E.page, 'api-save');
  await visible(E.page, 'map-screen', 20000);
  await E.ctx.close();
});

for (const x of [G, A, V, K]) await x.ctx.close().catch(() => {});
await browser.close();
console.log('\n' + results.join('\n'));
const fatal = errors.filter((e) => !/Failed to load resource.*(404|403|409|400)/.test(e));
console.log(fatal.length ? `\nКонсоль қателері (${fatal.length}):\n${fatal.slice(0, 20).join('\n')}` : '\nКонсольде қате жоқ');
const failed = results.filter((r) => r.startsWith('✘')).length;
console.log(`\nНәтиже: ${results.length - failed}/${results.length} қадам өтті`);
process.exit(failed ? 1 : 0);
