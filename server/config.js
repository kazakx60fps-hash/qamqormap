import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function int(v, d) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}

export const config = {
  root,
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://qamqor:qamqor_dev@localhost:5432/qamqormap',
  sessionDays: int(process.env.SESSION_DAYS, 14),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || 'uploads'),
  maxUploadMb: int(process.env.MAX_UPLOAD_MB, 5),
  // Тесттерде жиілік шектеуін әлсірету үшін
  rateLimitScale: Number(process.env.RATE_LIMIT_SCALE || 1),
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Карта қабаттары: әдепкі — OpenStreetMap (API кілті қажет емес)
  mapTilesUrl: process.env.MAP_TILES_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapTilesAttribution: process.env.MAP_TILES_ATTRIBUTION
    || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> қатысушылары',
  mapTilesMaxZoom: Number(process.env.MAP_TILES_MAX_ZOOM || 19),
  // Мобильді қосымшаның веб-нұсқасын тексеру үшін рұқсат етілген Origin тізімі (үтір арқылы). Әдепкі — бос.
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // Демо-кіру (рөлді бір батырмамен таңдау) тек DEMO_LOGIN=true болғанда және тек демо аккаунттарға
  demoLogin: process.env.DEMO_LOGIN === 'true',
};
