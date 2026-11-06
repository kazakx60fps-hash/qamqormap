// Карта бетімен хабар алмасу: дайын болғанша хабарлар кезекте тұрады.
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import type { MapHandle, MapProps } from './types';
import { OSM_DEFAULT, mapPayload, plainAttribution } from './types';
import { useI18n } from '../i18n';
import { useMeta } from '../lib/meta';

export function useBridge(props: MapProps, ref: Ref<MapHandle>, post: (msg: object) => void) {
  const { t, lang } = useI18n();
  const meta = useMeta();
  const ready = useRef(false);
  const queue = useRef<object[]>([]);
  const firstData = useRef(true);
  const cb = useRef(props);
  cb.current = props;

  const send = useCallback((msg: object) => {
    if (ready.current) post(msg);
    else queue.current.push(msg);
  }, [post]);

  useImperativeHandle(ref, () => ({
    zoom: (dir) => send({ type: 'zoom', dir }),
    kz: () => send({ type: 'kz' }),
    focus: (lat, lng, zoom) => send({ type: 'focus', lat, lng, zoom }),
    setView: (center, zoom, animate) => send({ type: 'view', center, zoom, animate }),
    fit: () => send({ type: 'fit' }),
    invalidate: () => send({ type: 'invalidate' }),
  }), [send]);

  const onMessage = useCallback((raw: string) => {
    let m: { type: string; kind?: 'request' | 'event' | 'report'; id?: number; lat?: number; lng?: number };
    try { m = JSON.parse(raw); } catch { return; }
    const p = cb.current;
    switch (m.type) {
      case 'ready': {
        ready.current = true;
        const q = queue.current;
        queue.current = [];
        q.forEach(post);
        p.onReady?.();
        break;
      }
      case 'select': if (m.kind && m.id != null) p.onSelect?.(m.kind, m.id); break;
      case 'pick': if (m.lat != null && m.lng != null) p.onPick?.(m.lat, m.lng); break;
      case 'tap': p.onTap?.(); break;
      case 'tilesFailed': p.onTilesFailed?.(); break;
    }
  }, [post]);

  // Бастапқы көрініс және карта қабаттары
  const tiles = props.tiles ?? OSM_DEFAULT;
  // OpenStreetMap атрибуциясы таңдалған тілде; басқа карта қабаты болса — сервер баптауындағы мәтін
  const isOsm = tiles.tilesUrl === OSM_DEFAULT.tilesUrl;
  const attribution = isOsm ? t('map.attribution') : plainAttribution(tiles.attribution || '');
  useEffect(() => {
    send({ type: 'tiles', url: tiles.tilesUrl, attribution, maxZoom: tiles.maxZoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send, tiles.tilesUrl, tiles.maxZoom]);
  useEffect(() => {
    send({ type: 'view', center: props.initialView.center, zoom: props.initialView.zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

  const payload = useMemo(() => mapPayload(props.requests, props.events, props.reports), [props.requests, props.events, props.reports]);
  // Офлайн демо карта үшін қалалар (тайлдар жүктелмесе көрсетіледі)
  const cityDots = useMemo(() => props.cities ?? meta.cities.map((c) => ({
    lat: c.lat, lng: c.lng, major: c.is_major, name: (lang === 'en' && c.name_en) || (lang === 'ru' && c.name_ru) || c.name_kk,
  })), [props.cities, meta.cities, lang]);
  useEffect(() => { if (cityDots.length) send({ type: 'cities', items: cityDots }); }, [send, cityDots]);
  useEffect(() => {
    send({ type: 'data', ...payload, fit: !!props.fitOnData && !firstData.current });
    firstData.current = false;
  }, [send, payload, props.fitOnData]);
  useEffect(() => { send({ type: 'select', key: props.selectedKey ?? null, pan: false }); }, [send, props.selectedKey]);
  useEffect(() => { if (props.pick) send({ type: 'pick', ...props.pick }); }, [send, props.pick?.enabled, props.pick?.lat, props.pick?.lng]); // eslint-disable-line
  useEffect(() => { send({ type: 'padding', bottom: props.bottomInset ?? 0, top: props.topInset ?? 0 }); }, [send, props.bottomInset, props.topInset]);
  // Тіл ауысқанда картадағы жазулар да жаңарады (карта қайта жүктелмейді)
  useEffect(() => { send({ type: 'labels', demo: props.demoLabel, attribution }); }, [send, props.demoLabel, attribution]);

  return { onMessage };
}
