import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { unauthorized, forbidden, HttpError } from '../http.js';

export const COOKIE = 'qm_session';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Мобильді клиент сұрауы: X-Client: mobile тақырыбы (cookie орнына токен қайтарылады) */
export const isMobileClient = (req) => (req.get('x-client') || '').toLowerCase() === 'mobile';

/**
 * Сессия ашады. Сайт үшін — HttpOnly cookie, мобильді қосымша үшін — Bearer токені
 * (токен жауапта бір рет беріледі, базада тек SHA-256 хэші сақталады).
 */
export async function createSession(res, userId, userAgent, { mobile = false } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 864e5);
  await query(
    `INSERT INTO sessions (id, user_id, csrf_token, expires_at, user_agent, client) VALUES ($1,$2,$3,$4,$5,$6)`,
    [sha(token), userId, csrf, expires, (userAgent || '').slice(0, 200), mobile ? 'mobile' : 'web'],
  );
  if (mobile) return { csrf, token };
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    expires,
    path: '/',
  });
  return { csrf, token: null };
}

function bearer(req) {
  const h = req.get('authorization') || '';
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(h);
  return m ? m[1] : null;
}

export async function destroySession(req, res) {
  const token = bearer(req) || req.cookies?.[COOKIE];
  if (token) await query('DELETE FROM sessions WHERE id = $1', [sha(token)]);
  if (!bearer(req)) res.clearCookie(COOKIE, { path: '/' });
}

/** Әр сұрауда сессияны оқиды (міндетті емес). */
export async function loadUser(req, _res, next) {
  req.user = null;
  req.authVia = null;
  const bt = bearer(req);
  const token = bt || req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.is_coordinator, u.city_id, u.preferred_lang, s.csrf_token,
              (vp.user_id IS NOT NULL AND vp.is_active) AS is_volunteer
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN volunteer_profiles vp ON vp.user_id = u.id
        WHERE s.id = $1 AND s.expires_at > now() AND s.client = $2`,
      [sha(token), bt ? 'mobile' : 'web'],
    );
    req.user = rows[0] || null;
    if (req.user) req.authVia = bt ? 'bearer' : 'cookie';
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireCoordinator(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!req.user.is_coordinator) return next(forbidden('COORDINATOR_ONLY'));
  next();
}

/**
 * Сұрауды қолдан жасаудан қорғау: өзгертетін әр сұрауда Origin тексеріледі,
 * ал кірген қолданушыдан X-CSRF-Token тақырыбы талап етіледі.
 */
export function csrfProtect(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Bearer токенін браузер өздігінен жібермейді, сондықтан мобильді сессияға CSRF қаупі жоқ
  if (req.authVia === 'bearer') return next();
  const origin = req.get('origin');
  if (origin && !config.corsOrigins.includes(origin)) {
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      host = null;
    }
    if (host !== req.get('host')) return next(new HttpError(403, 'ORIGIN_INVALID'));
  }
  if (req.user) {
    const sent = req.get('x-csrf-token') || '';
    const ok = sent.length === req.user.csrf_token.length &&
      crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(req.user.csrf_token));
    if (!ok) return next(new HttpError(403, 'CSRF_INVALID'));
  }
  next();
}
