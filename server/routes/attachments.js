import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { ah, forbidden, notFound, idParam } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { loadAccess } from '../services/requests.js';

const r = Router();

r.get('/:id', ah(async (req, res) => {
  const t = (await query('SELECT * FROM attachments WHERE id=$1', [idParam(req)])).rows[0];
  if (!t) throw notFound('PHOTO_NOT_FOUND');
  const a = await loadAccess({ query }, t.request_id, req.user); // жарияланбаған өтініш бөгделерге 404
  if (t.visibility !== 'public' && !a.canSeePrivate) throw forbidden('PHOTO_PRIVATE');
  const file = path.join(config.uploadDir, path.basename(t.storage_key));
  let data;
  try {
    data = await fs.readFile(file);
  } catch {
    throw notFound('PHOTO_NOT_FOUND');
  }
  res.set({
    'Content-Type': t.mime_type,
    'Cache-Control': t.visibility === 'public' ? 'public, max-age=300' : 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  });
  res.send(data);
}));

r.delete('/:id', requireAuth, ah(async (req, res) => {
  const t = (await query(
    `SELECT t.*, h.author_id FROM attachments t JOIN help_requests h ON h.id=t.request_id WHERE t.id=$1`, [idParam(req)],
  )).rows[0];
  if (!t) throw notFound('PHOTO_NOT_FOUND');
  if (t.author_id !== req.user.id && !req.user.is_coordinator) throw forbidden();
  await query('DELETE FROM attachments WHERE id=$1', [t.id]);
  await fs.unlink(path.join(config.uploadDir, path.basename(t.storage_key))).catch(() => {});
  res.json({ ok: true });
}));

export default r;
