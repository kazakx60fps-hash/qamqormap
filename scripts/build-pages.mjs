// GitHub Pages үшін статикалық демо нұсқаны жинау.
//   node scripts/build-pages.mjs [--api http://localhost:3000] [--base /qamqormap] [--out dist-pages]
// Алдын ала демо сервер іске қосылған болуы керек (npm run demo:reset && npm run demo).
// Нәтиже: public/ көшірмесі + data/demo-snapshot.json (тек жария деректер) + 404.html (SPA маршруттары үшін).
// Ешқандай құпия (.env, құпиясөз, токен) нәтижеге кірмейді; жеке мекенжай, телефон, нақты координат, чат — жоқ.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const API = arg('api', process.env.PAGES_API || 'http://localhost:3000').replace(/\/+$/, '');
const BASE = ('/' + arg('base', process.env.PAGES_BASE || '/qamqormap').replace(/^\/+|\/+$/g, '')).replace(/^\/$/, '');
const OUT = path.resolve(root, arg('out', 'dist-pages'));
const REPO = arg('repo', process.env.PAGES_REPO || '');

async function get(p) {
  const r = await fetch(API + '/api' + p, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return r.json();
}

// Жария деректерде болмауы керек өрістер (қосымша сақтық: сервер оларды қонаққа бермейді)
const FORBIDDEN = ['exact_address', 'address', 'phone', 'lat', 'lng', 'contact_phone', 'email'];
function scrubRequest(r) {
  const o = { ...r };
  for (const k of ['exact_address', 'address', 'phone', 'contact_phone', 'email', 'lat', 'lng']) delete o[k];
  o.has_public_photo = false; // фотолар серверде сақталады, статикалық нұсқада көрсетілмейді
  return o;
}

console.log(`[pages] API: ${API}  base: ${BASE || '/'}  out: ${path.relative(root, OUT)}`);
const health = await get('/health');
if (!health.demo) console.warn('[pages] ЕСКЕРТУ: сервер демо режимде емес. Тек оқу деректерін жариялау үшін npm run demo қолданыңыз.');

const ref = {};
for (const p of ['/cities', '/categories', '/regions', '/disaster-types', '/map-config']) ref[p] = await get(p);

// Өтініштер (барлық жария, кез келген мәртебе)
const requests = [];
for (let offset = 0; ; offset += 200) {
  const page = await get(`/requests?status=all&limit=200&offset=${offset}`);
  requests.push(...page.items);
  if (requests.length >= page.total || !page.items.length) break;
}
const details = {};
for (const r of requests) {
  const d = await get(`/requests/${r.id}`);
  if (d.viewer?.can_see_private) throw new Error(`Қонақ ретінде жеке деректер ашылды: №${r.id}`);
  d.request = scrubRequest(d.request);
  d.attachments = [];
  details[r.id] = d;
}

const events = (await get('/events?limit=200')).items;
const eventDetails = {};
const needs = {};
for (const e of events) {
  const d = await get(`/events/${e.id}`);
  d.requests = (d.requests || []).map(scrubRequest);
  d.history = null;
  eventDetails[e.id] = d;
  const n = await get(`/events/${e.id}/needs`);
  n.items = n.items.map(scrubRequest);
  needs[e.id] = n;
}

const stats = { all: await get('/stats') };
for (const c of ref['/cities'].items) stats[c.id] = await get(`/stats?city_id=${c.id}`);

const snapshot = {
  generated_at: new Date().toISOString(),
  note: 'QamqorMap статикалық демо: тек оқу деректері, жеке мекенжай/телефон/нақты координат/чат жоқ.',
  ref, requests: requests.map(scrubRequest), details, events, eventDetails, needs, stats,
};

// Тексеру: снапшотта жеке өрістер жоқ
const json = JSON.stringify(snapshot);
for (const k of FORBIDDEN.filter((x) => !['lat', 'lng'].includes(x))) {
  if (json.includes(`"${k}":"`)) throw new Error(`Снапшотта тыйым салынған өріс бар: ${k}`);
}
for (const r of snapshot.requests) if ('lat' in r || 'lng' in r) throw new Error('Өтініштің нақты координаты снапшотқа кірді');

// Файлдарды көшіру
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'data', 'demo-snapshot.json'), json);

// Кэш: GitHub Pages файлдарды ~10 минут кэштейді. Жаңартудан кейін ескі JS/CSS жүктелмеуі үшін
// js/ мен css/ папкалары нұсқа белгісі бар атпен жарияланады (ішкі салыстырмалы импорттар өзгермейді).
const VER = (process.env.GITHUB_SHA || Date.now().toString(36)).slice(0, 10);
let html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
html = html.replace(/(href|src)="\/(js|css)\//g, `$1="/$2-${VER}/`);
html = html.replace(/(href|src)="\/(?!\/)/g, `$1="${BASE}/`);
for (const d of ['js', 'css']) fs.cpSync(path.join(OUT, d), path.join(OUT, `${d}-${VER}`), { recursive: true }); // ескі кэштегі HTML үшін түпнұсқа папкалар да қалады
html = html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n  <meta name="qm-base" content="${BASE}" />\n  <meta name="qm-static" content="1" />${REPO ? `\n  <meta name="qm-repo" content="${REPO}" />` : ''}`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, '404.html'), html); // GitHub Pages: /qamqormap/map сияқты маршруттар да ашылады
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
// Белгілі маршруттарға index.html көшірмесі — сілтеме тікелей ашылғанда да HTTP 200 қайтады
const routes = ['map', 'incidents', 'disasters', 'about', 'login', 'register', 'requests/new', 'dashboard', 'coordinator', 'org',
  ...events.map((e) => `events/${e.id}`), ...requests.map((r) => `requests/${r.id}`)];
for (const r of routes) {
  fs.mkdirSync(path.join(OUT, r), { recursive: true });
  fs.writeFileSync(path.join(OUT, r, 'index.html'), html);
}

const size = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB';
console.log(`[pages] Дайын: ${requests.length} өтініш, ${events.length} оқиға, ${Object.keys(stats).length} статистика. Снапшот: ${size('data/demo-snapshot.json')}`);
