// Интерактивті карта беті: Leaflet + OpenStreetMap (API кілтінсіз).
// Android/iOS-та WebView ішінде, веб-нұсқада iframe ішінде ашылады. Leaflet кітапханасы
// қосымшаның ішіне енгізілген, интернет тек карта қабаттары (tiles) үшін керек.
import { LEAFLET_CSS, LEAFLET_JS } from '../shared/leaflet.js';
import { ICONS, CATEGORY_ICON, DISASTER_ICON } from '../shared/icons.js';
import { KZ_OUTLINE } from '../shared/kz-outline.js';
import { C } from '../theme';

const SCRIPT = String.raw`
(function () {
  var send = function (m) {
    var s = JSON.stringify(m);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent && window.parent !== window) window.parent.postMessage({ __qm: s }, '*');
  };
  var ICONS = window.__ICONS, CAT = window.__CAT, DIS = window.__DIS, COL = window.__COL;
  var map = L.map('map', { zoomControl: false, attributionControl: true, tap: true, worldCopyJump: false, zoomSnap: 0.5 })
    .setView([48.2, 67.5], 5);
  map.attributionControl.setPrefix(false);
  var tiles = null, failed = 0, loaded = 0, reported = false, attrib = '';
  function setAttribution(text) {
    if (attrib) map.attributionControl.removeAttribution(attrib);
    attrib = text || '';
    if (attrib) map.attributionControl.addAttribution(attrib);
  }
  function setTiles(cfg) {
    if (tiles) map.removeLayer(tiles);
    failed = 0; loaded = 0; reported = false;
    tiles = L.tileLayer(cfg.url, { maxZoom: cfg.maxZoom || 19 });
    setAttribution(cfg.attribution);
    tiles.on('tileload', function () { loaded++; if (offline) setOffline(false); });
    tiles.on('tileerror', function () {
      failed++;
      if (failed >= 6) tilesFailed();
    });
    tiles.addTo(map);
    clearTimeout(tileTimer);
    tileTimer = setTimeout(function () { if (!loaded) tilesFailed(); }, 9000);
  }
  // Карта қабаттары жүктелмесе: Қазақстан шекарасы мен қалалар (интернетсіз жұмыс істейді)
  var offline = null, tileTimer = null, cities = [];
  function tilesFailed() {
    if (reported || loaded > 0) return;
    reported = true; setOffline(true); send({ type: 'tilesFailed' });
  }
  function setOffline(on) {
    if (on && !offline) {
      if (!map.getPane('off')) { var pn = map.createPane('off'); pn.style.zIndex = 250; pn.style.pointerEvents = 'none'; }
      offline = L.layerGroup();
      L.geoJSON(window.__KZ, { pane: 'off', interactive: false, style: function (f) {
        return f.properties.code === 'KZ' ? { color: '#2457F5', weight: 2, fillColor: '#FFFFFF', fillOpacity: 1 } : { color: '#B6C1D8', weight: 1, fillColor: '#E6EAF3', fillOpacity: 1 };
      } }).addTo(offline);
      drawCities();
      offline.addTo(map);
      document.body.className = 'offline';
      map.attributionControl.addAttribution('Natural Earth');
    } else if (!on && offline) {
      map.removeLayer(offline); offline = null; document.body.className = '';
      map.attributionControl.removeAttribution('Natural Earth');
    }
  }
  function drawCities() {
    if (!offline) return;
    cities.forEach(function (c) {
      var m = L.circleMarker([c.lat, c.lng], { pane: 'off', interactive: false, radius: c.major ? 4 : 2.5, color: '#14213D', weight: 1, fillColor: c.major ? '#14213D' : '#8A93AB', fillOpacity: 1 });
      if (c.major) m.bindTooltip(esc(c.name), { permanent: true, direction: 'right', className: 'cl', offset: [4, 0] });
      m.addTo(offline);
    });
  }
  var areaLayer = L.layerGroup().addTo(map), reqLayer = L.layerGroup().addTo(map), evLayer = L.layerGroup().addTo(map), repLayer = L.layerGroup().addTo(map);
  var markers = {}, data = { requests: [], events: [], reports: [] }, selected = null, bottomPad = 0, topPad = 0;
  var pickOn = false, pickMarker = null;

  function svg(name, color, sw) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="' + (sw || 2.2) + '" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.info) + '</svg>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function reqIcon(r, sel) {
    var cls = 'rq' + (sel ? ' sel' : '') + (r.status === 'completed' ? ' done' : '') + (r.direction === 'disaster' ? ' dis' : '');
    var html = '<div class="' + cls + '" style="--c:' + esc(r.category_color) + '"><div class="pin">' + svg(CAT[r.category_code] || 'heart', '#fff') + '</div>' +
      (r.urgency === 'high' && r.status !== 'completed' ? '<b class="urg">!</b>' : '') + '</div>';
    return L.divIcon({ className: 'qmk', html: html, iconSize: [44, 52], iconAnchor: [22, 50] });
  }
  function evIcon(e, sel) {
    var cls = 'ev' + (sel ? ' sel' : '') + (e.activity_status === 'resolved' ? ' res' : '');
    var badge = e.verification_status === 'verified' ? '<b class="vb ok">' + svg('check', '#fff', 3.4) + '</b>' : '<b class="vb q">?</b>';
    var html = '<div class="' + cls + '"' + (e.type_color ? ' style="--e:' + esc(e.type_color) + '"' : '') + '><div class="d"></div><div class="i">' + svg(DIS[e.type_code] || 'alert', '#fff', 2.4) + '</div>' + badge +
      (e.is_demo ? '<span class="demo">' + esc(window.__DEMO) + '</span>' : '') + '</div>';
    return L.divIcon({ className: 'qmk', html: html, iconSize: [54, 54], iconAnchor: [27, 27] });
  }
  function repIcon(r) {
    var html = '<div class="rp' + (r.mine ? ' mine' : '') + '" style="--e:' + esc(r.type_color || '#64748B') + '">' + svg(DIS[r.type_code] || 'alert', r.mine ? COL.primary : (r.type_color || '#64748B'), 2.4) + '<b>?</b></div>';
    return L.divIcon({ className: 'qmk', html: html, iconSize: [40, 40], iconAnchor: [20, 20] });
  }
  function key(kind, id) { return (kind === 'request' ? 'r:' : kind === 'report' ? 'p:' : 'e:') + id; }

  function draw() {
    reqLayer.clearLayers(); evLayer.clearLayers(); areaLayer.clearLayers(); repLayer.clearLayers(); markers = {};
    (data.reports || []).forEach(function (r) {
      var k = key('report', r.id);
      var m = L.marker([r.lat, r.lng], { icon: repIcon(r), zIndexOffset: 2000, keyboard: true, title: r.title || '', alt: r.title || '' })
        .on('click', function () { send({ type: 'select', kind: 'report', id: r.id }); });
      m.addTo(repLayer); markers[k] = { m: m, item: r, kind: 'report' };
    });
    (data.events || []).forEach(function (e) {
      if (e.lat == null) return;
      if (e.radius_km) {
        L.circle([e.lat, e.lng], { radius: e.radius_km * 1000, color: COL.disaster, weight: 2, dashArray: '6 6', fillColor: COL.disaster,
          fillOpacity: e.activity_status === 'resolved' ? 0.04 : 0.09, interactive: false }).addTo(areaLayer);
      }
      var k = key('event', e.id);
      var m = L.marker([e.lat, e.lng], { icon: evIcon(e, selected === k), zIndexOffset: 1000, keyboard: true, title: e.title, alt: e.title })
        .on('click', function () { setSelected(k, false); send({ type: 'select', kind: 'event', id: e.id }); });
      m.addTo(evLayer); markers[k] = { m: m, item: e, kind: 'event' };
    });
    (data.requests || []).forEach(function (r) {
      if (r.approx_lat == null) return;
      var k = key('request', r.id);
      var m = L.marker([r.approx_lat, r.approx_lng], { icon: reqIcon(r, selected === k), keyboard: true, title: r.title, alt: r.title })
        .on('click', function () { setSelected(k, false); send({ type: 'select', kind: 'request', id: r.id }); });
      m.addTo(reqLayer); markers[k] = { m: m, item: r, kind: 'request' };
    });
  }
  function refreshIcon(k) {
    var x = markers[k];
    if (!x) return;
    if (x.kind === 'report') return;
    x.m.setIcon(x.kind === 'event' ? evIcon(x.item, selected === k) : reqIcon(x.item, selected === k));
    x.m.setZIndexOffset(selected === k ? 3000 : x.kind === 'event' ? 1000 : 0);
  }
  function focus(latlng, zoom) {
    var z = Math.max(map.getZoom(), zoom || 12);
    var p = map.project(latlng, z).add([0, (bottomPad - topPad) / 2]);
    map.setView(map.unproject(p, z), z, { animate: true });
  }
  function setSelected(k, pan) {
    var prev = selected; selected = k || null;
    if (prev) refreshIcon(prev);
    if (selected) refreshIcon(selected);
    if (pan && selected && markers[selected]) focus(markers[selected].m.getLatLng(), 13);
  }
  function fit() {
    var pts = [];
    Object.keys(markers).forEach(function (k) { pts.push(markers[k].m.getLatLng()); });
    if (!pts.length) return;
    if (pts.length === 1) { focus(pts[0], 12); return; }
    map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [36, topPad + 24], paddingBottomRight: [70, bottomPad + 24], maxZoom: 14, animate: true });
  }
  function setPick(m) {
    pickOn = !!m.enabled;
    if (m.lat != null) {
      var ll = [m.lat, m.lng];
      if (!pickMarker) {
        pickMarker = L.marker(ll, { draggable: true, zIndexOffset: 4000, icon: L.divIcon({ className: 'qmk', html: '<div class="pk"><div class="pin">' + svg('pin', '#fff') + '</div></div>', iconSize: [44, 52], iconAnchor: [22, 50] }) })
          .on('dragend', function () { var p = pickMarker.getLatLng(); send({ type: 'pick', lat: p.lat, lng: p.lng }); })
          .addTo(map);
      } else pickMarker.setLatLng(ll);
    }
  }
  map.on('click', function (e) {
    if (pickOn) { setPick({ enabled: true, lat: e.latlng.lat, lng: e.latlng.lng }); send({ type: 'pick', lat: e.latlng.lat, lng: e.latlng.lng }); }
    else send({ type: 'tap' });
  });
  // Кіші масштабта (бүкіл ел) «Оқу мысалы» жазуы мен қала атаулары бір-бірін баспауы үшін жасырылады
  function zoomClass() { document.documentElement.className = map.getZoom() < 6 ? 'zlow' : ''; }
  map.on('zoomend', zoomClass); zoomClass();
  map.on('moveend', function () { var c = map.getCenter(); send({ type: 'moved', lat: c.lat, lng: c.lng, zoom: map.getZoom() }); });

  window.__qm = function (m) {
    try {
      if (typeof m === 'string') m = JSON.parse(m);
      switch (m.type) {
        case 'tiles': setTiles(m); break;
        case 'data': data = m; draw(); if (m.fit) fit(); break;
        case 'select': setSelected(m.key, !!m.pan); break;
        case 'view': map.setView(m.center, m.zoom, { animate: !!m.animate }); break;
        case 'focus': focus(L.latLng(m.lat, m.lng), m.zoom); break;
        case 'zoom': if (m.dir > 0) map.zoomIn(); else map.zoomOut(); break;
        case 'pick': setPick(m); break;
        case 'padding': bottomPad = m.bottom || 0; topPad = m.top || 0; break;
        case 'invalidate': map.invalidateSize(); break;
        case 'fit': fit(); break;
        case 'cities': cities = m.items || []; if (offline) { setOffline(false); setOffline(true); } break;
        case 'kz': map.fitBounds([[40.5, 46.4], [55.5, 87.4]], { paddingTopLeft: [8, topPad + 8], paddingBottomRight: [8, bottomPad + 8] }); break;
        case 'labels': window.__DEMO = m.demo; draw(); if (m.attribution) setAttribution(m.attribution); break;
      }
    } catch (err) { send({ type: 'error', message: String(err && err.message) }); }
  };
  window.addEventListener('message', function (ev) { if (ev && ev.data && ev.data.__qmIn) window.__qm(ev.data.__qmIn); });
  document.addEventListener('message', function (ev) { if (ev && ev.data) window.__qm(ev.data); });
  window.addEventListener('resize', function () { map.invalidateSize(); });
  send({ type: 'ready' });
})();
`;

