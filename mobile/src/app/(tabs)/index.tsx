// Басты экран — интерактивті карта (2GIS үлгісіндегі орналасу: жоғарыда қала мен іздеу, төменде нәтижелер панелі).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { C, F, HIT, R, S, shadow } from '../../theme';
import { Icon, disasterIcon } from '../../components/Icon';
import { Alert, Btn, Chip, ErrorView, IconBtn, Loading, Row, Segmented, Txt, Empty } from '../../components/ui';
import { BottomSheet, type SheetState } from '../../components/BottomSheet';
import { CityPicker, searchCities } from '../../components/CityPicker';
import { LangSwitch } from '../../components/LangSwitch';
import { FilterSheet } from '../../components/FilterSheet';
import { EventCard, RequestCard } from '../../components/cards';
import { Logo } from '../../components/Logo';
import { QMap } from '../../map/QMap';
import type { MapHandle } from '../../map/types';
import { useI18n } from '../../i18n';
import { useMeta } from '../../lib/meta';
import { useFilters, type Direction } from '../../lib/filters';
import { useFmt } from '../../lib/fmt';
import { api } from '../../lib/api';
import { eventQuery, requestQuery } from '../../lib/queries';
import type { DisasterEvent, RequestItem, Stats } from '../../lib/types';

const KZ_VIEW = { center: [48.2, 67.5] as [number, number], zoom: 4.5 };

