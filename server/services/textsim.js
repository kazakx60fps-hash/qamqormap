// Мәтін ұқсастығы: таңбалық триграммалар бойынша Жаккар коэффициенті (pg_trgm-ге ұқсас).
export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function trigrams(s) {
  const set = new Set();
  for (const word of normalize(s).split(' ')) {
    if (!word) continue;
    const w = `  ${word} `;
    for (let i = 0; i < w.length - 2; i++) set.add(w.slice(i, i + 3));
  }
  return set;
}

export function similarity(a, b) {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function commonWords(a, b, limit = 4) {
  const wa = new Set(normalize(a).split(' ').filter((w) => w.length > 3));
  const out = [];
  for (const w of new Set(normalize(b).split(' '))) {
    if (wa.has(w)) out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371.0088, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
