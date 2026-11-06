// Координатор панелі: модерация кезегі, сүзгілер, өтініштер тобы, апат туралы хабарлар, оқиғаларды басқару.
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { C, S } from '../theme';
import { Screen } from '../components/Screen';
import { Alert, Badge, Btn, Card, Chip, Empty, ErrorView, Loading, Row, Segmented, Txt, UgcNote } from '../components/ui';
import { EventCard, RequestCard } from '../components/cards';
import { CityPicker } from '../components/CityPicker';
import { OptionSheet, ReasonDialog, useToast } from '../components/overlays';
import { disasterIcon } from '../components/Icon';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useFmt } from '../lib/fmt';
import { useLoad } from '../lib/useLoad';
import { api } from '../lib/api';
import type { DisasterEvent, RequestItem } from '../lib/types';

type View_ = 'queue' | 'disputes' | 'active' | 'open' | 'rejected' | 'completed' | 'cancelled' | 'reports' | 'events';
const VIEWS: View_[] = ['queue', 'reports', 'events', 'disputes', 'active', 'open', 'rejected', 'completed', 'cancelled'];
type Report = { id: number; description: string; source_name: string | null; content_lang: string; status: string; city_id: number | null; event_id: number | null; created_at: string; type_code: string; reporter_name: string };

