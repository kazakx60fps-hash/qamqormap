// Өтініш және апат оқиғасының карточкалары (карта панелінде, тізімдерде, кабинетте).
import { StyleSheet, View } from 'react-native';
import { C, R, S } from '../theme';
import { Icon, categoryIcon, disasterIcon } from './Icon';
import { Btn, Card, Row, Txt, UgcNote } from './ui';
import { ActivityBadge, DemoBadge, ModerationBadge, StatusBadge, UrgencyBadge, VerifyBadge } from './badges';
import { useI18n } from '../i18n';
import { useFmt } from '../lib/fmt';
import type { DisasterEvent, RequestItem } from '../lib/types';

export function RequestCard({ r, selected, onPress, onMore, onHelp, helpLabel, showModeration, testID, compact }: {
  r: RequestItem; selected?: boolean; onPress?: () => void; onMore?: () => void; onHelp?: () => void; helpLabel?: string;
  showModeration?: boolean; testID?: string; compact?: boolean;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  const place = [fmt.cityName(r.city_id), r.district].filter(Boolean).join(' · ');
  return (
    <Card selected={selected} onPress={onPress} testID={testID ?? `req-card-${r.id}`} accessibilityLabel={r.title}
      style={r.direction === 'disaster' ? { borderLeftWidth: 4, borderLeftColor: C.disaster } : undefined}>
      <Row gap={10} style={{ alignItems: 'flex-start' }}>
        <View style={[st.catIcon, { backgroundColor: r.category_color }]}>
          <Icon name={categoryIcon(r.category_code)} size={20} color={C.white} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt v="xs" color={r.direction === 'disaster' ? C.disasterDark : C.primaryDark}>{t(`cat.${r.category_code}`)}</Txt>
          <Txt v="lg" style={{ fontWeight: '700' }} numberOfLines={compact ? 2 : 3} ugc>{r.title}</Txt>
        </View>
      </Row>
      <Row wrap gap={6}>
        {showModeration && r.moderation_status !== 'approved' ? <ModerationBadge status={r.moderation_status} /> : <StatusBadge status={r.status} />}
        <UrgencyBadge urgency={r.urgency} />
        {r.disaster_type_code ? <Row gap={4} style={st.dtype}><Icon name={disasterIcon(r.disaster_type_code)} size={14} color={C.disasterDark} /><Txt v="xs" color={C.disasterDark}>{t(`dtype.${r.disaster_type_code}`)}</Txt></Row> : null}
        {r.is_demo ? <DemoBadge /> : null}
      </Row>
      <Row gap={6} wrap>
        <Icon name="pin" size={16} color={C.muted} />
        <Txt v="sm" color={C.ink2} style={{ flexShrink: 1 }} ugc={!!r.district}>{place}</Txt>
      </Row>
      <Row gap={6}>
        <Icon name="clock" size={16} color={C.muted} />
        <Txt v="xs" color={C.muted}>{t('m.card.updated', { time: fmt.rel(r.updated_at || r.published_at || r.created_at) })}</Txt>
        {r.applications_count ? <Txt v="xs" color={C.muted}>· {t('card.offers', { count: r.applications_count })}</Txt> : null}
      </Row>
      {r.quantity && r.quantity_unit ? (
        <Row gap={6}><Icon name="layers" size={16} color={C.muted} /><Txt v="sm" color={C.ink2} testID={`req-qty-${r.id}`}>{t(`units.${r.quantity_unit}`, { count: Number(r.quantity) })}</Txt></Row>
      ) : null}
      {!compact ? <UgcNote contentLang={r.content_lang} /> : null}
      {onMore || onHelp ? (
        <Row gap={8} style={{ marginTop: 4 }}>
          {onMore ? <Btn title={t('common.more')} kind="secondary" small onPress={onMore} style={{ flex: 1 }} testID={`req-more-${r.id}`} /> : null}
          {onHelp ? <Btn title={helpLabel ?? t('home.ctaHelp')} small icon="hand" onPress={onHelp} style={{ flex: 1.3 }} testID={`req-help-${r.id}`} /> : null}
        </Row>
      ) : null}
    </Card>
  );
}

export function EventCard({ e, selected, onPress, onMore, testID }: { e: DisasterEvent; selected?: boolean; onPress?: () => void; onMore?: () => void; testID?: string }) {
  const { t } = useI18n();
  const fmt = useFmt();
  return (
    <Card selected={selected} onPress={onPress} testID={testID ?? `ev-card-${e.id}`} accessibilityLabel={e.title}
      style={[st.evCard, e.activity_status === 'resolved' && { opacity: 0.92 }]}>
      <Row gap={10} style={{ alignItems: 'flex-start' }}>
        <View style={st.diamondWrap}><View style={st.diamond} /><View style={st.diamondIcon}><Icon name={disasterIcon(e.type_code)} size={20} color={C.white} /></View></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt v="xs" color={C.disasterDark}>{t(`dtype.${e.type_code}`)} · {t('m.event.kind')}</Txt>
          <Txt v="lg" style={{ fontWeight: '700' }} numberOfLines={3} ugc>{e.title}</Txt>
        </View>
      </Row>
      {e.is_demo ? (
        <View style={st.demoStrip} testID="event-demo-strip"><Icon name="flag" size={14} color={C.demo} /><Txt v="xs" color={C.demo}>{t('demo.eventBanner')}</Txt></View>
      ) : null}
      <Row wrap gap={6}>
        <VerifyBadge status={e.verification_status} />
        <ActivityBadge status={e.activity_status} />
      </Row>
      <Row gap={6} wrap><Icon name="map" size={16} color={C.muted} /><Txt v="sm" color={C.ink2} style={{ flexShrink: 1 }} ugc={!!e.location_note}>{fmt.areaText(e.areas, e.location_note)}</Txt></Row>
      <Row gap={6} wrap>
        <Icon name="clock" size={16} color={C.muted} />
        <Txt v="xs" color={C.muted}>{t('event.updated', { time: fmt.dateTime(e.updated_at) })}</Txt>
        <Txt v="xs" color={C.disasterDark}>· {t('event.requestsCount', { count: e.requests_count })}</Txt>
      </Row>
      {onMore ? <Btn title={t('event.open')} kind="secondary" small onPress={onMore} testID={`ev-more-${e.id}`} /> : null}
    </Card>
  );
}

const st = StyleSheet.create({
  catIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dtype: { backgroundColor: C.disaster50, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.pill },
  evCard: { borderColor: C.disaster100, borderLeftWidth: 4, borderLeftColor: C.disaster },
  diamondWrap: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  diamond: { position: 'absolute', width: 30, height: 30, backgroundColor: C.disaster, borderRadius: 6, transform: [{ rotate: '45deg' }] },
  diamondIcon: { alignItems: 'center', justifyContent: 'center' },
  demoStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.demo50, borderRadius: R.sm, paddingHorizontal: S[2], paddingVertical: 6, borderWidth: 1, borderColor: '#F1DD9A' },
});
