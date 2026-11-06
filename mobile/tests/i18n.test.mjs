// Мобильді сөздіктердің тексерісі: kk/ru/en кілттері мен параметрлері бірдей, тілдер араласпайды,
// кодта қолданылған әр кілт бар, ортақ сөздіктер сайтпен сәйкес.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = async (f) => (await import(path.join(root, f))).default;
const M = { kk: await load('src/i18n/mobile-kk.ts'), ru: await load('src/i18n/mobile-ru.ts'), en: await load('src/i18n/mobile-en.ts') };
const S = { kk: await load('src/shared/i18n-kk.js'), ru: await load('src/shared/i18n-ru.js'), en: await load('src/shared/i18n-en.js') };

function flat(o, p = '', out = {}) {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !('other' in v)) flat(v, key, out);
    else out[key] = v;
  }
  return out;
}
const params = (v) => [...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().filter((x, i, a) => a.indexOf(x) === i).join(',');

test('мобильді сөздіктерде kk/ru/en кілттері мен параметрлері бірдей', () => {
  const kk = flat(M.kk);
  for (const l of ['ru', 'en']) {
    const other = flat(M[l]);
    assert.deepEqual(Object.keys(other).sort(), Object.keys(kk).sort(), `${l}: кілттер жиынтығы`);
    for (const k of Object.keys(kk)) assert.equal(params(other[k]), params(kk[k]), `${l}.${k}: параметрлер`);
  }
});

test('орысша және ағылшынша мәтінде қазақ әріптері, ағылшыншада кириллица жоқ', () => {
  const KZ = /[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/;
  for (const [k, v] of Object.entries(flat(M.ru))) if (k !== 'about.team') assert.ok(!KZ.test(JSON.stringify(v)), `ru.${k}`);
  for (const [k, v] of Object.entries(flat(M.en))) assert.ok(!/[Ѐ-ӿ]/.test(JSON.stringify(v)), `en.${k}`);
});

test('кодтағы әр t(...) кілті сөздікте бар', () => {
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.tsx?$/.test(f.name)) files.push(p); } };
  walk(path.join(root, 'src'));
  const keys = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
    for (const m of src.matchAll(/'(m\.[a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
  }
  const dyn = ['m.profile.demoAs.author', 'm.profile.demoAs.volunteer', 'm.profile.demoAs.coordinator', 'm.profile.demoAs.org_coordinator', 'm.profile.demoAs.org_volunteer', 'm.profile.demoAs.recipient',
    'm.form.slot.morning', 'm.form.slot.day', 'm.form.slot.evening', 'm.form.slot.any', 'm.langNames.kk', 'm.langNames.ru', 'm.langNames.en'];
  dyn.forEach((k) => keys.add(k));
  for (const l of ['kk', 'ru', 'en']) {
    const all = { ...flat(S[l]), ...flat({ m: M[l] }) };
    const has = (k) => k in all || Object.keys(all).some((x) => x.startsWith(k + '.'));
    const missing = [...keys].filter((k) => !has(k) && !(l !== 'kk' && has(k)));
    assert.deepEqual(missing, [], `${l}: жоқ кілттер`);
  }
});

test('ортақ сөздіктер мен иконкалар сайтпен сәйкес (npm run sync)', () => {
  const out = execFileSync(process.execPath, [path.join(root, 'scripts/sync-shared.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /сәйкес/);
});
