// «Оқиғалар картасы»: Қазақстанның интерактивті картасы (Leaflet + OpenStreetMap WebView ішінде).
// Ашылғанда бүкіл Қазақстан көрінеді. Түр сүзгісі (өрт, су тасқыны, жер сілкінісі, авария, басқа), қала іздеу,
// белгі → карточка, «Карта / Тізім», жаңа хабарлама: картадан нүкте таңдап, тексеруге жіберу.
// Тайлдар жүктелмесе — Қазақстан шекарасы мен қалалары бар офлайн демо карта.
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R, S } from '../theme';
import { Header } from '../components/Screen';
import { Alert, Badge, Btn, Card, Chip, Empty, ErrorView, IconBtn, Loading, Row, Segmented, Txt } from '../components/ui';
import { EventCard } from '../components/cards';
import { CityPicker } from '../components/CityPicker';
import { Icon, disasterIcon } from '../components/Icon';
import { QMap } from '../map/QMap';
import type { MapHandle, MapReport } from '../map/types';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useMeta } from '../lib/meta';
import { useFilters } from '../lib/filters';
import { useFmt } from '../lib/fmt';
import { useLoad } from '../lib/useLoad';
import { api } from '../lib/api';
import type { DisasterEvent, DisasterReport } from '../lib/types';

const GROUP_ICON: Record<string, string> = { fire: 'flame', flood: 'waves', earthquake: 'quake', accident: 'car', misc: 'alert' };
const DEFAULT_GROUPS = [
  { code: 'fire', types: ['wildfire', 'fire'] }, { code: 'flood', types: ['flood', 'mudflow'] },
  { code: 'earthquake', types: ['earthquake'] }, { code: 'accident', types: ['accident'] },
  { code: 'misc', types: ['landslide', 'avalanche', 'blizzard', 'drought_heat', 'incident_other'] },
];
const KZ = { center: [48.2, 67.5] as [number, number], zoom: 4 };
type Rep = DisasterReport & { mine?: boolean };

