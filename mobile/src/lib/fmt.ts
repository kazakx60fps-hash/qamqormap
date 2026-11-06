// Аударылған атаулар мен форматтар: қала/облыс атауы, санат, мәртебе, күн, қате мәтіні.
import { useMemo } from 'react';
import { hasKey, useI18n, type Lang } from '../i18n';
import { useMeta } from './meta';
import { ApiError, type FieldCode } from './api';
import type { City, Notification } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function useFmt() {
  const { t, tArr, lang } = useI18n();
  const meta = useMeta();
  return useMemo(() => {
    const cityObjName = (c: City | undefined | null) =>
      !c ? '' : lang === 'ru' ? c.name_ru || c.name_kk : lang === 'en' ? c.name_en || c.name_ru : c.name_kk;
    const cityName = (id: number | null | undefined) => (id == null ? t('city.all') : cityObjName(meta.citiesById.get(id)) || `#${id}`);
    const regionName = (code: string | null | undefined) => {
      const r = code ? meta.regionsByCode.get(code) : null;
      if (!r) return code || '';
      return lang === 'ru' ? r.name_ru : lang === 'en' ? r.name_en : r.name_kk;
    };
    const cityRegion = (id: number | null | undefined) => {
      const c = id != null ? meta.citiesById.get(id) : null;
      return c?.region_code ? regionName(c.region_code) : '';
    };
    const months = tArr('date.months');
    const date = (iso?: string | null) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return lang === 'en' ? `${d.getDate()} ${capital(months[d.getMonth()])} ${d.getFullYear()}` : `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    };
    const time = (iso?: string | null) => {
      if (!iso) return '';
      const d = new Date(iso);
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const dateTime = (iso?: string | null) => (iso ? `${date(iso)}, ${time(iso)}` : '');
    const rel = (iso?: string | null) => {
      if (!iso) return '';
      const s = (Date.now() - new Date(iso).getTime()) / 1000;
      if (s < 60) return t('time.justNow');
      if (s < 3600) return t('time.minutesAgo', { count: Math.floor(s / 60) });
      if (s < 86400) return t('time.hoursAgo', { count: Math.floor(s / 3600) });
      if (s < 86400 * 7) return t('time.daysAgo', { count: Math.floor(s / 86400) });
      return date(iso);
    };
    const neededText = (from?: string | null, to?: string | null, note?: string | null) => {
      if (!from) return note || t('time.agree');
      const same = to && new Date(from).toDateString() === new Date(to).toDateString();
      const main = to ? (same ? `${date(from)}, ${time(from)}–${time(to)}` : `${dateTime(from)} — ${dateTime(to)}`) : dateTime(from);
      return note ? `${main} · ${note}` : main;
    };
    const fieldText = (v: FieldCode | undefined) => {
      if (!v) return '';
      if (typeof v === 'string') return hasKey(`fieldErrors.${v}`) ? t(`fieldErrors.${v}`) : v;
      const p = { ...(v.params || {}) } as Record<string, string | number>;
      if (p.city_id) p.city = cityName(Number(p.city_id));
      return t(`fieldErrors.${v.code}`, p);
    };
    const errText = (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.code === 'NETWORK') return t('m.err.network');
        if (err.code === 'SERVER_DOWN' || err.code === 'BAD_RESPONSE') return t('m.err.badServer');
        if (hasKey(`errors.${err.code}`)) {
          const p = { ...err.params } as Record<string, string | number>;
          if (p.status) p.status = t(`status.${p.status}`);
          return t(`errors.${err.code}`, p);
        }
        return err.message || t('errors.UNKNOWN');
      }
      return t('errors.UNKNOWN');
    };
    const notifText = (n: Notification) => {
      const p = { ...(n.params || {}) } as Record<string, string | number>;
      if (!Object.keys(p).length || !hasKey(`notif.${n.type}.title`)) return { title: n.title, body: n.body };
      if (p.type) p.type = t(`dtype.${p.type}`);
      if (p.city_id) p.city = cityName(Number(p.city_id));
      return { title: t(`notif.${n.type}.title`, p), body: t(`notif.${n.type}.body`, p) };
    };
    const langName = (l: string) => t(`m.langNames.${l}`);
    const areaText = (areas: { city_id: number | null; region_code: string | null }[], locationNote?: string | null) => {
      const parts = areas.map((a) => (a.city_id ? cityName(a.city_id) : regionName(a.region_code)));
      if (locationNote) parts.push(locationNote);
      return parts.join(', ');
    };
    return { cityName, cityObjName, regionName, cityRegion, date, time, dateTime, rel, neededText, fieldText, errText, notifText, langName, areaText, lang: lang as Lang };
  }, [t, tArr, lang, meta.citiesById, meta.regionsByCode]);
}

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