const CSS = `
html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#E8ECF4;font-family:-apple-system,Roboto,'Segoe UI',sans-serif}
.leaflet-container{background:#E8ECF4}
.leaflet-control-attribution{font-size:11px;background:rgba(255,255,255,.85)!important}
.qmk{background:none;border:none}
.rq{position:relative;width:44px;height:52px}
.rq .pin{position:absolute;left:4px;top:2px;width:36px;height:36px;border-radius:50% 50% 50% 6px;transform:rotate(-45deg);background:var(--c);border:3px solid #fff;box-shadow:0 3px 8px rgba(19,32,63,.35);display:flex;align-items:center;justify-content:center}
.rq .pin svg{width:19px;height:19px;transform:rotate(45deg)}
.rq.dis .pin{border-color:${C.disaster};box-shadow:0 0 0 3px #fff,0 3px 8px rgba(19,32,63,.35)}
.rq.done .pin{opacity:.55;filter:grayscale(.4)}
.rq .urg{position:absolute;right:0;top:-2px;width:18px;height:18px;border-radius:9px;background:${C.red};color:#fff;font:800 12px/18px sans-serif;text-align:center;border:2px solid #fff}
.rq.sel .pin{width:42px;height:42px;left:1px;top:-4px;box-shadow:0 0 0 4px ${C.primary},0 6px 14px rgba(19,32,63,.4)}
.ev{position:relative;width:54px;height:54px;display:flex;align-items:center;justify-content:center}
.ev .d{position:absolute;width:36px;height:36px;background:var(--e,${C.disaster});border:3px solid #fff;border-radius:7px;transform:rotate(45deg);box-shadow:0 3px 10px rgba(185,69,10,.45)}
.ev .i{position:relative;width:22px;height:22px}
.ev .i svg{width:22px;height:22px}
.ev.res .d{background:#B98A66}
.ev .vb{position:absolute;right:2px;top:2px;width:18px;height:18px;border-radius:9px;border:2px solid #fff;font:800 12px/16px sans-serif;color:#fff;text-align:center}
.ev .vb.ok{background:${C.green}}
.ev .vb.ok svg{width:12px;height:12px;margin-top:2px}
.ev .vb.q{background:${C.amber}}
.ev .demo{position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);white-space:nowrap;background:${C.demo50};color:${C.demo};border:1px solid #E8CD73;font:800 10px/14px sans-serif;padding:0 5px;border-radius:7px}
.ev.sel .d{width:42px;height:42px;box-shadow:0 0 0 4px ${C.primary},0 6px 14px rgba(19,32,63,.4)}
.pk .pin{position:absolute;left:4px;top:2px;width:36px;height:36px;border-radius:50% 50% 50% 6px;transform:rotate(-45deg);background:${C.primary};border:3px solid #fff;box-shadow:0 3px 8px rgba(19,32,63,.4);display:flex;align-items:center;justify-content:center}
.pk .pin svg{width:18px;height:18px;transform:rotate(45deg)}
.pk{position:relative;width:44px;height:52px}
.rp{position:relative;width:40px;height:40px;border-radius:20px;background:#fff;border:3px dashed var(--e);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(19,32,63,.3);box-sizing:border-box}
.rp.mine{border-color:${C.primary}}
.rp svg{width:18px;height:18px}
.rp b{position:absolute;right:-6px;top:-6px;width:18px;height:18px;border-radius:9px;background:${C.amber};color:#fff;font:800 11px/18px sans-serif;text-align:center;border:2px solid #fff}
body.offline .leaflet-container,body.offline{background:#DCE6F4}
.leaflet-container .leaflet-pane svg{max-width:none!important}
.cl{background:rgba(255,255,255,.85);border:0;box-shadow:none;padding:1px 5px;border-radius:6px;font:700 11px/1.3 sans-serif;color:#14213D}
.cl:before{display:none}
.zlow .ev .demo{width:16px;height:16px;padding:0;bottom:auto;top:-2px;left:-2px;transform:none;border-radius:8px;font-size:0;background:#FACC15;border:2px solid #fff}
`;

export function buildMapHtml(demoLabel: string) {
  const boot = `window.__ICONS=${JSON.stringify(ICONS)};window.__CAT=${JSON.stringify(CATEGORY_ICON)};window.__DIS=${JSON.stringify(DISASTER_ICON)};`
    + `window.__COL=${JSON.stringify({ disaster: C.disaster, primary: C.primary })};window.__DEMO=${JSON.stringify(demoLabel)};window.__KZ=${JSON.stringify(KZ_OUTLINE)};`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">`
    + `<style>${LEAFLET_CSS}</style><style>${CSS}</style></head><body><div id="map"></div>`
    + `<script>${LEAFLET_JS}</script><script>${boot}</script><script>${SCRIPT}</script></body></html>`;
}
