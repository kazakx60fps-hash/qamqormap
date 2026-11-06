// Өтініш беті: сипаттама, мәртебе, тарих, ұсыныстар, рөлге сай әрекеттер, жеке деректер (тек рұқсаты барға).
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { C, R, S } from '../../theme';
import { Screen } from '../../components/Screen';
import { Alert, Badge, Btn, Card, Check, Empty, ErrorView, Field, H1, H3, Loading, Row, Section, Txt, UgcNote } from '../../components/ui';
import { ActivityBadge, CategoryBadge, DemoBadge, ModerationBadge, StatusBadge, UrgencyBadge, VerifyBadge } from '../../components/badges';
import { BottomModal, ConfirmDialog, OptionSheet, ReasonDialog, useToast } from '../../components/overlays';
import { Icon, disasterIcon } from '../../components/Icon';
import { Photo } from '../../components/Photo';
import { QMap } from '../../map/QMap';
import { useI18n } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { useMeta } from '../../lib/meta';
import { useFmt } from '../../lib/fmt';
import { useLoad } from '../../lib/useLoad';
import { ApiError, api } from '../../lib/api';
import type { DisasterEvent } from '../../lib/types';

type Reason = { code: string; params: Record<string, any> };
type Detail = {
  request: any; private: { address: string; exact_lat: number; exact_lng: number; contact_phone: string } | null;
  events: { id: number; type: string; from: string | null; to: string | null; created_at: string; actor_role: string; actor_name?: string; note?: string }[];
  attachments: { id: number; visibility: string }[];
  applications: { id: number; volunteer_id: number; message: string; status: string; created_at: string; full_name: string; district: string | null; bio: string | null; completed_count: number; volunteer_city_id?: number | null; in_org_team?: boolean; category_match?: boolean }[] | null;
  my_application: { id: number; status: string; message: string } | null;
  assignee: { volunteer_id: number; full_name: string; assigned_at: string } | null;
  recommendations: { user_id: number; full_name: string; reasons: Reason[]; warnings: Reason[]; application_status: string | null }[] | null;
  duplicates: { id: number; title: string; reasons: Reason[] }[] | null;
  viewer: { is_author: boolean; is_assignee: boolean; is_coordinator: boolean; is_org_coordinator?: boolean; can_see_private: boolean; can_chat: boolean; logged_in: boolean };
};

type Dlg = null | 'apply' | 'withdraw' | 'assign' | 'start' | 'report' | 'confirm' | 'dispute' | 'reject' | 'cancel' | 'unassign' | 'event' | 'resolve';

