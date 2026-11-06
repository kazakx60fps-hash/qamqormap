import { INCIDENT_GROUPS } from '../data/categories.js';
import { Router } from 'express';
import { query } from '../db/pool.js';
import { ah } from '../http.js';
import { config } from '../config.js';

const r = Router();

r.get('/cities', ah(async (_req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.name_kk, c.name_ru, c.name_en, c.region_code, c.region_kk, c.region_ru, c.lat, c.lng, c.zoom, c.is_major, c.search_text,
            (SELECT count(*)::int FROM help_requests h
              WHERE h.city_id = c.id AND h.moderation_status='approved' AND h.status IN ('open','assigned','in_progress','awaiting_confirmation')) AS active_count
       FROM cities c ORDER BY c.is_major DESC, c.name_kk`,
  );
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ items: rows });
}));

r.get('/categories', ah(async (_req, res) => {
  const { rows } = await query('SELECT id, code, name_kk, short_kk, color, icon, direction FROM help_categories ORDER BY sort, id');
  res.json({ items: rows });
}));

/** Статистика тек расталған (completed) оқиғалардан есептеледі. */
r.get('/stats', ah(async (req, res) => {
  const cityId = Number(req.query.city_id) || null;
  const cond = cityId ? 'AND h.city_id = $1' : '';
  const params = cityId ? [cityId] : [];
  const main = (await query(
    `SELECT
       count(*) FILTER (WHERE h.status='completed')::int AS completed,
       count(*) FILTER (WHERE h.status='completed' AND h.is_demo)::int AS completed_demo,
       count(*) FILTER (WHERE h.status IN ('open','assigned','in_progress','awaiting_confirmation'))::int AS active,
       count(*) FILTER (WHERE h.status='open')::int AS open,
       round(avg(extract(epoch FROM (h.first_assigned_at - h.published_at)) / 3600)
             FILTER (WHERE h.first_assigned_at IS NOT NULL AND h.published_at IS NOT NULL AND h.status='completed')::numeric, 1) AS avg_hours_to_assign
     FROM help_requests h WHERE h.moderation_status='approved' ${cond}`, params,
  )).rows[0];
  const volunteers = (await query(
    `SELECT count(*)::int AS n FROM volunteer_profiles vp WHERE vp.is_active ${cityId ? 'AND vp.city_id=$1' : ''}`, params,
  )).rows[0].n;
  const helpers = (await query(
    `SELECT count(DISTINCT s.volunteer_id)::int AS n FROM assignments s JOIN help_requests h ON h.id=s.request_id
      WHERE h.status='completed' AND s.is_active ${cond}`, params,
  )).rows[0].n;
  const byCategory = (await query(
    `SELECT hc.id, hc.code, hc.short_kk AS name, hc.color, count(h.id)::int AS completed
       FROM help_categories hc
       LEFT JOIN help_requests h ON h.category_id=hc.id AND h.status='completed' AND h.moderation_status='approved' ${cond}
      GROUP BY hc.id ORDER BY hc.sort`, params,
  )).rows;
  const byDistrict = (await query(
    `SELECT NULLIF(h.district,'') AS district, count(*)::int AS completed FROM help_requests h
      WHERE h.status='completed' AND h.moderation_status='approved' ${cond}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, params,
  )).rows;
  const topCities = cityId ? [] : (await query(
    `SELECT c.id, c.name_kk, count(h.id)::int AS completed FROM help_requests h JOIN cities c ON c.id=h.city_id
      WHERE h.status='completed' AND h.moderation_status='approved' GROUP BY c.id ORDER BY 3 DESC, c.name_kk LIMIT 5`,
  )).rows;
  res.json({ city_id: cityId, ...main, volunteers, helpers, by_category: byCategory, by_district: byDistrict, top_cities: topCities });
}));

r.get('/regions', ah(async (_req, res) => {
  const { rows } = await query('SELECT code, name_kk, name_ru, name_en, sort FROM regions ORDER BY sort');
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ items: rows });
}));

r.get('/disaster-types', ah(async (_req, res) => {
  const { rows } = await query('SELECT id, code, color, icon, kind FROM disaster_types ORDER BY sort, id');
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ items: rows, groups: INCIDENT_GROUPS });
}));

r.get('/map-config', (_req, res) => {
  res.json({ tilesUrl: config.mapTilesUrl, attribution: config.mapTilesAttribution, maxZoom: config.mapTilesMaxZoom });
});

export default r;
