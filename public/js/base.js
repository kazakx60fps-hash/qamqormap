// Сайттың орналасу жолы. Қалыпты серверде BASE = '' (түбір).
// GitHub Pages нұсқасында index.html-ге <meta name="qm-base" content="/qamqormap"> және
// <meta name="qm-static" content="1"> жазылады (scripts/build-pages.mjs).
const metaContent = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';

export const BASE = metaContent('qm-base').replace(/\/+$/, '');
/** Статикалық демо нұсқа: сервер жоқ, деректер — алдын ала дайындалған оқу деректері */
export const STATIC = metaContent('qm-static') === '1';

/** Браузердегі жолдан қосымша ішіндегі жолға (/qamqormap/map → /map) */
export function appPath(pathname = location.pathname) {
  if (BASE && (pathname === BASE || pathname.startsWith(BASE + '/'))) return pathname.slice(BASE.length) || '/';
  return pathname;
}
/** Қосымша ішіндегі жолдан браузердегі жолға (/map → /qamqormap/map) */
export const toUrl = (p) => (BASE && p.startsWith('/') && !p.startsWith(BASE + '/') && p !== BASE ? BASE + p : p);
export const asset = toUrl;

// BASE бар кезде шаблондардағы "/..." сілтемелер мен суреттерді автоматты түрде түзетеміз
if (BASE && typeof MutationObserver !== 'undefined') {
  const fix = (root) => {
    if (!root.querySelectorAll) return;
    const list = root.matches?.('a[href^="/"], img[src^="/"]') ? [root] : [];
    list.push(...root.querySelectorAll('a[href^="/"], img[src^="/"]'));
    for (const el of list) {
      const attr = el.tagName === 'IMG' ? 'src' : 'href';
      const v = el.getAttribute(attr);
      if (v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith(BASE + '/')) el.setAttribute(attr, BASE + v);
    }
  };
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') fix(m.target);
      else m.addedNodes.forEach((n) => n.nodeType === 1 && fix(n));
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'src'] });
}
