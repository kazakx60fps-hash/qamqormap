// Табиғи апат оқиғасы: түрі, облысы, шамамен аумағы, жаңарту уақыты, дереккөз, мәртебелер, байланысты өтініштер.
import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { C, R, S } from '../../theme';
import { Screen } from '../../components/Screen';
import { Alert, Btn, Card, Empty, ErrorView, H1, H3, Loading, Row, Section, Txt, UgcNote } from '../../components/ui';
import { ActivityBadge, DemoBadge, DisasterTypeBadge, VerifyBadge } from '../../components/badges';
import { RequestCard } from '../../components/cards';
import { ConfirmDialog, useToast } from '../../components/overlays';
import { Icon } from '../../components/Icon';
import { QMap } from '../../map/QMap';
import { NeedsBoard } from '../../components/NeedsBoard';
import { useI18n } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { useMeta } from '../../lib/meta';
import { useFmt } from '../../lib/fmt';
import { useLoad } from '../../lib/useLoad';
import { ApiError, api } from '../../lib/api';
import { useFilters } from '../../lib/filters';
import type { DisasterEvent, RequestItem } from '../../lib/types';

type Hist = { id: number; action: string; changes: Record<string, unknown>; note: string | null; created_at: string; actor_name: string | null };
type Resp = { event: DisasterEvent; requests: RequestItem[]; history: Hist[] | null; viewer: { is_coordinator: boolean; logged_in: boolean } };

