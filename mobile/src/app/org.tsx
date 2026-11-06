// «Ұйым кабинеті» (мобильді): кіріс, жұмыста, аяқталған, тексеру кезегі, команда, көмек нәтижелері.
// Рұқсатты сервер тексереді: координатор тек өз ұйымының тапсырмаларын басқарады.
import { useMemo, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { C, R, S } from '../theme';
import { Screen } from '../components/Screen';
import { Alert, Badge, Btn, Card, Chip, Empty, ErrorView, Loading, Row, Txt, H3 } from '../components/ui';
import { categoryIcon, disasterIcon } from '../components/Icon';
import { RequestCard } from '../components/cards';
import { CityPicker } from '../components/CityPicker';
import { ConfirmDialog, SelectField, useToast } from '../components/overlays';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useMeta } from '../lib/meta';
import { useFmt } from '../lib/fmt';
import { useLoad } from '../lib/useLoad';
import { ApiError, api, apiBase, authHeaders } from '../lib/api';
import type { DisasterEvent, RequestItem, TeamOffer } from '../lib/types';

type Tab = 'incoming' | 'active' | 'done' | 'review' | 'team' | 'report';
const TABS: Tab[] = ['incoming', 'active', 'done', 'review', 'team', 'report'];
const STATUSES = ['open', 'assigned', 'in_progress', 'awaiting_confirmation'];
type Member = { id: number; full_name: string; phone: string | null; role: string; city_id: number | null; district: string | null; disaster_support: boolean; categories: string[]; active_tasks: number; completed: number };
type Report = { org: { name: string }; accepted: number; confirmed: number; open_need: number; median_hours: number | null; median_n: number;
  by_category: { code: string; accepted: number; confirmed: number; open_need: number }[]; demo: boolean };

const DAY = 864e5;
const ymd = (d: Date) => new Date(d.getTime() + 5 * 3600e3).toISOString().slice(0, 10);