export default function Coordinator() {
  const params = useLocalSearchParams<{ view?: string }>();
  const { t } = useI18n();
  const fmt = useFmt();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [view, setView] = useState<View_>((VIEWS as string[]).includes(params.view ?? '') ? (params.view as View_) : 'queue');
  const [direction, setDirection] = useState<'all' | 'everyday' | 'disaster'>('all');
  const [cityId, setCityId] = useState<number | null>(null);
  const [cityOpen, setCityOpen] = useState(false);
  const [linkFor, setLinkFor] = useState<Report | null>(null);
  const [dismissFor, setDismissFor] = useState<Report | null>(null);
  const [events, setEvents] = useState<DisasterEvent[]>([]);
  const q = { city_id: cityId ?? undefined, direction: direction === 'all' ? undefined : direction };

  const overview = useLoad(() => api<{ counts: Record<string, number> }>('/coordinator/overview', { query: q }), [cityId, direction], { enabled: !!user?.is_coordinator });
  const list = useLoad<any[]>(async () => {
    if (view === 'queue') return (await api<{ items: RequestItem[] }>('/coordinator/queue', { query: q })).items;
    if (view === 'reports') return (await api<{ items: Report[] }>('/coordinator/disaster-reports', { query: { status: 'pending' } })).items;
    if (view === 'events') return (await api<{ items: DisasterEvent[] }>('/events', { query: { city_id: cityId ?? undefined } })).items;
    return (await api<{ items: RequestItem[] }>('/coordinator/requests', { query: { ...q, view } })).items;
  }, [view, cityId, direction], { enabled: !!user?.is_coordinator });
  useFocusEffect(React.useCallback(() => { if (user?.is_coordinator) { list.silent(); overview.silent(); } }, [user?.is_coordinator, view])); // eslint-disable-line

  if (!user?.is_coordinator) return <Screen title={t('nav.coordPanel')}><Empty icon="lock" title={t('state.noAccess')} text={t('errors.COORDINATOR_ONLY')} /></Screen>;

  const counts = overview.data?.counts ?? {};
  const countKey: Record<View_, string> = { queue: 'pending', disputes: 'disputes', active: 'active', open: 'open', rejected: 'rejected', completed: 'completed', cancelled: 'cancelled', reports: 'reports', events: '' };
  const refreshAll = () => { list.silent(); overview.silent(); };

  const openLink = async (r: Report) => {
    try {
      setEvents((await api<{ items: DisasterEvent[] }>('/events', { query: { activity: 'active' } })).items);
      setLinkFor(r);
    } catch (e) { toast(fmt.errText(e), 'error'); }
  };

  return (
    <Screen title={t('nav.coordPanel')} testID="coordinator-screen" refreshing={list.refreshing} onRefresh={() => { list.refresh(); overview.silent(); }}>
      <Txt v="sm" color={C.ink2}>{t('coord.lead')}</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {VIEWS.map((v) => (
          <Chip key={v} label={t(v === 'events' ? 'm.coord.events' : `coord.views.${v}`)} selected={view === v} onPress={() => setView(v)}
            count={countKey[v] ? counts[countKey[v]] ?? 0 : undefined} icon={v === 'reports' || v === 'events' ? 'siren' : undefined}
            color={v === 'reports' || v === 'events' ? C.disaster : undefined} testID={`coord-view-${v}`} />
        ))}
      </ScrollView>
      {view !== 'reports' ? (
        <Row gap={8} wrap>
          <Btn title={fmt.cityName(cityId)} kind="secondary" small icon="pin" onPress={() => setCityOpen(true)} testID="coord-city" />
          {view !== 'events' ? (
            <View style={{ flex: 1, minWidth: 240 }}>
              <Segmented value={direction} onChange={setDirection} testID="coord-dir"
                options={[{ value: 'all', label: t('dir.all') }, { value: 'everyday', label: t('dir.everyday') }, { value: 'disaster', label: t('dir.disaster') }]} />
            </View>
          ) : null}
        </Row>
      ) : null}
      {view === 'events' ? <Btn title={t('coord.newEvent')} kind="disaster" icon="plus" onPress={() => router.push('/event-form')} testID="coord-new-event" /> : null}
      {view === 'reports' ? <Alert kind="info" text={t('coord.reportsHint')} /> : null}

      {list.loading ? <Loading /> : list.error ? <ErrorView text={fmt.errText(list.error)} onRetry={list.reload} /> : (list.data ?? []).length === 0 ? (
        view === 'queue' ? <Empty icon="checkCircle" title={t('coord.queueEmpty')} text={t('coord.queueEmptyText', { city: fmt.cityName(cityId) })} />
          : view === 'reports' ? <Empty icon="siren" title={t('coord.noReports')} />
            : <Empty icon="inbox" title={t('coord.listEmpty')} text={t('coord.listEmptyText', { city: fmt.cityName(cityId) })} />
      ) : view === 'reports' ? (list.data as Report[]).map((r) => (
        <Card key={r.id} testID={`report-${r.id}`} style={{ borderLeftWidth: 4, borderLeftColor: C.disaster }}>
          <Row gap={6} wrap>
            <Badge label={t(`dtype.${r.type_code}`)} fg={C.white} bg={C.disaster} icon={disasterIcon(r.type_code)} />
            <Badge label={t(`report.status.${r.status}`)} fg={C.amber} bg={C.amber50} />
            <Badge label={t('verify.unverified')} fg={C.amber} bg={C.amber50} icon="alert" />
          </Row>
          <Txt v="xs" color={C.muted} ugc>№{r.id} · {r.city_id ? fmt.cityName(r.city_id) : '—'} · {fmt.dateTime(r.created_at)} · {r.reporter_name}</Txt>
          <Txt v="md" ugc>{r.description}</Txt>
          <UgcNote contentLang={r.content_lang} />
          {r.source_name ? <Txt v="xs" color={C.ink2}>{t('event.source')}: {r.source_name}</Txt> : null}
          <Row gap={8} wrap>
            <Btn title={t('coord.report.create')} small kind="disaster" icon="plus" onPress={() => router.push(`/event-form?report=${r.id}`)} testID={`report-create-${r.id}`} />
            <Btn title={t('coord.report.link')} small kind="secondary" onPress={() => openLink(r)} testID={`report-link-${r.id}`} />
            <Btn title={t('coord.report.dismiss')} small kind="ghost" onPress={() => setDismissFor(r)} testID={`report-dismiss-${r.id}`} />
          </Row>
        </Card>
      )) : view === 'events' ? (list.data as DisasterEvent[]).map((e) => (
        <EventCard key={e.id} e={e} onPress={() => router.push(`/event/${e.id}`)} />
      )) : (list.data as RequestItem[]).map((r) => (
        <View key={r.id} style={{ gap: 6 }}>
          <RequestCard r={r} showModeration onPress={() => router.push(`/request/${r.id}`)} testID={`coord-req-${r.id}`} />
          <Row gap={8} wrap style={{ paddingHorizontal: 4 }}>
            {r.author_name ? <Txt v="xs" color={C.muted} ugc>{t('coord.author')}: {r.author_name}</Txt> : null}
            {r.assignee_name ? <Txt v="xs" color={C.muted} ugc>· {t('request.assignee')}: {r.assignee_name}</Txt> : null}
            {r.duplicates?.length ? <Badge label={t('coord.possibleDup', { count: r.duplicates.length })} fg={C.amber} bg={C.amber50} icon="copy" /> : null}
          </Row>
        </View>
      ))}
      <View style={{ height: S[4] }} />

      <CityPicker visible={cityOpen} value={cityId} onClose={() => setCityOpen(false)} onPick={(id) => { setCityId(id); setCityOpen(false); }} />
      <OptionSheet visible={!!linkFor} title={t('coord.report.link')} value={null as number | null} onClose={() => setLinkFor(null)}
        options={events.map((e) => ({ value: e.id as number | null, label: e.title, hint: t(`dtype.${e.type_code}`), icon: disasterIcon(e.type_code), color: C.disaster }))}
        onPick={async (eventId) => {
          if (!linkFor || !eventId) return;
          try { await api(`/coordinator/disaster-reports/${linkFor.id}/link`, { method: 'POST', body: { event_id: eventId } }); toast(t('coord.report.linked')); setLinkFor(null); refreshAll(); }
          catch (e) { toast(fmt.errText(e), 'error'); }
        }} />
      <ReasonDialog visible={!!dismissFor} title={t('coord.report.dismiss')} text={t('coord.report.dismissText')} label={t('common.reason')} okLabel={t('coord.report.dismiss')} min={3}
        onClose={() => setDismissFor(null)} onSubmit={async (note) => {
          if (!dismissFor) return;
          try { await api(`/coordinator/disaster-reports/${dismissFor.id}/dismiss`, { method: 'POST', body: { note } }); toast(t('coord.report.dismissed')); setDismissFor(null); refreshAll(); }
          catch (e) { toast(fmt.errText(e), 'error'); }
        }} />
    </Screen>
  );
}
