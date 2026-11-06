// «Табиғи апаттар» бөлімі: ескерту (112), түсіндірме, сүзгілер, оқиғалар тізімі, ықтимал оқиға туралы хабар.
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { C, S } from '../theme';
import { Screen } from '../components/Screen';
import { Alert, Btn, Card, Chip, Empty, ErrorView, Loading, Row, Section, Segmented, Txt } from '../components/ui';
import { EventCard } from '../components/cards';
import { CityPicker } from '../components/CityPicker';
import { disasterIcon } from '../components/Icon';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useMeta } from '../lib/meta';
import { useFilters } from '../lib/filters';
import { useFmt } from '../lib/fmt';
import { useLoad } from '../lib/useLoad';
import { api } from '../lib/api';
import type { DisasterEvent } from '../lib/types';

export default function Disasters() {
  const { t } = useI18n();
  const fmt = useFmt();
  const meta = useMeta();
  const router = useRouter();
  const { user } = useAuth();
  const { cityId, setCityId } = useFilters();
  const [type, setType] = useState<string | null>(null);
  const [activity, setActivity] = useState<'active' | 'resolved' | 'any'>('active');
  const [verification, setVerification] = useState<'any' | 'verified' | 'unverified'>('any');
  const [cityOpen, setCityOpen] = useState(false);
  const { data, error, loading, reload, refreshing, refresh } = useLoad(() => api<{ items: DisasterEvent[] }>('/events', {
    query: { city_id: cityId ?? undefined, type: type ?? undefined, activity: activity === 'any' ? undefined : activity, verification: verification === 'any' ? undefined : verification },
  }), [cityId, type, activity, verification]);

  return (
    <Screen title={t('disaster.pageTitle')} testID="disasters-screen" refreshing={refreshing} onRefresh={refresh}>
      <Alert kind="disaster" title={t('disaster.emergencyTitle')} text={t('disaster.emergencyText')} testID="emergency-full" />
      <Txt v="sm" color={C.ink2}>{t('disaster.pageLead')}</Txt>
      <Btn title={t('nav.incidents')} icon="map" kind="secondary" onPress={() => router.push('/incidents')} testID="dis-incidents" />
      <Row gap={8} wrap>
        {[['explainEvent', 'siren'], ['explainRequest', 'heart'], ['explainVerify', 'shield']].map(([k, ic]) => (
          <Card key={k} style={{ flexBasis: '100%' }}>
            <Txt v="sm" style={{ fontWeight: '800' }}>{t(`disaster.${k}Title`)}</Txt>
            <Txt v="xs" color={C.ink2}>{t(`disaster.${k}`)}</Txt>
          </Card>
        ))}
      </Row>
      <Section title={t('map.filters')}>
        <Btn title={`${t('form.city')}: ${fmt.cityName(cityId)}`} kind="secondary" icon="pin" small onPress={() => setCityOpen(true)} testID="dis-city" />
        <Row wrap gap={8}>
          <Chip label={t('disaster.anyType')} selected={!type} onPress={() => setType(null)} color={C.disaster} />
          {meta.disasterTypes.map((d) => <Chip key={d.code} label={t(`dtype.${d.code}`)} icon={disasterIcon(d.code)} color={C.disaster} selected={type === d.code} onPress={() => setType(type === d.code ? null : d.code)} testID={`dis-type-${d.code}`} />)}
        </Row>
        <Segmented value={activity} onChange={setActivity} testID="dis-activity"
          options={[{ value: 'active', label: t('disaster.activityOpt.active') }, { value: 'resolved', label: t('disaster.activityOpt.resolved') }, { value: 'any', label: t('disaster.activityOpt.any') }]} />
        <Segmented value={verification} onChange={setVerification} testID="dis-verify"
          options={[{ value: 'any', label: t('m.filters.any') }, { value: 'verified', label: t('verify.verified') }, { value: 'unverified', label: t('verify.unverified') }]} />
      </Section>
      <Section title={t('disaster.listTitle', { city: fmt.cityName(cityId), count: data?.items.length ?? 0 })}>
        {loading ? <Loading /> : error ? <ErrorView text={fmt.errText(error)} onRetry={reload} /> : data!.items.length === 0 ? (
          <Empty icon="siren" title={t('disaster.noEventsFilter')} text={t('disaster.noEventsFilterHint')} />
        ) : data!.items.map((e) => <EventCard key={e.id} e={e} onPress={() => router.push(`/event/${e.id}`)} />)}
      </Section>
      <Card style={{ borderColor: C.disaster100 }}>
        <Txt v="sm" style={{ fontWeight: '800' }}>{t('disaster.reportTitle')}</Txt>
        <Txt v="xs" color={C.ink2}>{t('disaster.reportIntro')}</Txt>
        <Btn title={t('disaster.reportBtn')} kind="secondary" icon="flag" onPress={() => router.push(user ? '/report' : '/login?next=/report')} testID="dis-report" />
        {user?.is_coordinator ? <Btn title={t('coord.newEvent')} icon="plus" kind="disaster" onPress={() => router.push('/event-form')} testID="dis-new-event" /> : null}
      </Card>
      <View style={{ height: S[2] }} />
      <CityPicker visible={cityOpen} value={cityId} onClose={() => setCityOpen(false)} onPick={(id) => { setCityId(id); setCityOpen(false); }} />
    </Screen>
  );
}
