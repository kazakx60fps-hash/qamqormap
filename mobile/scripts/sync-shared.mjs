// Сайт пен мобильді қосымшаға ортақ деректерді көшіреді:
//   • kk/ru/en сөздіктері (статустар, санаттар, қате кодтары, хабарламалар — бір кілттер жүйесі)
//   • иконкалар (бір сызықтық стиль)
//   • Leaflet картасы (WebView ішінде офлайн жүктеледі)
// Іске қосу: node scripts/sync-shared.mjs   (тексеру: node scripts/sync-shared.mjs --check)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const root = path.resolve(mobile, '..');
const out = path.join(mobile, 'src', 'shared');
const check = process.argv.includes('--check');

const HEADER = '// АВТОМАТТЫ ТҮРДЕ ЖАСАЛҒАН ФАЙЛ — қолмен өзгертпеңіз. Көзі: сайттың public/ папкасы (npm run sync).\n';

async function build() {
  const files = {};
  for (const l of ['kk', 'ru', 'en']) {
    const dict = (await import(pathToFileURL(path.join(root, 'public/js/i18n', `${l}.js`)).href)).default;
    files[`i18n-${l}.js`] = `${HEADER}export default ${JSON.stringify(dict, null, 1)};\n`;
  }
  const iconsSrc = fs.readFileSync(path.join(root, 'public/js/icons.js'), 'utf8');
  const iconsMod = await import(pathToFileURL(path.join(root, 'public/js/icons.js')).href);
  // P объектісі экспортталмайды, сондықтан icon() функциясы арқылы әр атаудың SVG мазмұнын аламыз
  const names = [...iconsSrc.matchAll(/^\s{2}([a-zA-Z]+):\s*'</gm)].map((m) => m[1]);
  const paths = {};
  for (const n of names) {
    const svg = iconsMod.icon(n);
    const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1];
    if (inner) paths[n] = inner;
  }
  files['icons.js'] = `${HEADER}export const ICONS = ${JSON.stringify(paths, null, 1)};\n`
    + `export const CATEGORY_ICON = ${JSON.stringify(iconsMod.CATEGORY_ICON)};\n`
    + `export const DISASTER_ICON = ${JSON.stringify(iconsMod.DISASTER_ICON)};\n`;
  const leafletJs = fs.readFileSync(path.join(root, 'node_modules/leaflet/dist/leaflet.js'), 'utf8');
  const leafletCss = fs.readFileSync(path.join(root, 'node_modules/leaflet/dist/leaflet.css'), 'utf8');
  files['leaflet.js'] = `${HEADER}/* Leaflet 1.9 — BSD-2-Clause, (c) Volodymyr Agafonkin, CloudMade */\n`
    + `export const LEAFLET_JS = ${JSON.stringify(leafletJs)};\nexport const LEAFLET_CSS = ${JSON.stringify(leafletCss)};\n`;
  // Офлайн демо карта: Қазақстан шекарасы (Natural Earth, қоғамдық игілік)
  const kz = fs.readFileSync(path.join(root, 'public/data/kz-outline.json'), 'utf8');
  files['kz-outline.js'] = `${HEADER}export const KZ_OUTLINE = ${kz.trim()};\n`;
  return files;
}

const files = await build();
fs.mkdirSync(out, { recursive: true });
let stale = [];
for (const [name, content] of Object.entries(files)) {
  const p = path.join(out, name);
  const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (cur !== content) {
    stale.push(name);
    if (!check) fs.writeFileSync(p, content);
  }
}
if (check) {
  if (stale.length) {
    console.error(`Ортақ файлдар ескірген: ${stale.join(', ')}. Орындаңыз: cd mobile && npm run sync`);
    process.exit(1);
  }
  console.log('Ортақ сөздіктер мен иконкалар сайтпен сәйкес.');
} else {
  console.log(stale.length ? `Жаңартылды: ${stale.join(', ')}` : 'Өзгеріс жоқ.');
}