export default function EventView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eid = Number(id);
  const { t } = useI18n();
  const fmt = useFmt();
  const meta = useMeta();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { setFilters, setCityId } = useFilters();
  const { data, error, loading, reload, silent } = useLoad<Resp>(() => api(`/events/${eid}`), [eid, user?.id]);
  const [dlg, setDlg] = useState<null | 'verify' | 'activity'>(null);
  useFocusEffect(React.useCallback(() => { silent(); }, [eid])); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Screen title={t('event.number', { id: eid })}><Loading /></Screen>;
  if (error || !data) {
    return (
      <Screen title={t('event.number', { id: eid })}>
        {error instanceof ApiError && error.status === 404 ? <Empty icon="search" title={t('state.notFound')} /> : <ErrorView text={fmt.errText(error)} onRetry={reload} />}
      </Screen>
    );
  }
  const e = data.event;
  const coord = data.viewer.is_coordinator;
  const firstCity = e.areas.find((a) => a.city_id)?.city_id ?? null;
  const center = e.lat != null ? [e.lat, e.lng] as [number, number] : (() => {
    const c = firstCity ? meta.citiesById.get(firstCity) : null;
    return c ? [c.lat, c.lng] as [number, number] : [48.2, 67.5] as [number, number];
  })();
  const regions = [...new Set(e.areas.map((a) => (a.region_code ? a.region_code : a.city_id ? meta.citiesById.get(a.city_id)?.region_code : null)).filter(Boolean))] as string[];

  const setStatus = async (path: 'verification' | 'activity', status: string) => {
    try {
      await api(`/events/${eid}/${path}`, { method: 'POST', body: { status } });
      toast(t('event.saved'));
      setDlg(null);
      silent();
    } catch (err) { toast(fmt.errText(err), 'error'); }
  };

  const histLabel = (h: Hist) => t(`event.hist.${h.action}`);

  return (
    <Screen title={t('event.number', { id: eid })} testID="event-screen" onRefresh={silent}>
      {e.is_demo ? (
        <View style={st.demo} testID="event-demo-banner">
          <Row gap={8}><Icon name="flag" size={22} color={C.demo} /><Txt v="h3" color={C.demo} style={{ flex: 1 }}>{t('demo.eventBanner')}</Txt></Row>
          <Txt v="sm" color={C.ink2}>{t('demo.eventBannerLong')}</Txt>
        </View>
      ) : null}
      <Row wrap gap={6}>
        <DisasterTypeBadge code={e.type_code} />
        <VerifyBadge status={e.verification_status} />
        <ActivityBadge status={e.activity_status} />
        {e.is_demo ? <DemoBadge event /> : null}
      </Row>
      <H1 testID="event-title" ugc>{e.title}</H1>
      <Alert kind={e.verification_status === 'verified' ? 'success' : 'warn'}
        title={e.verification_status === 'verified' ? t('verify.verified') : t('verify.unverified')}
        text={e.verification_status === 'verified' ? t('verify.verifiedExplain') : t('verify.unverifiedExplain')} testID="verify-explain" />

      <Alert kind="disaster" title={t('disaster.emergencyTitle')} text={t('m.disaster.emergencyShort')} />

      <Card>
        <Info icon="layers" label={t('disaster.type')} value={t(`dtype.${e.type_code}`)} />
        <Info icon="kz" label={t('disaster.region')} value={regions.map((r) => fmt.regionName(r)).join(', ') || '—'} />
        <Info icon="map" label={t('event.area')} value={fmt.areaText(e.areas, e.location_note) + (e.radius_km ? ` · ~${e.radius_km} ${t('unit.km')}` : '')} />
        <Info icon="calendar" label={t('m.event.started')} value={fmt.dateTime(e.started_at)} />
        {e.ended_at ? <Info icon="check" label={t('event.endedAt')} value={fmt.dateTime(e.ended_at)} /> : null}
        <Info icon="refresh" label={t('event.lastUpdate')} value={fmt.dateTime(e.updated_at)} testID="event-updated" />
        <Info icon="external" label={t('event.source')} value={e.source_name || t('event.noSource')} />
        {e.source_url ? <Btn title={t('event.sourceLink')} kind="ghost" small icon="external" onPress={() => Linking.openURL(e.source_url!)} /> : null}
        {coord && e.verified_by_name ? <Info icon="shield" label={t('verify.verified')} value={`${e.verified_by_name} · ${fmt.dateTime(e.verified_at)}`} /> : null}
      </Card>

      <Section title={t('request.description')}>
        <Txt v="md" selectable ugc>{e.description}</Txt>
        <UgcNote contentLang={e.content_lang} />
      </Section>

      <View style={{ gap: 6 }}>
        <QMap style={st.map} initialView={{ center, zoom: e.radius_km && e.radius_km > 30 ? 8 : 10 }} tiles={meta.mapConfig} demoLabel={t('demo.eventBadge')}
          events={[{ ...e, lat: center[0], lng: center[1] }]} requests={data.requests} accessibilityLabel={t('event.mapAria')} testID="event-map"
          onSelect={(kind, rid) => { if (kind === 'request') router.push(`/request/${rid}`); }} />
        <Txt v="xs" color={C.muted}>{t('event.mapHint')}</Txt>
      </View>

      {e.activity_status === 'active' ? (
        <Card style={{ backgroundColor: C.disaster50, borderColor: C.disaster100 }}>
          <Txt v="sm" color={C.ink2}>{t('event.ctaHint')}</Txt>
          <Btn title={t('m.event.needHelp')} kind="disaster" icon="heart" onPress={() => router.push(`/request/new?event=${eid}`)} testID="event-need-help" />
          <Btn title={t('event.wantHelp')} kind="secondary" icon="hand" testID="event-want-help"
            onPress={() => { if (firstCity) setCityId(firstCity); setFilters({ direction: 'disaster', eventId: eid }); router.push('/'); }} />
        </Card>
      ) : <Alert kind="info" text={t('event.resolvedNoNew')} />}

      <NeedsBoard eventId={eid} />

      <Section title={t('event.relatedTitle', { count: data.requests.length })}>
        {data.requests.length === 0 ? <Empty icon="inbox" title={t('event.noRelated')} text={t('event.noRelatedText')} /> : data.requests.map((r) => (
          <RequestCard key={r.id} r={r} onPress={() => router.push(`/request/${r.id}`)}
            onHelp={r.status === 'open' ? () => router.push(`/request/${r.id}?apply=1`) : undefined} />
        ))}
      </Section>

      {coord ? (
        <Section title={t('coord.title')}>
          <Alert kind="info" text={t('event.noMassNotify')} />
          <Btn title={t('event.edit')} icon="edit" onPress={() => router.push(`/event-form?id=${eid}`)} testID="event-edit" />
          <Btn title={e.verification_status === 'verified' ? t('event.markUnverified') : t('event.markVerified')} kind="secondary" icon="shield"
            onPress={() => setDlg('verify')} testID="event-verify" />
          <Btn title={e.activity_status === 'active' ? t('event.resolve') : t('event.reopen')} kind="secondary" icon="check" onPress={() => setDlg('activity')} testID="event-activity" />
          {data.history?.length ? (
            <View style={{ gap: S[2] }} testID="event-history">
              <H3>{t('event.historyTitle')}</H3>
              {data.history.map((h) => (
                <Row key={h.id} gap={10} style={{ alignItems: 'flex-start' }}>
                  <Icon name="history" size={18} color={C.muted} />
                  <View style={{ flex: 1 }}>
                    <Txt v="sm" style={{ fontWeight: '700' }}>{histLabel(h)}</Txt>
                    <Txt v="xs" color={C.muted}>{fmt.dateTime(h.created_at)}{h.actor_name ? ` · ${h.actor_name}` : ''}</Txt>
                    {h.changes && Object.keys(h.changes).length ? <Txt v="xs" color={C.ink2}>{Object.keys(h.changes).map((k) => t(`event.f.${k}`)).join(', ')}</Txt> : null}
                  </View>
                </Row>
              ))}
            </View>
          ) : null}
        </Section>
      ) : null}

      <ConfirmDialog visible={dlg === 'verify'} title={e.verification_status === 'verified' ? t('event.markUnverified') : t('event.markVerified')}
        text={t('event.verifyText')} okLabel={t('common.confirm')} onClose={() => setDlg(null)} testID="verify-dlg"
        onConfirm={() => setStatus('verification', e.verification_status === 'verified' ? 'unverified' : 'verified')} />
      <ConfirmDialog visible={dlg === 'activity'} title={e.activity_status === 'active' ? t('event.resolve') : t('event.reopen')}
        text={t('event.noMassNotify')} okLabel={t('common.confirm')} onClose={() => setDlg(null)}
        onConfirm={() => setStatus('activity', e.activity_status === 'active' ? 'resolved' : 'active')} />
    </Screen>
  );
}

function Info({ icon, label, value, testID }: { icon: string; label: string; value: string; testID?: string }) {
  return (
    <Row gap={10} style={{ alignItems: 'flex-start' }}>
      <Icon name={icon} size={20} color={C.disaster} />
      <View style={{ flex: 1 }}>
        <Txt v="xs" color={C.muted}>{label}</Txt>
        <Txt v="md" testID={testID}>{value}</Txt>
      </View>
    </Row>
  );
}

const st = StyleSheet.create({
  demo: { gap: 6, padding: S[3], backgroundColor: C.demo50, borderRadius: R.md, borderWidth: 2, borderColor: '#E8CD73' },
  map: { height: 220, borderRadius: R.md, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
});