export default function OrgScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const { t, lang } = useI18n();
  const fmt = useFmt();
  const meta = useMeta();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const orgs = user?.orgs ?? [];
  const [orgId, setOrgId] = useState<number | null>(orgs[0]?.id ?? null);
  const my = orgs.find((o) => o.id === orgId);
  const [tab, setTab] = useState<Tab>(TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'incoming');
  const [cityId, setCityId] = useState<number | null>(my?.city_id ?? null);
  const [catId, setCatId] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [eventId, setEventId] = useState<number | null>(null);
  const [days, setDays] = useState(30);
  const [cityOpen, setCityOpen] = useState(false);
  const [assign, setAssign] = useState<TeamOffer | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const events = useLoad(() => api<{ items: DisasterEvent[] }>('/events', { query: { limit: 200 } }), []);
  const period = useMemo(() => ({ from: ymd(new Date(Date.now() - (days - 1) * DAY)), to: ymd(new Date()) }), [days]);
  const list = useLoad<any>(async () => {
    if (!orgId) return null;
    if (tab === 'team') return (await api<{ items: Member[] }>(`/orgs/${orgId}/members`)).items;
    if (tab === 'report') return api<Report>(`/orgs/${orgId}/report`, { query: { ...period, city_id: cityId ?? undefined, event_id: eventId ?? undefined } });
    return (await api<{ items: RequestItem[] }>(`/orgs/${orgId}/requests`, {
      query: { view: tab, city_id: cityId ?? undefined, category_id: catId ?? undefined, status: tab === 'active' ? status || undefined : undefined, event_id: eventId ?? undefined },
    })).items;
  }, [orgId, tab, cityId, catId, status, eventId, period], { enabled: !!orgId && my?.role === 'coordinator' });
  useFocusEffect(useCallback(() => { if (orgId && my?.role === 'coordinator') list.silent(); }, [orgId, tab])); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Screen title={t('org.title')}><Empty icon="lock" title={t('state.loginNeeded')} /></Screen>;
  if (!orgs.length || !my) return <Screen title={t('org.title')}><Empty icon="users" title={t('org.noOrg')} text={t('org.noOrgText')} /></Screen>;

  const accept = async (rid: number) => {
    setBusy(rid);
    try {
      await api(`/orgs/${orgId}/requests/${rid}/accept`, { method: 'POST' });
      toast(t('org.acceptedDone'));
      setTab('active');
    } catch (e) { toast(fmt.errText(e), 'error'); list.silent(); } finally { setBusy(null); }
  };
  const doAssign = async () => {
    if (!assign) return;
    try {
      await api(`/requests/${assign.request_id}/assign`, { method: 'POST', body: { application_id: assign.application_id } });
      toast(t('org.assignedDone'));
    } catch (e) { toast(fmt.errText(e), 'error'); }
    setAssign(null);
    list.silent();
  };
  const shareCsv = async () => {
    try {
      const qs = new URLSearchParams({ ...period, lang, ...(cityId ? { city_id: String(cityId) } : {}), ...(eventId ? { event_id: String(eventId) } : {}) });
      const res = await fetch(`${apiBase()}/api/orgs/${orgId}/report.csv?${qs}`, { headers: { ...authHeaders(), 'X-Client': 'mobile' } });
      if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({})))?.code || 'UNKNOWN', '');
      const text = await res.text();
      const name = `qamqormap-report-${orgId}-${period.from}.csv`;
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        // Веб-нұсқа: файл ретінде жүктеу
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
        a.download = name;
        a.click();
        return;
      }
      // Android / iOS: жүйелік «Бөлісу» терезесі (пошта, мессенджер, файлдар)
      await Share.share({ title: name, message: text.replace(/^\uFEFF/, '') });
    } catch (e) { toast(fmt.errText(e), 'error'); }
  };

  const evOptions = [{ value: null as number | null, label: t('org.filters.noEvent') },
    ...(events.data?.items ?? []).map((e) => ({ value: e.id as number | null, label: e.title, hint: `${t(`dtype.${e.type_code}`)}${e.is_demo ? ' · ' + t('demo.eventBadge') : ''}`, icon: disasterIcon(e.type_code), color: C.disaster }))];

  const filters = tab === 'team' ? null : (
    <View style={{ gap: S[2] }}>
      <Row gap={8} wrap>
        <Btn title={`${t('org.filters.city')}: ${fmt.cityName(cityId)}`} kind="secondary" small icon="pin" onPress={() => setCityOpen(true)} testID="org-city" />
      </Row>
      {tab === 'report' ? (
        <Row gap={8} wrap>{[7, 30, 90].map((d) => <Chip key={d} label={t(`orgReport.last${d}`)} selected={days === d} onPress={() => setDays(d)} testID={`org-days-${d}`} />)}</Row>
      ) : (
        <SelectField<number | null> label={t('org.filters.category')} value={catId} onChange={setCatId} testID="org-cat"
          options={[{ value: null, label: t('org.filters.any') }, ...meta.categories.map((c) => ({ value: c.id as number | null, label: t(`catShort.${c.code}`), icon: categoryIcon(c.code) }))]} />
      )}
      {tab === 'active' ? (
        <SelectField<string> label={t('org.filters.status')} value={status} onChange={setStatus} testID="org-status"
          options={[{ value: '', label: t('org.filters.any') }, ...STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))]} />
      ) : null}
      <SelectField<number | null> label={t('org.filters.event')} value={eventId} onChange={setEventId} options={evOptions} testID="org-event" />
    </View>
  );

  const offers = (r: RequestItem) => {
    if (!r.team_offers) return null;
    const canChoose = r.org_id === orgId && r.status === 'open';
    return (
      <View style={st.offers}>
        <Txt v="sm" style={{ fontWeight: '800' }}>{t('org.teamOffers', { count: r.team_offers.length })}</Txt>
        {r.team_offers.length === 0 ? <Txt v="xs" color={C.muted}>{t('org.noTeamOffers')}</Txt> : r.team_offers.map((o) => (
          <View key={o.application_id} style={st.offer} testID={`team-offer-${o.application_id}`}>
            <Txt v="md" style={{ fontWeight: '700' }} ugc>{o.full_name}</Txt>
            <Row wrap gap={6}>
              <Badge label={o.volunteer_city_id ? fmt.cityName(o.volunteer_city_id) : '—'} fg={C.ink2} bg={C.surface} icon="pin" />
              <Badge label={t(o.category_match ? 'org.categoryMatch' : 'org.categoryNo')} fg={o.category_match ? C.green : C.amber} bg={o.category_match ? C.green50 : C.amber50} />
              {o.categories.slice(0, 3).map((c) => <Badge key={c} label={t(`catShort.${c}`)} fg={C.ink2} bg={C.surface} />)}
            </Row>
            {o.message ? <Txt v="xs" color={C.ink2} ugc>{o.message}</Txt> : null}
            {canChoose ? <Btn title={t('org.choose')} small icon="check" onPress={() => setAssign({ ...o, request_id: r.id })} testID={`org-assign-${o.application_id}`} /> : null}
          </View>
        ))}
        {r.other_offers ? <Txt v="xs" color={C.muted}>{t('org.otherOffers', { count: r.other_offers })}</Txt> : null}
      </View>
    );
  };

  const body = () => {
    if (my.role !== 'coordinator') return <ErrorView text={t('errors.ORG_COORDINATOR_ONLY')} />;
    if (list.loading) return <Loading />;
    if (list.error) return <ErrorView text={fmt.errText(list.error)} onRetry={list.reload} />;
    if (tab === 'team') {
      const m = (list.data ?? []) as Member[];
      if (!m.length) return <Empty icon="users" title={t('org.empty.team')} />;
      return m.map((x) => (
        <Card key={x.id} testID={`member-${x.id}`}>
          <Txt v="md" style={{ fontWeight: '800' }} ugc>{x.full_name}</Txt>
          <Txt v="xs" color={C.muted}>{t(`org.roles.${x.role}`)}{x.city_id ? ` · ${fmt.cityName(x.city_id)}` : ''}</Txt>
          <Row wrap gap={6}>{x.categories.map((c) => <Badge key={c} label={t(`catShort.${c}`)} fg={C.ink2} bg={C.surface2} icon={categoryIcon(c)} />)}</Row>
          <Txt v="xs" color={C.ink2}>{t('org.activeTasks', { count: x.active_tasks })} · {t('org.completed', { count: x.completed })}</Txt>
          {x.disaster_support ? <Badge label={t('org.disasterReady')} fg={C.disasterDark} bg={C.disaster50} icon="siren" /> : null}
          {x.phone ? <Txt v="sm" color={C.primaryDark}>{x.phone}</Txt> : null}
        </Card>
      ));
    }
    if (tab === 'report') {
      const rep = list.data as Report | null;
      if (!rep) return null;
      const empty = !rep.accepted && !rep.confirmed && !rep.open_need && !rep.median_n;
      const M = ({ id, n, label, hint, extra }: { id: string; n: string; label: string; hint: string; extra?: string }) => (
        <Card testID={`metric-${id}`}>
          <Txt v="h1" color={C.primaryDark} testID={`metric-${id}-value`}>{n}</Txt>
          <Txt v="md" style={{ fontWeight: '800' }}>{label}</Txt>
          <Txt v="xs" color={C.muted}>{hint}</Txt>
          {extra ? <Txt v="xs" color={C.ink2}>{extra}</Txt> : null}
        </Card>
      );
      return (
        <View style={{ gap: S[3] }}>
          <Row gap={8} wrap>
            {rep.demo ? <Badge label={t('orgReport.demo')} fg={C.demo} bg={C.demo50} icon="flag" testID="report-demo" /> : null}
            <Txt v="xs" color={C.muted}>{t('orgReport.period')}: {fmt.date(period.from)} — {fmt.date(period.to)} · {t('orgReport.source')}</Txt>
          </Row>
          {empty ? <Empty icon="inbox" title={t('orgReport.empty')} text={t('orgReport.emptyText')} /> : (
            <>
              <M id="accepted" n={String(rep.accepted)} label={t('orgReport.accepted')} hint={t('orgReport.acceptedHint')} />
              <M id="confirmed" n={String(rep.confirmed)} label={t('orgReport.confirmed')} hint={t('orgReport.confirmedHint')} />
              <M id="open" n={String(rep.open_need)} label={t('orgReport.openNeed')} hint={t('orgReport.openNeedHint')} />
              <M id="median" n={rep.median_hours == null ? '—' : t('orgReport.hours', { n: String(rep.median_hours).replace('.', lang === 'en' ? '.' : ',') })}
                label={t('orgReport.median')} hint={t('orgReport.medianHint')}
                extra={rep.median_n ? t('orgReport.medianN', { count: rep.median_n }) : t('orgReport.medianEmpty')} />
              {rep.by_category.length ? (
                <Card>
                  <H3>{t('orgReport.byCategory')}</H3>
                  {rep.by_category.map((c) => (
                    <Row key={c.code} gap={8} style={st.catRow}>
                      <Txt v="sm" style={{ flex: 1, fontWeight: '700' }}>{t(`catShort.${c.code}`)}</Txt>
                      <Txt v="xs" color={C.ink2}>{c.accepted} / {c.confirmed} / {c.open_need}</Txt>
                    </Row>
                  ))}
                  <Txt v="xs" color={C.muted}>{t('orgReport.accepted')} / {t('orgReport.confirmed')} / {t('orgReport.openNeed')}</Txt>
                </Card>
              ) : null}
            </>
          )}
          <Btn title={t('orgReport.csv')} icon="external" onPress={shareCsv} testID="report-csv" />
          <Txt v="xs" color={C.muted}>{t('orgReport.csvHint')}</Txt>
        </View>
      );
    }
    const items = (list.data ?? []) as RequestItem[];
    if (!items.length) return <Empty icon="inbox" title={t(`org.empty.${tab}`)} text={t('org.empty.hint')} />;
    return (
      <View style={{ gap: S[4] }}>
        {tab === 'review' ? <Alert kind="info" text={t('org.reviewHint')} /> : null}
        {tab === 'incoming' ? <Txt v="xs" color={C.muted}>{t('org.acceptHint')}</Txt> : null}
        {items.map((r) => (
          <View key={r.id} style={{ gap: S[2] }} testID={`org-req-${r.id}`}>
            <RequestCard r={r} compact onPress={tab === 'review' ? undefined : () => router.push(`/request/${r.id}`)} showModeration={tab === 'review'} />
            {r.org_accepted_at ? <Txt v="xs" color={C.muted}>{t('org.acceptedAt', { time: fmt.dateTime(r.org_accepted_at) })}</Txt> : null}
            {r.assignee_name ? <Txt v="xs" color={C.ink2} ugc>{t('org.assignee', { name: r.assignee_name })}</Txt> : null}
            {tab === 'incoming' ? <Btn title={t('org.accept')} icon="plus" loading={busy === r.id} onPress={() => accept(r.id)} testID={`org-accept-${r.id}`} /> : null}
            {r.disaster_event_id && tab !== 'review' ? <Btn title={t('org.needsLink')} kind="ghost" small icon="list" onPress={() => router.push(`/event/${r.disaster_event_id}`)} /> : null}
            {offers(r)}
          </View>
        ))}
      </View>
    );
  };

  return (
    <Screen title={t('org.title')} testID="org-screen" refreshing={list.refreshing} onRefresh={list.refresh}>
      <View style={{ gap: 6 }}>
        <Txt v="h3" ugc>{my.name}</Txt>
        <Row wrap gap={6}>
          <Badge label={t(`org.roles.${my.role}`)} fg={C.violet} bg={C.violet50} icon="users" />
          {my.is_demo ? <Badge label={t('orgReport.demo')} fg={C.demo} bg={C.demo50} icon="flag" /> : null}
        </Row>
        {orgs.length > 1 ? (
          <SelectField<number | null> label={t('org.selectOrg')} value={orgId} onChange={(v) => { setOrgId(v); setCityId(orgs.find((o) => o.id === v)?.city_id ?? null); }}
            options={orgs.map((o) => ({ value: o.id as number | null, label: o.name }))} />
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {TABS.map((k) => <Chip key={k} label={t(`org.tabs.${k}`)} selected={tab === k} onPress={() => { setTab(k); setStatus(''); }} testID={`org-tab-${k}`} />)}
      </ScrollView>
      {filters}
      {body()}
      <CityPicker visible={cityOpen} value={cityId} onClose={() => setCityOpen(false)} onPick={(id) => { setCityId(id); setCityOpen(false); }} />
      <ConfirmDialog visible={!!assign} title={t('request.dlg.assignTitle')} text={t('request.dlg.assignText', { name: assign?.full_name ?? '' })}
        okLabel={t('request.dlg.assignOk')} onClose={() => setAssign(null)} onConfirm={doAssign} testID="org-assign-dlg" />
    </Screen>
  );
}

const st = StyleSheet.create({
  offers: { gap: S[2], padding: S[3], borderRadius: R.md, backgroundColor: C.surface2 },
  offer: { gap: 6, padding: S[3], borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  catRow: { minHeight: 36, borderBottomWidth: 1, borderBottomColor: C.border },
});
