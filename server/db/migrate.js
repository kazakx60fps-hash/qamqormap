import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool } from './pool.js';
import { config } from '../config.js';
import { CITIES, REGION_LIST } from '../data/cities.js';
import { CATEGORIES, DISASTER_TYPES } from '../data/categories.js';

const dir = path.join(config.root, 'server', 'migrations');

/**
 * Миграцияларды ретімен бір рет қолданады (schema_migrations кестесі арқылы),
 * содан кейін анықтамалықтарды id/code бойынша жаңартады. Ешбір жазба жойылмайды.
 */
export async function migrate({ log = console.log } = {}) {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    // Екі процесс бір мезетте миграция жасамауы үшін
    await client.query('SELECT pg_advisory_lock(424242)');
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = (await fs.readdir(dir)).filter((f) => /\.(sql|js)$/.test(f)).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      await client.query('BEGIN');
      try {
        if (file.endsWith('.sql')) {
          await client.query(await fs.readFile(path.join(dir, file), 'utf8'));
        } else {
          const mod = await import(pathToFileURL(path.join(dir, file)).href);
          await mod.up(client);
        }
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`[migrate] қолданылды: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Миграция ${file} сәтсіз: ${err.message}`);
      }
    }
    await syncReference(client);
    await client.query('SELECT pg_advisory_unlock(424242)');
  } finally {
    client.release();
  }
}

async function syncReference(client) {
  await client.query('BEGIN');
  try {
    const cols = new Set((await client.query(
      `SELECT table_name || '.' || column_name AS c FROM information_schema.columns WHERE table_schema = current_schema()`,
    )).rows.map((r) => r.c));
    const hasRegions = cols.has('regions.code');
    if (hasRegions) {
      for (const r of REGION_LIST) {
        await client.query(
          `INSERT INTO regions (code, name_kk, name_ru, name_en, sort) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (code) DO UPDATE SET name_kk=$2, name_ru=$3, name_en=$4, sort=$5`,
          [r.code, r.name_kk, r.name_ru, r.name_en, r.sort],
        );
      }
    }
    for (const c of CITIES) {
      await client.query(
        `INSERT INTO cities (id, name_kk, name_ru, region_kk, region_ru, lat, lng, zoom, is_major, search_text)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET name_kk=$2, name_ru=$3, region_kk=$4, region_ru=$5,
           lat=$6, lng=$7, zoom=$8, is_major=$9, search_text=$10`,
        [c.id, c.name_kk, c.name_ru, c.region_kk, c.region_ru, c.lat, c.lng, c.zoom, c.is_major, c.search_text],
      );
      if (hasRegions) {
        await client.query('UPDATE cities SET name_en=$2, region_code=$3 WHERE id=$1', [c.id, c.name_en, c.region_code]);
      }
    }
    const hasDirection = cols.has('help_categories.direction');
    for (const c of CATEGORIES) {
      if (!hasDirection && c.direction !== 'everyday') continue;
      await client.query(
        `INSERT INTO help_categories (code, name_kk, short_kk, color, icon, sort)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (code) DO UPDATE SET name_kk=$2, short_kk=$3, color=$4, icon=$5, sort=$6`,
        [c.code, c.name_kk, c.short_kk, c.color, c.icon, c.sort],
      );
      if (hasDirection) await client.query('UPDATE help_categories SET direction=$2 WHERE code=$1', [c.code, c.direction]);
    }
    if (cols.has('disaster_types.code')) {
      for (const d of DISASTER_TYPES) {
        await client.query(
          `INSERT INTO disaster_types (code, color, icon, sort) VALUES ($1,$2,$3,$4)
           ON CONFLICT (code) DO UPDATE SET color=$2, icon=$3, sort=$4`,
          [d.code, d.color, d.icon, d.sort],
        );
        if (cols.has('disaster_types.kind')) await client.query('UPDATE disaster_types SET kind=$2 WHERE code=$1', [d.code, d.kind]);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate()
    .then(() => {
      console.log('[migrate] Дерекқор дайын.');
      return pool.end();
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
