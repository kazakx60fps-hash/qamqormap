// Metro бапталуы. Expo серверіне /api/* прокси қосылады: телефон (Expo Go, LAN немесе tunnel)
// API-ге Expo серверінің мекенжайы арқылы жетеді — компьютердің 3000-портын желіге ашудың қажеті жоқ.
const { getDefaultConfig } = require('expo/metro-config');
const http = require('node:http');

const config = getDefaultConfig(__dirname);
const TARGET = new URL(process.env.QM_API_TARGET || 'http://127.0.0.1:3000');

function proxyApi(req, res) {
  const headers = { ...req.headers, host: TARGET.host };
  delete headers.origin; // Bearer токен арқылы кіреміз; CORS/CSRF бұл жолға қатысы жоқ
  delete headers.cookie;
  const up = http.request({ hostname: TARGET.hostname, port: TARGET.port || 80, path: req.url, method: req.method, headers }, (r) => {
    const h = { ...r.headers };
    delete h['set-cookie'];
    res.writeHead(r.statusCode || 502, h);
    r.pipe(res);
  });
  up.on('error', () => {
    if (res.headersSent) return res.end();
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'QamqorMap API server is not running', code: 'API_DOWN' }));
  });
  req.pipe(up);
}

const prev = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const base = prev ? prev(middleware, server) : middleware;
    return (req, res, next) => {
      if (req.url === '/api' || (req.url && req.url.startsWith('/api/'))) return proxyApi(req, res);
      return base(req, res, next);
    };
  },
};

module.exports = config;
