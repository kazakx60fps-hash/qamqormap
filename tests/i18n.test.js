// Аударма жүйесінің тесттері: үш сөздіктің кілттері бірдей, кодта қолданылған әр кілт бар,
// сервердің әр тұрақты коды (қате, өріс, хабарлама, санат, мәртебе, апат түрі) үш тілде аударылған.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kk = (await import('../public/js/i18n/kk.js')).default;
const ru = (await import('../public/js/i18n/ru.js')).default;
const en = (await import('../public/js/i18n/en.js')).default;
const { ERRORS, FIELDS, NOTIFICATIONS } = await import('../server/messages.js');
const { CATEGORIES, DISASTER_TYPES } = await import('../server/data/categories.js');

function flat(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !('other' in v)) Object.assign(out, flat(v, key));
    else out[key] = v;
  }
  return out;
}
const F = { kk: flat(kk), ru: flat(ru), en: flat(en) };
const has = (lang, key) => Object.prototype.hasOwnProperty.call(F[lang], key);

test('kk, ru, en сөздіктерінің кілттері толық сәйкес', () => {
  for (const lang of ['ru', 'en']) {
    const missing = Object.keys(F.kk).filter((k) => !has(lang, k));
    const extra = Object.keys(F[lang]).filter((k) => !has('kk', k));
    assert.deepEqual(missing, [], `${lang}: жетіспейтін кілттер`);
    assert.deepEqual(extra, [], `${lang}: артық кілттер`);
  }
});

test('мәтіндердегі {параметрлер} үш тілде бірдей', () => {
  const params = (v) => {
    const s = typeof v === 'object' && !Array.isArray(v) ? Object.values(v).join(' ') : String(v);
    return [...new Set(s.match(/\{\w+\}/g) || [])].sort().join(',');
  };
  for (const key of Object.keys(F.kk)) {
    if (Array.isArray(F.kk[key])) continue;
    for (const lang of ['ru', 'en']) assert.equal(params(F[lang][key]), params(F.kk[key]), `${lang}: ${key}`);
  }
});

test('ru және en сөздіктерінде қазақ әріптері жоқ (аралас аударма жоқ)', () => {
  const KZ = /[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/;
  const allowed = new Set(['about.names', 'city.searchPlaceholder']); // жоба авторлары мен іздеу мысалы
  for (const lang of ['ru', 'en']) {
    for (const [k, v] of Object.entries(F[lang])) {
      if (allowed.has(k)) continue;
      assert.ok(!KZ.test(JSON.stringify(v)), `${lang}: ${k} → ${JSON.stringify(v)}`);
    }
  }
  for (const [k, v] of Object.entries(F.en)) {
    if (['city.searchPlaceholder'].includes(k)) continue;
    assert.ok(!/[А-Яа-яЁё]/.test(JSON.stringify(v)), `en: ${k} кирилл әрпі бар`);
  }
});

test('frontend кодында қолданылған әр статикалық кілт сөздікте бар', () => {
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory() && e.name !== 'i18n') walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  });
  walk(path.join(root, 'public', 'js'));
  const used = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bth?\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\bt\(\s*[^,)]*\?\s*'([a-zA-Z0-9_.]+)'\s*:\s*'([a-zA-Z0-9_.]+)'/g)) { used.add(m[1]); used.add(m[2]); }
  }
  const prefixes = (k) => Object.keys(F.kk).some((x) => x === k || x.startsWith(k + '.'));
  const missing = [...used].filter((k) => k.includes('.') && !prefixes(k));
  assert.deepEqual(missing, []);
});

test('сервердің барлық тұрақты кодтары үш тілде аударылған', () => {
  const need = [
    ...Object.keys(ERRORS).map((c) => `errors.${c}`),
    ...Object.keys(FIELDS).map((c) => `fieldErrors.${c}`),
    ...Object.keys(NOTIFICATIONS).flatMap((c) => [`notif.${c}.title`, `notif.${c}.body`]),
    ...CATEGORIES.flatMap((c) => [`cat.${c.code}`, `catShort.${c.code}`]),
    ...CATEGORIES.filter((c) => c.direction === 'everyday').map((c) => `catText.${c.code}`),
    ...DISASTER_TYPES.map((d) => `dtype.${d.code}`),
    ...['open', 'assigned', 'in_progress', 'awaiting_confirmation', 'completed', 'cancelled'].flatMap((s) => [`status.${s}`]),
    ...['draft', 'pending', 'approved', 'rejected'].map((s) => `moderation.${s}`),
    ...['verified', 'unverified'].map((s) => `verify.${s}`),
    ...['active', 'resolved'].map((s) => `activity.${s}`),
  ];
  // Сервер қолданатын ұсыныс/қайталау себептері мен оқиға түрлері
  const src = fs.readFileSync(path.join(root, 'server', 'services', 'requests.js'), 'utf8');
  for (const m of src.matchAll(/code: '([A-Z_]+)'/g)) {
    const c = m[1];
    if (['SAME_CATEGORY', 'DISTANCE', 'SAME_DISTRICT', 'SAME_EVENT', 'TEXT_SIMILARITY'].includes(c)) need.push(`dup.${c}`);
    else need.push(`reco.${c}`);
  }
  for (const m of src.matchAll(/addEvent\(db, [^,]+, [^,]+, '([a-z_]+)'/g)) need.push(`reqEvent.${m[1]}`);
  const evSrc = fs.readFileSync(path.join(root, 'server', 'services', 'events.js'), 'utf8');
  for (const m of evSrc.matchAll(/event_type, note\) VALUES \(\$1,\$2,'([a-z_]+)'/g)) need.push(`reqEvent.${m[1]}`);
  for (const m of evSrc.matchAll(/'(created|updated|verified|unverified|resolved|reopened|report_linked)'/g)) need.push(`event.hist.${m[1]}`);
  for (const lang of ['kk', 'ru', 'en']) {
    const missing = [...new Set(need)].filter((k) => !has(lang, k));
    assert.deepEqual(missing, [], `${lang}: аударылмаған кодтар`);
  }
});
