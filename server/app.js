import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { config } from './config.js';
import { loadUser, csrfProtect } from './middleware/auth.js';
import { HttpError } from './http.js';
import { addClient } from './services/realtime.js';
import { query } from './db/pool.js';
import authRoutes from './routes/auth.js';
import metaRoutes from './routes/meta.js';
import requestRoutes from './routes/requests.js';
import attachmentRoutes from './routes/attachments.js';
import meRoutes from './routes/me.js';
import coordinatorRoutes from './routes/coordinator.js';
import orgRoutes from './routes/orgs.js';
import { events as eventRoutes, reports as reportRoutes, coordReports } from './routes/events.js';

function tilesOrigin() {
  try {
    return new URL(config.mapTilesUrl.replace(/\{s\}/g, 'a').replace(/\{[^}]+\}/g, '0')).origin.replace('://a.', '://*.');
  } catch {
    return 'https://tile.openstreetmap.org';
  }
}

export function createApp() {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org', tilesOrigin()],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'upgrade-insecure-requests': config.cookieSecure ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    // OpenStreetMap қабаттары Referer тақырыбын талап етеді (тек сайт атауы жіберіледі)
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // ───── API ─────
  const api = express.Router();
  // CORS тек CORS_ORIGINS тізіміндегі көздерге (мысалы, мобильді қосымшаның веб-нұсқасын тексеру).
  // Android/iOS қосымшасының өзіне CORS қажет емес.
  api.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && config.corsOrigins.includes(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        Vary: 'Origin',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client, X-CSRF-Token',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Max-Age': '600',
      });
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
  });
  api.use(loadUser);
  api.use(csrfProtect);
  api.get('/health', async (_req, res) => {
    await query('SELECT 1');
    res.json({ ok: true, db: 'postgresql', api: 2, demo: config.demoLogin });
  });
  api.use('/auth', authRoutes);
  api.use('/', metaRoutes);
  api.use('/requests', requestRoutes);
  api.use('/attachments', attachmentRoutes);
  api.use('/me', meRoutes);
  api.use('/events', eventRoutes);
  api.use('/disaster-reports', reportRoutes);
  api.use('/coordinator/disaster-reports', coordReports);
  api.use('/coordinator', coordinatorRoutes);
  api.use('/orgs', orgRoutes);

  // Жедел жаңартулар ағыны (SSE). Кірмеген қолданушы тек жария өзгерістерді алады.
  api.get('/stream', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 4000\n\n');
    res.write(`event: hello\ndata: ${JSON.stringify({ user_id: req.user?.id ?? null })}\n\n`);
    const remove = addClient(req.user?.id ?? null, res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      remove();
    });
  });

  api.use((_req, _res, next) => next(new HttpError(404, 'API_NOT_FOUND')));
  app.use('/api', api);

  // ───── Статикалық файлдар және SPA ─────
  const pub = path.join(config.root, 'public');
  app.use(express.static(pub, { index: false, maxAge: config.env === 'production' ? '1h' : 0 }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(pub, 'index.html')));

  // ───── Қателер ─────
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json(err.toJSON());
    const send = (status, code) => res.status(status).json(new HttpError(status, code).toJSON());
    if (err?.type === 'entity.parse.failed') return send(400, 'BAD_JSON');
    if (err?.type === 'entity.too.large') return send(413, 'TOO_LARGE');
    if (err?.code === '23505') return send(409, 'DB_CONFLICT');
    if (err?.code === '23514' || err?.code === '22P02' || err?.code === '23503') return send(400, 'DB_CONSTRAINT');
    console.error('[server]', req.method, req.originalUrl, err);
    send(500, 'SERVER_ERROR');
  });

  return app;
}
