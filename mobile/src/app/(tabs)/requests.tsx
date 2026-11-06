// «Өтініштер»: жалпы лента (қала мен сүзгі бойынша), менің өтініштерім, ұсыныстарым, тапсырмаларым.
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { C, R, S } from '../../theme';
import { Header } from '../../components/Screen';
import { Badge, Btn, Chip, Empty, ErrorView, IconBtn, Loading, Row, Segmented, Txt } from '../../components/ui';
import { RequestCard } from '../../components/cards';
import { CityPicker } from '../../components/CityPicker';
import { FilterSheet } from '../../components/FilterSheet';
import { LoginPrompt } from '../../components/LoginPrompt';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { useFilters } from '../../lib/filters';
import { useFmt } from '../../lib/fmt';
import { useLoad } from '../../lib/useLoad';
import { api } from '../../lib/api';
import { requestQuery } from '../../lib/queries';
import type { RequestItem } from '../../lib/types';

type Seg = 'all' | 'mine' | 'offers' | 'tasks';

export default function RequestsTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ seg?: string }>();
  const [seg, setSeg] = useState<Seg>((['all', 'mine', 'offers', 'tasks'].includes(params.seg ?? '') ? params.seg : 'all') as Seg);
  const { cityId, setCityId, filters, setFilters, activeFilterCount } = useFilters();
  const [cityOpen, setCityOpen] = useState(false);
  const [fOpen, setFOpen] = useState(false);

  React.useEffect(() => { if (params.seg && ['all', 'mine', 'offers', 'tasks'].includes(params.seg)) setSeg(params.seg as Seg); }, [params.seg]);

  const needAuth = seg !== 'all' && !user;
  const { data, error, loading, refreshing, reload, refresh, silent } = useLoad<RequestItem[]>(async () => {
    if (seg === 'all') return (await api<{ items: RequestItem[] }>('/requests', { query: requestQuery(cityId, filters, 100) })).items;
    const path = seg === 'mine' ? '/me/requests' : seg === 'offers' ? '/me/applications' : '/me/tasks';
    return (await api<{ items: RequestItem[] }>(path)).items;
  }, [seg, cityId, filters, user?.id], { enabled: !needAuth });
  useFocusEffect(useCallback(() => { if (!needAuth) silent(); }, [needAuth])); // eslint-disable-line react-hooks/exhaustive-deps

  const segs = [
    { value: 'all' as Seg, label: t('m.req.seg.all') },
    { value: 'mine' as Seg, label: t('m.req.seg.mine') },
    { value: 'offers' as Seg, label: t('m.req.seg.offers') },
    { value: 'tasks' as Seg, label: t('m.req.seg.tasks') },
  ];

  const empty = seg === 'all'
    ? <Empty icon="search" title={t('map.emptyFiltered')} text={t('map.emptyFilteredHint')} />
    : seg === 'mine'
      ? <Empty icon="inbox" title={t('dash.empty.requests')} text={t('dash.empty.requestsText')} action={<Btn title={t('dash.newRequest')} icon="plus" onPress={() => router.push('/request/new')} />} />
      : seg === 'offers'
        ? <Empty icon="hand" title={t('dash.empty.applications')} text={t('dash.empty.applicationsText')} action={<Btn title={t('dash.findRequest')} kind="secondary" icon="map" onPress={() => router.push('/')} />} />
        : <Empty icon="checkCircle" title={t('dash.empty.tasks')} text={t('dash.empty.tasksText')} />;

  return (
    <View style={st.wrap} testID="requests-screen">
      <Header title={t('m.tabs.requests')} back={false} />
      <View style={{ paddingHorizontal: S[4], gap: S[3], paddingBottom: S[2] }}>
        <Segmented value={seg} onChange={setSeg} options={segs} testID="req-seg" />
        {seg === 'all' ? (
          <Row gap={8}>
            <Pressable onPress={() => setCityOpen(true)} style={st.city} accessibilityRole="button" accessibilityLabel={t('city.change')} testID="req-city">
              <Icon name="pin" size={18} color={C.primary} />
              <Txt v="sm" style={{ flex: 1, fontWeight: '700' }} numberOfLines={1}>{fmt.cityName(cityId)}</Txt>
              <Icon name="chevDown" size={16} color={C.muted} />
            </Pressable>
            <IconBtn icon="filter" label={t('map.filters')} onPress={() => setFOpen(true)} badge={activeFilterCount} testID="req-filters" />
          </Row>
        ) : null}
        {seg === 'all' ? (
          <Row gap={8} wrap>
            <Chip label={t('dir.all')} selected={filters.direction === 'all'} onPress={() => setFilters({ direction: 'all' })} />
            <Chip label={t('dir.everyday')} selected={filters.direction === 'everyday'} onPress={() => setFilters({ direction: 'everyday', disasterType: null })} />
            <Chip label={t('dir.disaster')} color={C.disaster} icon="siren" selected={filters.direction === 'disaster'} onPress={() => setFilters({ direction: 'disaster' })} />
          </Row>
        ) : null}
      </View>
      {needAuth ? <LoginPrompt /> : loading ? <Loading /> : error ? <ErrorView text={fmt.errText(error)} onRetry={reload} /> : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => `${seg}-${r.id}-${r.application_id ?? ''}`}
          contentContainerStyle={{ padding: S[4], gap: S[3], paddingBottom: S[8] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} />}
          ListEmptyComponent={empty}
          renderItem={({ item }) => (
            <View style={{ gap: 6 }}>
              {seg === 'offers' && item.application_status ? (
                <Badge label={t('dash.offer', { status: t(`appStatus.${item.application_status}`) })} fg={C.violet} bg={C.violet50} icon="hand" />
              ) : null}
              {seg === 'tasks' && item.is_active && item.status !== 'completed' ? (
                <View style={st.next}><Icon name="arrowRight" size={16} color={C.primaryDark} /><Txt v="xs" color={C.primaryDark}>{t('dash.nextStep')}: {t(`dash.next.${item.status}`)}</Txt></View>
              ) : null}
              <RequestCard r={item} showModeration={seg === 'mine'} onPress={() => router.push(`/request/${item.id}`)} />
              {seg === 'mine' && item.moderation_status === 'rejected' && item.rejection_reason ? (
                <View style={st.reason}><Txt v="xs" color={C.red}>{t('form.coordNote')}: {item.rejection_reason}</Txt></View>
              ) : null}
            </View>
          )}
        />
      )}
      <CityPicker visible={cityOpen} value={cityId} onClose={() => setCityOpen(false)} onPick={(id) => { setCityId(id); setCityOpen(false); }} />
      <FilterSheet visible={fOpen} onClose={() => setFOpen(false)} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  city: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S[3], borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  next: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reason: { backgroundColor: C.red50, padding: S[2], borderRadius: R.sm },
});