export default function MapScreen() {
  const { t } = useI18n();
  const meta = useMeta();
  const fmt = useFmt();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cityId, setCityId, filters, setFilters, activeFilterCount } = useFilters();
  const mapRef = useRef<MapHandle>(null);
  const listRef = useRef<FlatList>(null);

  const [sheet, setSheet] = useState<SheetState>('mid');
  const [boxH, setBoxH] = useState(0);
  const [topH, setTopH] = useState(170);
  const [cityOpen, setCityOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState(filters.q);
  const [searchFocus, setSearchFocus] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);

  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [events, setEvents] = useState<DisasterEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<unknown>(null);
  const seq = useRef(0);
  const fitPending = useRef(true);

  const city = cityId != null ? meta.citiesById.get(cityId) : undefined;
  const showEvents = filters.direction !== 'everyday';

  const load = useCallback(async (silent = false) => {
    if (meta.status !== 'ready') return;
    const my = ++seq.current;
    if (!silent) setState('loading');
    try {
      const [rq, ev, st] = await Promise.all([
        api<{ items: RequestItem[]; total: number }>('/requests', { query: requestQuery(cityId, filters) }),
        showEvents ? api<{ items: DisasterEvent[] }>('/events', { query: eventQuery(cityId, filters) }) : Promise.resolve({ items: [] as DisasterEvent[] }),
        api<Stats>('/stats', { query: { city_id: cityId ?? undefined } }).catch(() => null),
      ]);
      if (my !== seq.current) return;
      setRequests(rq.items);
      setTotal(rq.total);
      setEvents(ev.items);
      setStats(st);
      setState('ready');
      // Қала немесе сүзгі ауысқанда карта табылған белгілерге сыйғызылады (жоғарғы панель мен төменгі панель ескеріледі)
      if (fitPending.current) {
        fitPending.current = false;
        const c = cityId != null ? meta.citiesById.get(cityId) : undefined;
        setTimeout(() => {
          if (rq.items.length + ev.items.length > 0) mapRef.current?.fit();
          else if (c) mapRef.current?.focus(c.lat, c.lng, c.zoom || 12);
        }, 150);
      }
    } catch (e) {
      if (my !== seq.current) return;
      setError(e);
      setState('error');
    }
  }, [meta.status, cityId, filters, showEvents]);

  useEffect(() => { load(); }, [load]);
  // Басқа экраннан оралғанда (мысалы, өтініш жарияланғаннан кейін) деректерді үнсіз жаңарту
  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    load(true);
  }, [load]));

  // Қала ауысқанда карта сол қалаға жылжиды, деректер келгенде белгілерге сыйғызылады
  useEffect(() => {
    if (meta.status !== 'ready') return;
    if (city) mapRef.current?.setView([city.lat, city.lng], city.zoom || 12, true);
    else mapRef.current?.setView(KZ_VIEW.center, KZ_VIEW.zoom, true);
    setSelected(null);
    fitPending.current = true;
  }, [cityId, meta.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fitPending.current = true; }, [filters.direction, filters.eventId, filters.categoryId, filters.q]);

  const avail = Math.max(boxH, 400);
  const heights = useMemo(() => ({
    collapsed: 128,
    mid: Math.round(Math.min(avail * 0.44, avail - topH - 160)),
    expanded: Math.max(260, avail - topH - 6),
  }), [avail, topH]);

  const selReq = selected?.startsWith('r:') ? requests.find((r) => `r:${r.id}` === selected) : undefined;
  const selEv = selected?.startsWith('e:') ? events.find((e) => `e:${e.id}` === selected) : undefined;

  const onMapSelect = useCallback((kind: 'request' | 'event', id: number) => {
    setSelected(`${kind === 'request' ? 'r' : 'e'}:${id}`);
    setSheet((s) => (s === 'collapsed' || s === 'expanded' ? 'mid' : s));
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const pickCard = (key: string, lat?: number | null, lng?: number | null) => {
    setSelected(key);
    setSheet('mid');
    if (lat != null && lng != null) mapRef.current?.focus(lat, lng, 13);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const eventPoint = (e: DisasterEvent): [number, number] | null => {
    if (e.lat != null && e.lng != null) return [e.lat, e.lng];
    const c = e.areas.find((a) => a.city_id)?.city_id;
    const cc = c ? meta.citiesById.get(c) : null;
    return cc ? [cc.lat, cc.lng] : null;
  };
  // Нүктесі жоқ оқиғалар картада аймағындағы қала орталығында көрсетіледі
  const mapEvents = useMemo(() => events.map((e) => {
    const p = eventPoint(e);
    return p && e.lat == null ? { ...e, lat: p[0], lng: p[1], radius_km: null } : e;
  }), [events, meta.citiesById]); // eslint-disable-line react-hooks/exhaustive-deps

  const applySearch = (text: string) => {
    setFilters({ q: text.trim() });
    setSearchFocus(false);
  };
  const citySuggestions = useMemo(() => (query.trim().length >= 2 ? searchCities(meta.cities, query).slice(0, 5) : []), [query, meta.cities]);

  const setDirection = (d: Direction) => {
    setFilters({ direction: d, categoryId: null, disasterType: null, eventId: d === 'everyday' ? null : filters.eventId });
    setSelected(null);
  };

  const eventFilter = filters.eventId ? events.find((e) => e.id === filters.eventId) : null;

  const listData = useMemo(() => {
    const rows: ({ k: 'event'; e: DisasterEvent } | { k: 'req'; r: RequestItem })[] = [];
    if (showEvents && !filters.eventId) for (const e of events) if (`e:${e.id}` !== selected) rows.push({ k: 'event', e });
    for (const r of requests) if (`r:${r.id}` !== selected) rows.push({ k: 'req', r });
    return rows;
  }, [events, requests, selected, showEvents, filters.eventId]);

  const helpAction = (r: RequestItem) => (r.status === 'open' ? () => router.push(`/request/${r.id}?apply=1`) : undefined);
  const cityLabel = fmt.cityName(cityId);
  const titleCount = t('map.listTitle', { city: cityLabel, count: total });

  if (meta.status === 'loading') return <View style={st.full}><Loading /></View>;
  if (meta.status === 'error') {
    return (
      <View style={[st.full, { paddingTop: insets.top + 24 }]}>
        <Logo size={48} withText />
        <ErrorView text={fmt.errText(meta.error)} onRetry={meta.reload} />
        <Btn title={t('m.settings.server')} kind="ghost" icon="server" onPress={() => router.push('/settings')} testID="open-settings" />
      </View>
    );
  }

  const header = (
    <View style={{ paddingHorizontal: S[4], gap: S[2] }}>
      <Row gap={8}>
        <View style={{ flex: 1 }}>
          <Txt v="h3" numberOfLines={1}>{titleCount}</Txt>
          {showEvents && events.length ? (
            <Txt v="xs" color={C.disasterDark}>{t('disaster.eventsTitle', { count: events.length })}</Txt>
          ) : stats ? (
            <Txt v="xs" color={C.muted}>{t('m.home.statsLine', { completed: stats.completed, volunteers: stats.volunteers })}</Txt>
          ) : null}
        </View>
        <View style={{ width: 170 }}>
          <Segmented<'map' | 'list'> value={sheet === 'expanded' ? 'list' : 'map'} onChange={(v) => setSheet(v === 'list' ? 'expanded' : 'mid')} testID="view-toggle"
            options={[{ value: 'map', label: t('map.viewMap') }, { value: 'list', label: t('map.viewList') }]} />
        </View>
      </Row>
    </View>
  );

  const renderSelected = () => {
    if (selReq) {
      return (
        <View style={{ gap: 6 }}>
          <Txt v="xs" color={C.primaryDark}>{t('m.map.selected')}</Txt>
          <RequestCard r={selReq} selected onMore={() => router.push(`/request/${selReq.id}`)} onHelp={helpAction(selReq)} testID="selected-card" />
        </View>
      );
    }
    if (selEv) {
      return (
        <View style={{ gap: 6 }}>
          <Txt v="xs" color={C.disasterDark}>{t('m.map.selected')}</Txt>
          <EventCard e={selEv} selected onMore={() => router.push(`/event/${selEv.id}`)} testID="selected-card" />
          {selEv.requests_count ? (
            <Btn title={t('event.showRequests') + ` (${selEv.requests_count})`} kind="secondary" small icon="list"
              onPress={() => { setFilters({ eventId: selEv.id, direction: 'disaster' }); setSelected(null); }} testID="selected-event-requests" />
          ) : null}
        </View>
      );
    }
    return null;
  };

  const listHeader = (
    <View style={{ gap: S[3], paddingBottom: S[3] }}>
      {tilesFailed ? <Alert kind="warn" text={t('map.tilesFailed')} /> : null}
      {filters.direction === 'disaster' ? <Alert kind="disaster" title={t('disaster.emergencyTitle')} text={t('m.disaster.emergencyShort')} testID="emergency-notice" /> : null}
      {eventFilter || filters.eventId ? (
        <View style={st.eventFilter} testID="event-filter">
          <Icon name={disasterIcon(eventFilter?.type_code)} size={18} color={C.disasterDark} />
          <Txt v="sm" color={C.disasterDark} style={{ flex: 1 }}>
            {eventFilter ? t('map.eventFilterNamed', { title: eventFilter.title }) : t('map.eventFilter', { id: filters.eventId })}
          </Txt>
          <Pressable onPress={() => setFilters({ eventId: null })} accessibilityRole="button" accessibilityLabel={t('common.clear')} style={st.clearBtn} testID="event-filter-clear">
            <Icon name="x" size={18} color={C.disasterDark} />
          </Pressable>
        </View>
      ) : null}
      {renderSelected()}
      {!selected && !filters.q && !filters.eventId ? (
        <View style={st.intro} testID="intro-block">
          <Row gap={10}><Logo size={34} /><Txt v="sm" color={C.ink2} style={{ flex: 1 }}>{t('m.home.about')}</Txt></Row>
          {stats ? (
            <Row gap={8} wrap>
              <StatPill n={stats.completed} label={t('stats.completed')} color={C.green} />
              <StatPill n={stats.active} label={t('stats.active')} color={C.primary} />
              <StatPill n={stats.volunteers} label={t('stats.volunteers')} color={C.violet} />
            </Row>
          ) : null}
          <Row gap={8} wrap>
            <Btn title={t('nav.incidents')} kind="secondary" small icon="map" onPress={() => router.push('/incidents')} testID="open-incidents" />
            <Btn title={t('nav.disasters')} kind="secondary" small icon="siren" onPress={() => router.push('/disasters')} testID="open-disasters" />
            <Btn title={t('nav.about')} kind="ghost" small icon="info" onPress={() => router.push('/about')} />
          </Row>
        </View>
      ) : null}
      {filters.q ? (
        <Row gap={8}>
          <Txt v="sm" color={C.ink2} style={{ flex: 1 }}>{t('m.map.searchFor', { q: filters.q })}</Txt>
          <Btn title={t('common.clear')} kind="ghost" small onPress={() => { setQuery(''); setFilters({ q: '' }); }} testID="search-clear" />
        </Row>
      ) : null}
    </View>
  );

  return (
    <View style={st.full} onLayout={(e: LayoutChangeEvent) => setBoxH(e.nativeEvent.layout.height)} testID="map-screen">
      <QMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        requests={requests}
        events={showEvents && !filters.eventId ? mapEvents : []}
        selectedKey={selected}
        initialView={city ? { center: [city.lat, city.lng], zoom: city.zoom || 12 } : KZ_VIEW}
        tiles={meta.mapConfig}
        demoLabel={t('demo.eventBadge')}
        bottomInset={heights[sheet]}
        topInset={topH}
        onSelect={(kind, id) => { if (kind !== 'report') onMapSelect(kind, id); }}
        onTap={() => setSearchFocus(false)}
        onTilesFailed={() => setTilesFailed(true)}
        testID="map"
        accessibilityLabel={t('map.mapAria')}
      />

      {/* Жоғарғы панель: қала, тіл, іздеу, бағыт */}
      <View style={[st.top, { paddingTop: insets.top + 6 }]} onLayout={(e) => setTopH(e.nativeEvent.layout.height)} pointerEvents="box-none">
        <Row gap={8}>
          <Pressable onPress={() => setCityOpen(true)} style={st.cityBtn} accessibilityRole="button" accessibilityLabel={`${t('city.change')}: ${cityLabel}`} testID="city-button">
            <Icon name="pin" size={20} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[F.md, { fontWeight: '800', color: C.ink }]} numberOfLines={1}>{cityLabel}</Text>
              {city?.region_code ? <Text style={[F.xs, { color: C.muted }]} numberOfLines={1}>{fmt.regionName(city.region_code)}</Text> : null}
            </View>
            <Icon name="chevDown" size={18} color={C.muted} />
          </Pressable>
          <LangSwitch compact testID="lang-home" />
        </Row>
        <Row gap={8}>
          <View style={st.search}>
            <Icon name="search" size={20} color={C.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => setSearchFocus(true)}
              onSubmitEditing={() => applySearch(query)}
              returnKeyType="search"
              placeholder={t('m.map.searchPlaceholder')}
              placeholderTextColor={C.subtle}
              style={st.searchInput}
              accessibilityLabel={t('m.map.searchPlaceholder')}
              testID="search-input"
            />
            {query ? (
              <Pressable onPress={() => { setQuery(''); setFilters({ q: '' }); }} accessibilityRole="button" accessibilityLabel={t('common.clear')} style={st.clearBtn}>
                <Icon name="x" size={18} color={C.muted} />
              </Pressable>
            ) : null}
          </View>
          <IconBtn icon="filter" label={t('map.filters')} onPress={() => setFiltersOpen(true)} badge={activeFilterCount} testID="filters-button" />
        </Row>
        {searchFocus && query.trim() ? (
          <View style={st.suggest} testID="search-suggest">
            <Pressable style={st.sugRow} onPress={() => applySearch(query)} accessibilityRole="button" testID="suggest-requests">
              <Icon name="search" size={18} color={C.primary} />
              <Text style={[F.md, { color: C.ink, flex: 1 }]} numberOfLines={1}>{t('m.map.searchRequests', { q: query.trim() })}</Text>
            </Pressable>
            {citySuggestions.map((c) => (
              <Pressable key={c.id} style={st.sugRow} accessibilityRole="button" testID={`suggest-city-${c.id}`}
                onPress={() => { setCityId(c.id); setQuery(''); setFilters({ q: '' }); setSearchFocus(false); }}>
                <Icon name="pin" size={18} color={C.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={[F.md, { color: C.ink, fontWeight: '700' }]}>{fmt.cityObjName(c)}</Text>
                  <Text style={[F.xs, { color: C.muted }]}>{fmt.regionName(c.region_code)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: S[4] }} keyboardShouldPersistTaps="handled">
          <Chip label={t('dir.all')} selected={filters.direction === 'all'} onPress={() => setDirection('all')} icon="layers" testID="dir-all" />
          <Chip label={t('dir.everyday')} selected={filters.direction === 'everyday'} onPress={() => setDirection('everyday')} icon="heart" testID="dir-everyday" />
          <Chip label={t('dir.disaster')} selected={filters.direction === 'disaster'} onPress={() => setDirection('disaster')} icon="siren" color={C.disaster} testID="dir-disaster" />
        </ScrollView>
      </View>

      {/* Карта басқару батырмалары (панельден жоғары) */}
      {sheet !== 'expanded' ? (
        <View style={[st.controls, { bottom: heights[sheet] + 12 }]} pointerEvents="box-none">
          <IconBtn icon="plus" label={t('map.zoomIn')} onPress={() => mapRef.current?.zoom(1)} testID="zoom-in" />
          <IconBtn icon="minus" label={t('map.zoomOut')} onPress={() => mapRef.current?.zoom(-1)} testID="zoom-out" />
          <IconBtn icon="locate" label={t('m.map.fit')} onPress={() => mapRef.current?.fit()} testID="zoom-fit" />
        </View>
      ) : null}

      <BottomSheet state={sheet} onChange={setSheet} heights={heights} header={header}>
        {state === 'loading' ? <Loading text={t('map.loadingTitle', { city: cityLabel })} /> : state === 'error' ? (
          <ErrorView text={fmt.errText(error)} onRetry={() => load()} />
        ) : (
          <FlatList
            ref={listRef}
            data={listData}
            keyExtractor={(x) => (x.k === 'event' ? `e${x.e.id}` : `r${x.r.id}`)}
            contentContainerStyle={{ padding: S[4], gap: S[3], paddingBottom: S[8] }}
            ListHeaderComponent={listHeader}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={selected ? undefined : (
              <Empty icon="search" title={activeFilterCount || filters.q ? t('map.emptyFiltered') : t('home.emptyTitle', { city: cityLabel })}
                text={activeFilterCount || filters.q ? t('map.emptyFilteredHint') : t('home.emptyText')}
                action={<Btn title={t('common.addRequest')} icon="plus" onPress={() => router.push('/request/new')} />} />
            )}
            renderItem={({ item }) => item.k === 'event' ? (
              <EventCard e={item.e} onPress={() => { const p = eventPoint(item.e); pickCard(`e:${item.e.id}`, p?.[0], p?.[1]); }}
                onMore={() => router.push(`/event/${item.e.id}`)} />
            ) : (
              <RequestCard r={item.r} compact onPress={() => pickCard(`r:${item.r.id}`, item.r.approx_lat, item.r.approx_lng)}
                onMore={() => router.push(`/request/${item.r.id}`)} onHelp={helpAction(item.r)} />
            )}
          />
        )}
      </BottomSheet>

      <CityPicker visible={cityOpen} value={cityId} onClose={() => setCityOpen(false)} onPick={(id) => { setCityId(id); setCityOpen(false); }} />
      <FilterSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} />
    </View>
  );
}

function StatPill({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={[st.pill, { borderColor: color + '33' }]}>
      <Text style={[F.h3, { color }]}>{n}</Text>
      <Text style={[F.xs, { color: C.ink2, flexShrink: 1 }]}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  full: { flex: 1, backgroundColor: C.bg },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: S[3], gap: S[2], paddingBottom: S[2] },
  cityBtn: { flex: 1, minHeight: HIT, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S[3], borderRadius: R.md, backgroundColor: C.surface, ...shadow(1) },
  search: { flex: 1, minHeight: HIT, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: S[3], borderRadius: R.md, backgroundColor: C.surface, ...shadow(1) },
  searchInput: { flex: 1, fontSize: 16, color: C.ink, minHeight: HIT },
  clearBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  suggest: { backgroundColor: C.surface, borderRadius: R.md, paddingVertical: 4, ...shadow(2) },
  sugRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: HIT, paddingHorizontal: S[3] },
  controls: { position: 'absolute', right: S[3], gap: 8 },
  intro: { gap: S[3], padding: S[3], backgroundColor: C.primary50, borderRadius: R.lg },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.md, borderWidth: 1, flexShrink: 1 },
  eventFilter: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.disaster50, borderRadius: R.md, paddingLeft: S[3], borderWidth: 1, borderColor: C.disaster100 },
});
