import { Router } from 'express';
import { query } from '../db/pool.js';
import { ah, Validator, badRequest, unauthorized, forbidden, notFound } from '../http.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';
import { createSession, destroySession, requireAuth, isMobileClient } from '../middleware/auth.js';
import { config } from '../config.js';
import { userOrgs } from '../services/orgs.js';
import { authLimiter } from '../middleware/limits.js';

const r = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LANGS = ['kk', 'ru', 'en'];

async function cityExists(id) {
  if (!id) return true;
  return (await query('SELECT 1 FROM cities WHERE id=$1', [id])).rowCount > 0;
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, email: u.email, full_name: u.full_name, phone: u.phone,
    is_coordinator: u.is_coordinator, city_id: u.city_id, is_volunteer: !!u.is_volunteer,
    preferred_lang: u.preferred_lang || null,
    orgs: u.orgs || [],
  };
}
const withOrgs = async (u) => ({ ...u, orgs: await userOrgs(u.id) });

r.get('/me', ah(async (req, res) => {
  if (!req.user) return res.json({ user: null, csrfToken: null });
  const unread = (await query('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id])).rows[0].n;
  res.json({ user: publicUser(await withOrgs(req.user)), csrfToken: req.user.csrf_token, unread });
}));

r.post('/register', authLimiter, ah(async (req, res) => {
  const v = new Validator(req.body)
    .str('full_name', { min: 2, max: 80 })
    .str('email', { max: 120 })
    .str('password', { min: 8, max: 128 })
    .int('city_id', { required: false, min: 1 })
    .phone('phone', { required: false });
  const d = v.out;
  if (d.email && !EMAIL_RE.test(d.email)) v.fail('email', 'INVALID_EMAIL');
  if (d.password && !/\d/.test(d.password)) v.fail('password', 'PASSWORD_DIGIT');
  if (req.body.password !== req.body.password_confirm) v.fail('password_confirm', 'PASSWORD_MISMATCH');
  if (!(await cityExists(d.city_id))) v.fail('city_id', 'CITY_NOT_FOUND');
  v.done();
  const exists = await query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [d.email]);
  if (exists.rowCount) throw badRequest('EMAIL_TAKEN', { email: 'EMAIL_TAKEN' });
  const hash = await hashPassword(req.body.password);
  // Тіркелу кезінде координатор құқығы ешқашан берілмейді
  const { rows } = await query(
    `INSERT INTO users (email, full_name, phone, password_hash, city_id, preferred_lang) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [d.email.toLowerCase(), d.full_name, d.phone, hash, d.city_id, LANGS.includes(req.body.lang) ? req.body.lang : null],
  );
  const s = await createSession(res, rows[0].id, req.get('user-agent'), { mobile: isMobileClient(req) });
  res.status(201).json({ user: publicUser(rows[0]), csrfToken: s.csrf, ...(s.token ? { token: s.token } : {}) });
}));

r.post('/login', authLimiter, ah(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    throw badRequest('VALIDATION', { ...(email ? {} : { email: 'REQUIRED' }), ...(password ? {} : { password: 'REQUIRED' }) });
  }
  const { rows } = await query(
    `SELECT u.*, (vp.user_id IS NOT NULL AND vp.is_active) AS is_volunteer
       FROM users u LEFT JOIN volunteer_profiles vp ON vp.user_id=u.id WHERE lower(u.email)=$1`, [email],
  );
  const u = rows[0];
  const ok = u ? await verifyPassword(password, u.password_hash) : await verifyPassword(password, 'scrypt$16384$8$1$AAAA$AAAA').catch(() => false);
  if (!u || !ok) throw unauthorized('LOGIN_FAILED', { password: 'LOGIN_FAILED' });
  const s = await createSession(res, u.id, req.get('user-agent'), { mobile: isMobileClient(req) });
  res.json({ user: publicUser(await withOrgs(u)), csrfToken: s.csrf, ...(s.token ? { token: s.token } : {}) });
}));

// ───── Демо-кіру (қорғауға арналған көрсетілім) ─────
// Тек DEMO_LOGIN=true болғанда жұмыс істейді және тек is_demo аккаунттарына сессия ашады.
const DEMO_ROLES = {
  author: 'aigerim@demo.qamqormap.kz',
  volunteer: 'daniyar@demo.qamqormap.kz',
  coordinator: 'coordinator@demo.qamqormap.kz',
  org_coordinator: 'kzo.coord@demo.qamqormap.kz',
  org_volunteer: 'kzo.vol1@demo.qamqormap.kz',
  recipient: 'kzo.recipient@demo.qamqormap.kz',
};

r.get('/demo', ah(async (_req, res) => {
  if (!config.demoLogin) return res.json({ enabled: false, accounts: [] });
  const { rows } = await query(
    'SELECT id, email, full_name, city_id FROM users WHERE is_demo AND lower(email) = ANY($1)', [Object.values(DEMO_ROLES)],
  );
  const accounts = Object.entries(DEMO_ROLES)
    .map(([role, email]) => ({ role, ...rows.find((u) => u.email === email) }))
    .filter((a) => a.id)
    .map(({ role, full_name, city_id }) => ({ role, full_name, city_id }));
  res.json({ enabled: true, accounts });
}));

r.post('/demo-login', authLimiter, ah(async (req, res) => {
  if (!config.demoLogin) throw forbidden('DEMO_DISABLED');
  const email = DEMO_ROLES[req.body?.role];
  if (!email) throw badRequest('VALIDATION', { role: 'INVALID' });
  const { rows } = await query(
    `SELECT u.*, (vp.user_id IS NOT NULL AND vp.is_active) AS is_volunteer
       FROM users u LEFT JOIN volunteer_profiles vp ON vp.user_id=u.id WHERE lower(u.email)=$1 AND u.is_demo`, [email],
  );
  if (!rows[0]) throw notFound('DEMO_ACCOUNT_MISSING');
  const s = await createSession(res, rows[0].id, req.get('user-agent'), { mobile: isMobileClient(req) });
  res.json({ user: publicUser(await withOrgs(rows[0])), csrfToken: s.csrf, ...(s.token ? { token: s.token } : {}), demo_role: req.body.role });
}));

r.post('/logout', ah(async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
}));

r.patch('/profile', requireAuth, ah(async (req, res) => {
  const v = new Validator(req.body)
    .str('full_name', { min: 2, max: 80 })
    .phone('phone', { required: false })
    .int('city_id', { required: false, min: 1 });
  if (!(await cityExists(v.out.city_id))) v.fail('city_id', 'CITY_NOT_FOUND');
  const d = v.done();
  await query('UPDATE users SET full_name=$2, phone=$3, city_id=$4, updated_at=now() WHERE id=$1',
    [req.user.id, d.full_name, d.phone, d.city_id]);
  res.json({ ok: true });
}));

r.post('/password', requireAuth, authLimiter, ah(async (req, res) => {
  const v = new Validator(req.body).str('current_password')
    .str('new_password', { min: 8, max: 128 });
  if (v.out.new_password && !/\d/.test(v.out.new_password)) v.fail('new_password', 'PASSWORD_DIGIT');
  v.done();
  const u = (await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id])).rows[0];
  if (!(await verifyPassword(req.body.current_password, u.password_hash))) {
    throw badRequest('WRONG_PASSWORD', { current_password: 'WRONG_PASSWORD' });
  }
  await query('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [req.user.id, await hashPassword(req.body.new_password)]);
  // Басқа құрылғылардағы сессиялар жабылады
  await query(`DELETE FROM sessions WHERE user_id=$1 AND csrf_token <> $2`, [req.user.id, req.user.csrf_token]);
  res.json({ ok: true });
}));

// Тіл баптауы: тіркелген қолданушы үшін PostgreSQL-де сақталады
r.patch('/language', requireAuth, ah(async (req, res) => {
  const lang = req.body?.lang;
  if (!LANGS.includes(lang)) throw badRequest('VALIDATION', { lang: 'LANG_INVALID' });
  await query('UPDATE users SET preferred_lang=$2, updated_at=now() WHERE id=$1', [req.user.id, lang]);
  res.json({ ok: true, lang });
}));

export default r;