export default function RequestView() {
  const { id, apply } = useLocalSearchParams<{ id: string; apply?: string }>();
  const rid = Number(id);
  const { t, tArr } = useI18n();
  const fmt = useFmt();
  const meta = useMeta();
  const router = useRouter();
  const toast = useToast();
  const { user, refreshSummary } = useAuth();
  const { data, error, loading, reload, silent } = useLoad<Detail>(() => api(`/requests/${rid}`), [rid, user?.id]);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [applyMsg, setApplyMsg] = useState('');
  const [safetyAck, setSafetyAck] = useState(false);
  const [applyErr, setApplyErr] = useState('');
  const [assignApp, setAssignApp] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<DisasterEvent[]>([]);
  const autoApply = useRef(false);

  useFocusEffect(React.useCallback(() => { silent(); }, [rid])); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (path: string, body: object = {}, done?: string) => {
    setBusy(true);
    try {
      const r = await api<{ already?: boolean }>(`/requests/${rid}/${path}`, { method: 'POST', body });
      toast(r?.already ? t('request.done.alreadyConfirmed') : done ?? t('form.saved'));
      setDlg(null);
      await silent();
      refreshSummary();
      meta.refreshCounts();
    } catch (e) {
      toast(fmt.errText(e), 'error');
      if (e instanceof ApiError && e.status === 409) silent();
    } finally {
      setBusy(false);
    }
  };

  const d = data;
  const r = d?.request;
  const v = d?.viewer;
  const isDisaster = r?.direction === 'disaster';
  const canApply = !!(r && v && user && !v.is_author && r.moderation_status === 'approved' && r.status === 'open' && (!d?.my_application || d.my_application.status !== 'active'));

  // Картадан «Көмектескім келеді» басылса — ұсыныс диалогы бірден ашылады
  useEffect(() => {
    if (apply === '1' && d && !autoApply.current) {
      autoApply.current = true;
      if (canApply) setDlg('apply');
    }
  }, [apply, d, canApply]);

  const sendApply = async () => {
    if (isDisaster && !safetyAck) { setApplyErr(t('fieldErrors.SAFETY_ACK')); return; }
    setBusy(true);
    try {
      await api(`/requests/${rid}/applications`, { method: 'POST', body: { message: applyMsg.trim(), safety_ack: safetyAck } });
      toast(t('request.done.applied'));
      setDlg(null);
      setApplyMsg('');
      await silent();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SAFETY_ACK_REQUIRED') setApplyErr(t('fieldErrors.SAFETY_ACK'));
      else toast(fmt.errText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const openEventDlg = async () => {
    try {
      const list = await api<{ items: DisasterEvent[] }>('/events', { query: { activity: 'active', city_id: r.city_id } });
      setEvents(list.items);
      setDlg('event');
    } catch (e) { toast(fmt.errText(e), 'error'); }
  };

  if (loading) return <Screen title={t('request.number', { id: rid })}><Loading text={t('request.loading')} /></Screen>;
  if (error || !d) {
    const nf = error instanceof ApiError && error.status === 404;
    return (
      <Screen title={t('request.number', { id: rid })}>
        {nf ? <Empty icon="search" title={t('state.notFound')} text={fmt.errText(error)} /> : <ErrorView text={fmt.errText(error)} onRetry={reload} />}
      </Screen>
    );
  }

  const point = d.private ? { lat: d.private.exact_lat, lng: d.private.exact_lng } : r.approx_lat != null ? { lat: r.approx_lat, lng: r.approx_lng } : null;
  const canEdit = v!.is_author && ['draft', 'pending', 'rejected'].includes(r.moderation_status) && r.status === 'open';
  const activeApps = (d.applications ?? []).filter((a) => a.status === 'active');
  const reasonText = (y: Reason) => {
    const p: Record<string, any> = { ...y.params };
    if (p.city_id) p.city = fmt.cityName(p.city_id);
    if (p.category) p.category = t(`catShort.${p.category}`);
    if (p.dow != null) p.day = tArr('date.days')[p.dow % 7];
    return t(`reco.${y.code}`, p);
  };

  // ───── Рөлге сай әрекеттер ─────
  const actions: React.ReactNode[] = [];
  if (!user && r.moderation_status === 'approved' && r.status === 'open') {
    actions.push(<Alert key="g" kind="info" text={t('request.act.loginToHelp')} />);
    actions.push(<Btn key="gl" title={t('request.act.loginAndHelp')} icon="login" onPress={() => router.push(`/login?next=/request/${rid}?apply=1`)} testID="login-to-help" />);
  }
  if (user && !v!.is_author && r.moderation_status === 'approved') {
    if (r.status === 'open') {
      if (d.my_application?.status === 'active') {
        actions.push(<Alert key="sent" kind="success" text={t('request.act.offerSent')} testID="offer-sent" />);
        actions.push(<Btn key="wd" title={t('request.act.withdraw')} kind="secondary" onPress={() => setDlg('withdraw')} testID="withdraw" />);
      } else {
        actions.push(<Txt key="h" v="sm" color={C.ink2}>{t('request.act.offerHint')}</Txt>);
        actions.push(<Btn key="ap" title={t('home.ctaHelp')} icon="hand" kind={isDisaster ? 'disaster' : 'primary'} onPress={() => setDlg('apply')} testID="apply" />);
      }
    } else if (!v!.is_assignee && !v!.is_coordinator && ['assigned', 'in_progress', 'awaiting_confirmation'].includes(r.status)) {
      actions.push(<Alert key="oc" kind="info" text={t('request.act.otherChosen2')} />);
    }
  }
  if (v!.is_assignee) {
    if (r.status === 'assigned') actions.push(<Btn key="st" title={t('request.act.start')} icon="play" onPress={() => act('start', {}, t('request.done.started'))} loading={busy} testID="start" />);
    if (r.status === 'in_progress') actions.push(<Btn key="dn" title={t('request.act.done')} icon="checkCircle" kind="success" onPress={() => setDlg('report')} testID="done" />);
    if (r.status === 'awaiting_confirmation') actions.push(<Alert key="wc" kind="info" text={t('request.act.waitConfirm')} />);
  }
  if (v!.is_author) {
    if (r.moderation_status === 'draft') actions.push(<Btn key="sb" title={t('form.submit')} icon="send" onPress={() => act('submit', {}, t('form.sentToReview'))} loading={busy} testID="submit-draft" />);
    if (canEdit) {
      actions.push(<Btn key="ed" title={r.moderation_status === 'rejected' ? t('form.resubmit') : t('common.edit')} icon="edit"
        kind={r.moderation_status === 'rejected' ? 'primary' : 'secondary'} onPress={() => router.push(`/request/new?edit=${rid}`)} testID="edit" />);
    }
    if (r.status === 'awaiting_confirmation') {
      actions.push(<Btn key="cf" title={t('request.act.confirm')} icon="check" kind="success" onPress={() => setDlg('confirm')} testID="confirm" />);
      actions.push(<Btn key="ds" title={t('request.act.dispute')} kind="danger" onPress={() => setDlg('dispute')} testID="dispute" />);
    }
  }
  if (v!.is_coordinator) {
    if (r.moderation_status === 'pending') {
      actions.push(<Btn key="aprv" title={t('request.act.approve')} icon="shield" kind="success" onPress={() => act('review', { decision: 'approve' }, t('request.done.approved'))} loading={busy} testID="approve" />);
      actions.push(<Btn key="rj" title={t('request.act.reject')} icon="edit" kind="danger" onPress={() => setDlg('reject')} testID="reject" />);
    }
    if (r.disputed && r.status === 'in_progress') {
      actions.push(<Btn key="rs1" title={t('request.act.resolveComplete')} kind="success" onPress={() => setDlg('resolve')} testID="resolve" />);
    }
    if (r.status === 'awaiting_confirmation' && !v!.is_author) {
      actions.push(<Btn key="cc" title={t('request.act.confirmAsCoord')} kind="secondary" onPress={() => setDlg('confirm')} />);
    }
    if (['assigned', 'in_progress'].includes(r.status)) actions.push(<Btn key="ua" title={t('request.act.unassign')} kind="secondary" onPress={() => setDlg('unassign')} testID="unassign" />);
    if (r.moderation_status !== 'draft' && !['completed', 'cancelled'].includes(r.status) && r.direction === 'disaster') {
      actions.push(<Btn key="ev" title={r.disaster_event_id ? t('request.act.changeEvent') : t('request.act.linkEvent')} kind="secondary" icon="siren" onPress={openEventDlg} testID="link-event" />);
    }
  }
  if ((v!.is_author || v!.is_coordinator) && !['completed', 'cancelled'].includes(r.status)) {
    actions.push(<Btn key="cn" title={r.moderation_status === 'draft' ? t('request.act.cancelDraft') : t('request.act.cancel')} kind="ghost" onPress={() => setDlg('cancel')} testID="cancel" />);
  }
  if (r.status === 'completed') actions.push(<Alert key="cmp" kind="success" text={t('request.act.completedInfo')} />);

  const stateAlert = (() => {
    if (r.moderation_status === 'draft') return <Alert kind="info" title={t('request.alert.draftTitle')} text={t('request.alert.draftText')} />;
    if (r.moderation_status === 'pending') return <Alert kind="warn" title={t('request.alert.pendingTitle')} text={t('request.alert.pendingText')} testID="alert-pending" />;
    if (r.moderation_status === 'rejected') return (
      <Alert kind="danger" title={t('request.alert.rejectedTitle')} text={t('request.alert.rejectedText')} testID="alert-rejected">
        {r.rejection_reason ? <Txt v="sm" style={{ marginTop: 4, fontWeight: '700' }} ugc>{t('form.coordNote')}: {r.rejection_reason}</Txt> : null}
      </Alert>
    );
    if (r.status === 'cancelled') return <Alert kind="warn" title={t('request.alert.cancelledTitle')} text={r.cancel_reason ?? undefined} />;
    if (r.status === 'completed') return <Alert kind="success" title={t('request.alert.completedTitle')} text={t('request.alert.completedText', { date: fmt.date(r.completed_at) })} testID="alert-completed" />;
    if (r.disputed) return <Alert kind="warn" title={t('request.alert.disputeTitle')} text={t('request.alert.disputeText')} />;
    if (r.status === 'awaiting_confirmation' && v!.is_author) return <Alert kind="success" title={t('request.alert.awaitTitle')} text={t('request.alert.awaitText')} />;
    return null;
  })();

  return (
    <Screen title={t('request.number', { id: rid })} testID="request-screen" refreshing={false} onRefresh={silent}>
      <Row wrap gap={6}>
        {r.moderation_status !== 'approved' ? <ModerationBadge status={r.moderation_status} /> : null}
        <StatusBadge status={r.status} />
        <UrgencyBadge urgency={r.urgency} />
        <CategoryBadge code={r.category_code} color={r.category_color} />
        {r.is_demo ? <DemoBadge /> : null}
        {r.org ? <Badge label={r.org.name} fg={C.violet} bg={C.violet50} icon="users" testID="request-org" /> : null}
      </Row>
      <H1 testID="request-title" ugc>{r.title}</H1>
      <Row gap={6}><Icon name="clock" size={16} color={C.muted} /><Txt v="xs" color={C.muted}>{r.published_at ? t('request.publishedAgo', { time: fmt.rel(r.published_at) }) : t('request.createdAgo', { time: fmt.rel(r.created_at) })}</Txt></Row>
      {stateAlert}

      {r.event ? (
        <Card style={st.event} onPress={() => router.push(`/event/${r.event.id}`)} testID="request-event">
          <Row gap={8}><Icon name={disasterIcon(r.event.type_code)} size={20} color={C.disasterDark} /><Txt v="xs" color={C.disasterDark}>{t('request.linkedEvent')} · {t(`dtype.${r.event.type_code}`)}</Txt></Row>
          <Txt v="md" style={{ fontWeight: '700' }} ugc>{r.event.title}</Txt>
          <Row wrap gap={6}><VerifyBadge status={r.event.verification_status} /><ActivityBadge status={r.event.activity_status} />{r.event.is_demo ? <DemoBadge event /> : null}</Row>
        </Card>
      ) : null}
      {isDisaster ? <Alert kind="disaster" title={t('disaster.safetyTitle')} text={t('disaster.safetyText')} /> : null}

      <Section title={t('request.description')}>
        <Txt v="md" selectable ugc>{r.description}</Txt>
        <UgcNote contentLang={r.content_lang} />
      </Section>

      <Card>
        <H3>{t('request.details')}</H3>
        <Detail icon="pin" label={t('request.approxPlace')} value={[fmt.cityName(r.city_id), r.district, r.public_place].filter(Boolean).join(' · ')} />
        <Detail icon="calendar" label={t('request.time')} value={fmt.neededText(r.needed_from, r.needed_to, r.needed_note)} />
        {r.quantity && r.quantity_unit ? <Detail icon="layers" label={t('form.quantity')} value={t(`units.${r.quantity_unit}`, { count: Number(r.quantity) })} testID="request-qty" /> : null}
        <Detail icon="user" label={t('request.author')} value={r.author_display} />
        {d.assignee ? <Detail icon="hand" label={t('request.assignee')} value={d.assignee.full_name} /> : null}
        {point ? (
          <View style={{ gap: 6 }}>
            <QMap style={st.mini} initialView={{ center: [point.lat, point.lng], zoom: 14 }} tiles={meta.mapConfig} demoLabel={t('demo.eventBadge')}
              requests={[{ ...r, approx_lat: point.lat, approx_lng: point.lng }]} accessibilityLabel={t('request.miniMapAria')} testID="request-map" />
            <Txt v="xs" color={C.muted}>{d.private ? t('request.mapExact') : t('request.mapApprox')}</Txt>
          </View>
        ) : null}
      </Card>

      <Card style={d.private ? { borderColor: C.green } : undefined} testID="private-block">
        <Row gap={8}><Icon name="lock" size={20} color={d.private ? C.green : C.muted} /><H3 style={{ flex: 1 }}>{t('request.private.title')}</H3></Row>
        {d.private ? (
          <>
            <Txt v="xs" color={C.muted}>{t('request.private.hint')}</Txt>
            <Detail icon="home" label={t('form.address')} value={d.private.address} testID="private-address" />
            <Pressable onPress={() => Linking.openURL(`tel:${d.private!.contact_phone.replace(/[^\d+]/g, '')}`)} accessibilityRole="link">
              <Detail icon="phone" label={t('form.phone')} value={d.private.contact_phone} testID="private-phone" />
            </Pressable>
          </>
        ) : <Txt v="sm" color={C.ink2} testID="private-locked">{t('request.private.locked')}</Txt>}
      </Card>

      {d.attachments.length ? (
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {d.attachments.map((a) => (
            <View key={a.id} style={{ gap: 4 }}>
              <Photo id={a.id} alt={t('request.photoAlt')} />
              <Txt v="xs" color={C.muted}>{a.visibility === 'public' ? t('request.photoPublic') : t('request.photoPrivate')}</Txt>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <Section title={t('request.actions')}>
        {v!.is_author ? <Badge label={t('request.yours')} fg={C.primaryDark} bg={C.primary50} icon="user" /> : null}
        {v!.is_assignee ? <Badge label={t('request.youAssignee')} fg={C.violet} bg={C.violet50} icon="hand" /> : null}
        {v!.is_org_coordinator ? <Badge label={t('role.org_coordinator')} fg={C.green} bg={C.green50} icon="users" testID="role-org-coordinator" /> : null}
        {v!.can_chat ? <Btn title={t('chat.title')} icon="chat" kind="secondary" onPress={() => router.push(`/chat/${rid}`)} testID="open-chat" /> : null}
        {actions.length ? actions : <Txt v="sm" color={C.muted}>{r.status === 'cancelled' ? t('request.act.cancelledInfo') : '—'}</Txt>}
      </Section>

      {d.applications ? (
        <Section title={t('request.apps.title')} right={<Txt v="xs" color={C.muted}>{t('request.apps.active', { count: activeApps.length })}</Txt>}>
          {d.applications.length === 0 ? <Txt v="sm" color={C.muted}>{r.moderation_status === 'approved' ? t('request.act.offersWillAppear') : t('request.apps.noneYet')}</Txt> : null}
          {d.applications.map((a) => (
            <Card key={a.id} testID={`application-${a.id}`}>
              <Row gap={8}>
                <View style={st.av}><Txt v="sm" color={C.white}>{a.full_name.slice(0, 1)}</Txt></View>
                <View style={{ flex: 1 }}>
                  <Txt v="md" style={{ fontWeight: '700' }} ugc>{a.full_name}</Txt>
                  <Txt v="xs" color={C.muted}>{t('request.apps.completedCount', { count: a.completed_count })} · {t(`appStatus.${a.status}`)}</Txt>
                </View>
              </Row>
              {a.message ? <Txt v="sm" color={C.ink2} ugc>{a.message}</Txt> : null}
              {r.org ? (
                <Row wrap gap={6}>
                  {a.volunteer_city_id ? <Badge label={fmt.cityName(a.volunteer_city_id)} fg={C.ink2} bg={C.surface2} icon="pin" /> : null}
                  {a.in_org_team ? <Badge label={t('org.tabs.team')} fg={C.violet} bg={C.violet50} icon="users" /> : null}
                  <Badge label={t(a.category_match ? 'org.categoryMatch' : 'org.categoryNo')} fg={a.category_match ? C.green : C.amber} bg={a.category_match ? C.green50 : C.amber50} />
                </Row>
              ) : null}
              {a.status === 'active' && r.status === 'open' && (v!.is_author || v!.is_coordinator || (v!.is_org_coordinator && a.in_org_team)) ? (
                <Btn title={t('request.apps.choose')} small icon="check" onPress={() => { setAssignApp(a.id); setDlg('assign'); }} testID={`assign-${a.id}`} />
              ) : null}
            </Card>
          ))}
        </Section>
      ) : null}

      {d.recommendations?.length ? (
        <Section title={t('request.reco.title')}>
          <Txt v="xs" color={C.muted}>{isDisaster ? t('request.reco.hintDisaster') : t('request.reco.hint')}</Txt>
          {d.recommendations.map((x) => (
            <Card key={x.user_id}>
              <Row gap={8}><Icon name="user" size={18} color={C.violet} /><Txt v="md" style={{ fontWeight: '700', flex: 1 }} ugc>{x.full_name}</Txt>
                {x.application_status === 'active' ? <Badge label={t('request.reco.applied')} fg={C.green} bg={C.green50} /> : null}</Row>
              {x.reasons.map((y, i) => <Row key={`r${i}`} gap={6}><Icon name="check" size={14} color={C.green} /><Txt v="xs" color={C.ink2} style={{ flex: 1 }}>{reasonText(y)}</Txt></Row>)}
              {x.warnings.map((y, i) => <Row key={`w${i}`} gap={6}><Icon name="alert" size={14} color={C.amber} /><Txt v="xs" color={C.ink2} style={{ flex: 1 }}>{reasonText(y)}</Txt></Row>)}
            </Card>
          ))}
        </Section>
      ) : null}

      {d.duplicates?.length ? (
        <Section title={t('request.dup.title')}>
          {d.duplicates.map((x) => (
            <Card key={x.id} onPress={() => router.push(`/request/${x.id}`)}>
              <Txt v="md" style={{ fontWeight: '700' }} ugc>№{x.id} · {x.title}</Txt>
              {x.reasons.map((y, i) => <Txt key={i} v="xs" color={C.ink2}>• {t(`dup.${y.code}`, { ...y.params, category: y.params.category ? t(`catShort.${y.params.category}`) : '' })}</Txt>)}
            </Card>
          ))}
          <Txt v="xs" color={C.muted}>{t('request.dup.hint')}</Txt>
        </Section>
      ) : null}

      <Section title={t('request.history')} right={<Txt v="xs" color={C.muted}>{t('request.eventsCount', { count: d.events.length })}</Txt>}>
        <View style={st.timeline} testID="history">
          {d.events.map((e, i) => (
            <View key={e.id} style={st.tlItem}>
              <View style={[st.tlDot, i === d.events.length - 1 && { backgroundColor: C.primary }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="sm" style={{ fontWeight: '700' }}>{t(`reqEvent.${e.type}`)}</Txt>
                <Txt v="xs" color={C.muted} ugc={!!e.actor_name}>{fmt.dateTime(e.created_at)} · {e.actor_name ?? t(`role.${e.actor_role}`)}</Txt>
                {e.note ? <Txt v="xs" color={C.ink2} ugc>{e.note}</Txt> : null}
              </View>
            </View>
          ))}
        </View>
      </Section>

      {/* ───── Диалогтар ───── */}
      <BottomModal visible={dlg === 'apply'} onClose={() => setDlg(null)} title={t('request.dlg.applyTitle')} testID="apply-dlg"
        footer={<Row gap={8}><Btn title={t('common.cancel')} kind="secondary" onPress={() => setDlg(null)} style={{ flex: 1 }} />
          <Btn title={t('request.dlg.applyOk')} onPress={sendApply} loading={busy} style={{ flex: 1.4 }} testID="apply-ok" /></Row>}>
        <Txt v="sm" color={C.ink2}>{t('request.dlg.applyText')}</Txt>
        <Field label={t('request.dlg.applyLabel')} placeholder={t('request.dlg.applyPh')} value={applyMsg} onChangeText={setApplyMsg} multiline optional testID="apply-msg" />
        {isDisaster ? (
          <View style={{ gap: 8 }}>
            <Alert kind="disaster" title={t('disaster.safetyTitle')} text={t('disaster.safetyText')} />
            <Check label={t('disaster.safetyAck')} value={safetyAck} onChange={(x) => { setSafetyAck(x); setApplyErr(''); }} testID="safety-ack" />
            {applyErr ? <Txt v="sm" color={C.red} testID="safety-error">{applyErr}</Txt> : null}
          </View>
        ) : null}
      </BottomModal>
      <ConfirmDialog visible={dlg === 'withdraw'} title={t('request.act.withdraw')} text={t('request.dlg.withdrawText')} okLabel={t('request.dlg.withdrawOk')}
        onClose={() => setDlg(null)} onConfirm={async () => {
          try { await api(`/requests/${rid}/applications/mine`, { method: 'DELETE' }); toast(t('request.done.withdrawn')); setDlg(null); silent(); }
          catch (e) { toast(fmt.errText(e), 'error'); }
        }} />
      <ConfirmDialog visible={dlg === 'assign'} title={t('request.dlg.assignTitle')} testID="assign-dlg"
        text={t('request.dlg.assignText', { name: d.applications?.find((a) => a.id === assignApp)?.full_name ?? '' })} okLabel={t('request.dlg.assignOk')}
        onClose={() => setDlg(null)} onConfirm={() => act('assign', { application_id: assignApp }, t('request.done.assigned'))} />
      <ReasonDialog visible={dlg === 'report'} title={t('request.act.done')} text={t('request.dlg.reportText')} label={t('request.dlg.reportLabel')}
        placeholder={t('request.dlg.reportPh')} okLabel={t('request.dlg.reportOk')} required={false} testID="report-dlg"
        onClose={() => setDlg(null)} onSubmit={(note) => act('submit-completion', { note }, t('request.done.reported'))} />
      <ConfirmDialog visible={dlg === 'confirm'} title={t('request.act.confirm')} text={t('request.dlg.confirmText')} okLabel={t('request.dlg.confirmOk')} testID="confirm-dlg"
        onClose={() => setDlg(null)} onConfirm={() => act('confirm-completion', {}, t('request.done.confirmed'))} />
      <ReasonDialog visible={dlg === 'dispute'} title={t('request.act.dispute')} text={t('request.dlg.disputeText')} label={t('request.dlg.disputeLabel')}
        okLabel={t('request.dlg.disputeOk')} danger onClose={() => setDlg(null)} onSubmit={(note) => act('dispute', { note }, t('request.done.disputed'))} />
      <ReasonDialog visible={dlg === 'reject'} title={t('request.act.reject')} label={t('request.dlg.rejectLabel')} placeholder={t('request.dlg.rejectPh')}
        okLabel={t('request.dlg.rejectOk')} danger testID="reject-dlg" onClose={() => setDlg(null)}
        onSubmit={(reason) => act('review', { decision: 'reject', reason }, t('request.done.rejected'))} />
      <ReasonDialog visible={dlg === 'cancel'} title={t('request.act.cancel')} text={t('request.dlg.cancelText')} label={t('request.dlg.cancelLabel')}
        okLabel={t('request.dlg.cancelOk')} danger onClose={() => setDlg(null)} onSubmit={(reason) => act('cancel', { reason }, t('request.done.cancelled'))} />
      <ReasonDialog visible={dlg === 'unassign'} title={t('request.act.unassign')} text={t('request.dlg.unassignText')} label={t('common.reason')}
        okLabel={t('request.dlg.unassignOk')} danger onClose={() => setDlg(null)} onSubmit={(reason) => act('unassign', { reason }, t('request.done.unassigned'))} />
      <ReasonDialog visible={dlg === 'resolve'} title={t('coord.resolve')} label={t('request.dlg.decisionLabel')} okLabel={t('request.act.resolveComplete')}
        required={false} onClose={() => setDlg(null)} onSubmit={(note) => act('resolve-dispute', { decision: 'complete', note }, t('request.done.disputeCompleted'))} />
      <OptionSheet visible={dlg === 'event'} title={t('request.act.linkEvent')} value={r.disaster_event_id ?? null} onClose={() => setDlg(null)} testID="event-pick"
        options={[{ value: null, label: t('form.noEvent') }, ...events.map((e) => ({ value: e.id as number | null, label: e.title, icon: disasterIcon(e.type_code), color: C.disaster, hint: t(`dtype.${e.type_code}`) }))]}
        onPick={(eventId) => act('event', { event_id: eventId }, t('request.done.eventLinked'))} />
    </Screen>
  );
}

function Detail({ icon, label, value, testID }: { icon: string; label: string; value: string; testID?: string }) {
  return (
    <Row gap={10} style={{ alignItems: 'flex-start' }}>
      <Icon name={icon} size={20} color={C.primary} />
      <View style={{ flex: 1 }}>
        <Txt v="xs" color={C.muted}>{label}</Txt>
        <Txt v="md" testID={testID} selectable ugc>{value || '—'}</Txt>
      </View>
    </Row>
  );
}

const st = StyleSheet.create({
  event: { backgroundColor: C.disaster50, borderColor: C.disaster100 },
  mini: { height: 180, borderRadius: R.md, overflow: 'hidden' },
  av: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.violet, alignItems: 'center', justifyContent: 'center' },
  timeline: { gap: S[3], paddingLeft: 4 },
  tlItem: { flexDirection: 'row', gap: 12 },
  tlDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.borderStrong, marginTop: 5 },
});