export default function Incidents() {
  const { t } = useI18n();
  const fmt = useFmt();
  const meta = useMeta();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { setCityId } = useFilters();
  const mapRef = useRef<MapHandle>(null);
  const [at, setAt] = useState<number | null>(null); // ашылғанда — бүкіл Қазақстан
  const [group, setGroup] = useState('all');
  const [view, setView] = useState<'map' | 'list'>('map');
  const [cityOpen, setCityOpen] = useState(false);
  const [sel, setSel] = useState<{ kind: 'event' | 'report'; id: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [offline, setOffline] = useState(false);
  const [noteHidden, setNoteHidden] = useState(false);
  const groups = meta.disasterGroups.length ? meta.disasterGroups : DEFAULT_GROUPS;
  const groupOf = useCallback((code: string) => groups.find((g) => g.types.includes(code))?.code ?? 'misc', [groups]);
  const typeColor = (code: string) => meta.disasterTypes.find((d) => d.code === code)?.color ?? '#64748B';

  const { data, error, loading, reload, silent } = useLoad(async () => {
    const [ev, mine, pend] = await Promise.all([
      api<{ items: DisasterEvent[] }>('/events', { query: { limit: 200, city_id: at ?? undefined } }),
      user ? api<{ items: Rep[] }>('/me/disaster-reports').catch(() => ({ items: [] as Rep[] })) : Promise.resolve({ items: [] as Rep[] }),
      user?.is_coordinator ? api<{ items: Rep[] }>('/coordinator/disaster-reports', { query: { status: 'pending' } }).catch(() => ({ items: [] as Rep[] })) : Promise.resolve({ items: [] as Rep[] }),
    ]);
    const mineP = mine.items.filter((r) => r.status === 'pending').map((r) => ({ ...r, mine: true }));
    const reports = [...mineP, ...pend.items.filter((r) => !mineP.some((m) => m.id === r.id))];
    return { events: ev.items, reports };
  }, [at, user?.id]);
  // Хабарлама жіберіп оралғанда тізім жаңарады
  useFocusEffect(useCallback(() => { silent(); }, [at, user?.id])); // eslint-disable-line react-hooks/exhaustive-deps

  const events = useMemo(() => (data?.events ?? []).filter((e) => group === 'all' || groupOf(e.type_code) === group), [data, group, groupOf]);
  const reports = useMemo(() => (data?.reports ?? []).filter((r) => r.lat != null && (group === 'all' || groupOf(r.type_code) === group)), [data, group, groupOf]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.events.length ?? 0 };
    for (const e of data?.events ?? []) { const g = groupOf(e.type_code); c[g] = (c[g] ?? 0) + 1; }
    return c;
  }, [data, groupOf]);
  const mapReports = useMemo<MapReport[]>(() => reports.map((r) => ({ id: r.id, lat: r.lat!, lng: r.lng!, type_code: r.type_code, type_color: typeColor(r.type_code), mine: r.mine, title: t(`dtype.${r.type_code}`) })), [reports]); // eslint-disable-line react-hooks/exhaustive-deps
  const selEvent = sel?.kind === 'event' ? events.find((e) => e.id === sel.id) : null;
  const selReport = sel?.kind === 'report' ? reports.find((r) => r.id === sel.id) : null;

  const chooseCity = (id: number | null) => {
    setCityOpen(false);
    setAt(id);
    setSel(null);
    if (id) {
      setCityId(id); // бүкіл қосымша бір қаламен жұмыс істейді
      const c = meta.citiesById.get(id);
      if (c) mapRef.current?.setView([c.lat, c.lng], Math.min(c.zoom || 11, 11), true);
    } else mapRef.current?.kz();
  };
  const startAdd = () => {
    if (!user) { router.push('/login?next=/incidents'); return; }
    setView('map');
    setSel(null);
    setPicking(true);
  };
  const onPick = (lat: number, lng: number) => {
    if (!picking) return;
    setPicking(false);
    const preset = group !== 'all' ? groups.find((g) => g.code === group)?.types.find((c) => meta.disasterTypes.some((d) => d.code === c)) : '';
    router.push(`/report?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}${preset ? `&type=${preset}` : ''}`);
  };

  const pendingCard = (r: Rep) => (
    <Card key={`r${r.id}`} style={{ borderStyle: 'dashed', borderColor: r.mine ? C.primary : C.amber }} testID={`inc-report-${r.id}`}>
      <Row wrap gap={6}>
        <Badge label={t(r.mine ? 'incidents.mine' : 'incidents.pending')} fg={C.amber} bg={C.amber50} icon="info" />
        <Badge label={t(`dtype.${r.type_code}`)} fg={C.ink} bg={C.surface2} icon={disasterIcon(r.type_code)} />
      </Row>
      <Txt v="sm" ugc numberOfLines={3}>{r.description}</Txt>
      <Txt v="xs" color={C.muted}>{[r.city_id ? fmt.cityName(r.city_id) : '', fmt.rel(r.created_at)].filter(Boolean).join(' · ')}</Txt>
    </Card>
  );

  return (
    <View style={st.wrap} testID="incidents-screen">
      <Header title={t('incidents.title')} right={
        <Btn title={t('incidents.addShort')} icon="plus" kind="disaster" small onPress={startAdd} testID="inc-add" />
      } />
      <View style={st.bar}>
        <Row gap={8}>
          <Pressable onPress={() => setCityOpen(true)} accessibilityRole="button" accessibilityLabel={t('incidents.searchLabel')} testID="inc-city" style={st.city}>
            <Icon name="search" size={20} color={C.muted} />
            <Txt v="md" style={{ flex: 1 }} numberOfLines={1}>{at ? fmt.cityName(at) : t('incidents.allKz')}</Txt>
            <Icon name="chevDown" size={18} color={C.muted} />
          </Pressable>
          {at ? <IconBtn icon="kz" label={t('incidents.resetView')} onPress={() => chooseCity(null)} testID="inc-kz" /> : null}
        </Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} accessibilityLabel={t('incidents.groupsAria')}>
          {['all', ...groups.map((g) => g.code)].map((g) => (
            <Chip key={g} label={t(`incidents.groups.${g}`)} icon={g === 'all' ? 'layers' : GROUP_ICON[g]} count={counts[g] ?? 0}
              selected={group === g} onPress={() => { setGroup(g); setSel(null); }} testID={`inc-g-${g}`} color={C.ink} />
          ))}
        </ScrollView>
        <Segmented value={view} onChange={setView} testID="inc-view"
          options={[{ value: 'map', label: t('incidents.viewMap') }, { value: 'list', label: t('incidents.viewList') }]} />
      </View>

      {view === 'map' ? (
        <View style={{ flex: 1 }}>
          <QMap ref={mapRef} style={StyleSheet.absoluteFill} initialView={KZ} tiles={meta.mapConfig} demoLabel={t('demo.eventBadge')}
            events={events} reports={mapReports} selectedKey={selEvent ? `e:${selEvent.id}` : null}
            pick={{ enabled: picking }} bottomInset={sel ? 220 : 0}
            onSelect={(kind, id) => { if (!picking && kind !== 'request') setSel({ kind, id }); }}
            onPick={onPick} onTap={() => setSel(null)} onTilesFailed={() => setOffline(true)}
            onReady={() => mapRef.current?.kz()}
            testID="inc-map" accessibilityLabel={t('incidents.mapAria')} />
          {loading ? <View style={st.loading} pointerEvents="none"><Loading text={t('incidents.loading')} /></View> : null}
          <View style={st.topNotes} pointerEvents="box-none">
            {picking ? (
              <View style={[st.note, { borderColor: C.primary, borderWidth: 2 }]} testID="inc-pick-note">
                <Icon name="target" size={20} color={C.primary} />
                <Txt v="sm" style={{ flex: 1, fontWeight: '800' }}>{t('incidents.pickHint')}</Txt>
                <Btn title={t('incidents.pickCancel')} kind="ghost" small onPress={() => setPicking(false)} testID="inc-pick-cancel" />
              </View>
            ) : offline && !noteHidden ? (
              <View style={st.note} testID="inc-offline">
                <Icon name="alert" size={20} color={C.disaster} />
                <Txt v="xs" style={{ flex: 1 }}><Txt v="xs" style={{ fontWeight: '800' }}>{t('incidents.offlineBadge')}. </Txt>{t('incidents.offlineHint')}</Txt>
                <IconBtn icon="x" label={t('common.close')} size={36} onPress={() => setNoteHidden(true)} testID="inc-offline-x" />
              </View>
            ) : null}
            {error ? <View style={st.note}><Icon name="alert" size={20} color={C.red} /><Txt v="sm" style={{ flex: 1 }}>{fmt.errText(error)}</Txt><Btn title={t('common.retry')} small kind="secondary" onPress={reload} /></View> : null}
          </View>
          {selEvent || selReport ? null : <View style={[st.ctrls, { bottom: 28 }]}>
            <IconBtn icon="plus" label={t('map.zoomIn')} onPress={() => mapRef.current?.zoom(1)} testID="inc-zoom-in" />
            <IconBtn icon="minus" label={t('map.zoomOut')} onPress={() => mapRef.current?.zoom(-1)} testID="inc-zoom-out" />
            <IconBtn icon="kz" label={t('incidents.resetView')} onPress={() => (at ? chooseCity(null) : mapRef.current?.kz())} testID="inc-reset" />
          </View>}
          {selEvent ? (
            <View style={[st.sheet, { paddingBottom: insets.bottom + S[3] }]} testID="inc-sheet">
              <EventCard e={selEvent} onPress={() => router.push(`/event/${selEvent.id}`)} testID="inc-sheet-card" />
              <Row gap={8}>
                <Btn title={t('incidents.open')} icon="chevRight" small onPress={() => router.push(`/event/${selEvent.id}`)} testID="inc-open" />
                <Btn title={t('common.close')} kind="ghost" small onPress={() => setSel(null)} />
              </Row>
            </View>
          ) : selReport ? (
            <View style={[st.sheet, { paddingBottom: insets.bottom + S[3] }]} testID="inc-sheet">
              {pendingCard(selReport)}
              <Txt v="xs" color={C.muted}>{t('incidents.formIntro')}</Txt>
            </View>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: S[4], gap: S[3], paddingBottom: insets.bottom + S[8] }} testID="inc-list">
          <Alert kind="disaster" text={t('incidents.emergency')} />
          <Txt v="h3">{`${at ? fmt.cityName(at) : t('incidents.allKz')}: ${t('incidents.listTitle', { count: events.length })}`}</Txt>
          <Txt v="xs" color={C.muted}>{t('incidents.demoNote')}</Txt>
          {loading ? <Loading /> : error ? <ErrorView text={fmt.errText(error)} onRetry={reload} /> : (!events.length && !reports.length) ? (
            <Empty icon="map" title={t('incidents.empty')} text={t('incidents.emptyHint')} />
          ) : (
            <>
              {reports.map(pendingCard)}
              {events.map((e) => <EventCard key={e.id} e={e} onPress={() => router.push(`/event/${e.id}`)} testID={`inc-ev-${e.id}`} />)}
            </>
          )}
        </ScrollView>
      )}
      <CityPicker visible={cityOpen} value={at} onClose={() => setCityOpen(false)} onPick={chooseCity} title={t('incidents.searchLabel')} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  bar: { backgroundColor: C.surface, paddingHorizontal: S[4], paddingBottom: S[3], gap: S[2], borderBottomWidth: 1, borderBottomColor: C.border },
  city: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S[3], borderRadius: 12, borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.surface },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,246,251,0.6)' },
  topNotes: { position: 'absolute', top: 12, left: 12, right: 12, gap: 8 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: R.md, paddingVertical: 8, paddingHorizontal: 12, shadowColor: '#13203F', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  ctrls: { position: 'absolute', right: 12, gap: 8 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: S[3], gap: S[2], shadowColor: '#13203F', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
});
