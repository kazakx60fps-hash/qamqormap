// Ықтимал табиғи апат туралы хабар: жария етілмейді, координатор қарайды.
import { useState } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C, S } from '../theme';
import { Screen } from '../components/Screen';
import { Alert, Btn, Chip, Field, Row, Txt } from '../components/ui';
import { Icon, disasterIcon } from '../components/Icon';
import { CityPicker } from '../components/CityPicker';
import { LoginPrompt } from '../components/LoginPrompt';
import { useToast } from '../components/overlays';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useMeta } from '../lib/meta';
import { useFilters } from '../lib/filters';
import { useFmt } from '../lib/fmt';
import { useForm } from '../lib/useForm';
import { api } from '../lib/api';

function nearestCity(cities: { id: number; lat: number; lng: number }[], lat: number, lng: number) {
  let best: number | null = null, bd = Infinity;
  for (const c of cities) {
    const d = (c.lat - lat) ** 2 + ((c.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bd) { bd = d; best = c.id; }
  }
  return best;
}

export default function Report() {
  const { t, lang } = useI18n();
  const fmt = useFmt();
  const meta = useMeta();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { cityId } = useFilters();
  const [cityOpen, setCityOpen] = useState(false);
  // Оқиғалар картасынан келсе: таңдалған нүкте (және түрі) параметрмен беріледі
  const params = useLocalSearchParams<{ lat?: string; lng?: string; type?: string }>();
  const lat = params.lat ? Number(params.lat) : null;
  const lng = params.lng ? Number(params.lng) : null;
  const point = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const nearest = point ? nearestCity(meta.cities, point.lat, point.lng) : null;
  const f = useForm({ type: params.type && meta.disasterTypes.some((d) => d.code === params.type) ? params.type : '', city_id: nearest ?? cityId ?? user?.city_id ?? 1, description: '', source_name: '', source_url: '' });
  if (!user) return <Screen title={t(point ? 'incidents.formTitle' : 'disaster.reportTitle')}><LoginPrompt /></Screen>;
  const send = () => f.submit(async () => {
    await api('/disaster-reports', { method: 'POST', body: { ...f.values, ...(point ?? {}), source_url: f.values.source_url.trim() || null, content_lang: lang } });
    toast(t(point ? 'incidents.sent' : 'disaster.reportSent'));
    router.back();
  });
  return (
    <Screen title={t(point ? 'incidents.formTitle' : 'disaster.reportTitle')} testID="report-screen" footer={<Btn title={t('disaster.reportSend')} icon="send" kind="disaster" onPress={send} loading={f.busy} testID="report-send" />}>
      <Alert kind="info" text={t(point ? 'incidents.formIntro' : 'disaster.reportIntro')} />
      {point ? (
        <Row gap={8} wrap>
          <Icon name="pin" size={20} color={C.primary} />
          <Txt v="sm" style={{ flex: 1 }} testID="rep-point"><Txt v="sm" style={{ fontWeight: '800' }}>{t('incidents.picked')}: </Txt>{point.lat.toFixed(4)}, {point.lng.toFixed(4)}</Txt>
          <Btn title={t('incidents.changePoint')} kind="ghost" small icon="target" onPress={() => router.back()} testID="rep-repick" />
        </Row>
      ) : null}
      <Alert kind="disaster" title={t('disaster.emergencyTitle')} text={t('m.disaster.emergencyShort')} />
      {f.formError && !Object.keys(f.errors).length ? <Alert kind="danger" text={fmt.errText(f.formError)} /> : null}
      <Txt v="sm" style={{ fontWeight: '700' }}>{t('disaster.type')}</Txt>
      <Row wrap gap={8}>
        {meta.disasterTypes.map((d) => <Chip key={d.code} label={t(`dtype.${d.code}`)} icon={disasterIcon(d.code)} color={C.disaster} selected={f.values.type === d.code} onPress={() => f.set('type', d.code)} testID={`rep-type-${d.code}`} />)}
      </Row>
      {f.errors.type ? <Txt v="sm" color={C.red}>{fmt.fieldText(f.errors.type)}</Txt> : null}
      <Txt v="sm" style={{ fontWeight: '700' }}>{t('disaster.nearestCity')}</Txt>
      <Pressable onPress={() => setCityOpen(true)} accessibilityRole="button" testID="rep-city"
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S[3], borderRadius: 12, borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.surface }}>
        <Icon name="pin" size={20} color={C.primary} /><Txt v="md" style={{ flex: 1 }}>{fmt.cityName(f.values.city_id)}</Txt><Icon name="chevDown" size={18} color={C.muted} />
      </Pressable>
      <Field label={t('disaster.reportDesc')} hint={t('disaster.reportDescHint')} value={f.values.description} onChangeText={(v) => f.set('description', v)} multiline error={fmt.fieldText(f.errors.description)} testID="rep-desc" />
      <Field label={t('event.f.source_name')} hint={t('disaster.sourceHint')} value={f.values.source_name} onChangeText={(v) => f.set('source_name', v)} optional />
      <Field label={t('event.f.source_url')} value={f.values.source_url} onChangeText={(v) => f.set('source_url', v)} autoCapitalize="none" keyboardType="url" optional error={fmt.fieldText(f.errors.source_url)} />
      <CityPicker visible={cityOpen} value={f.values.city_id} allowAll={false} onClose={() => setCityOpen(false)} onPick={(id) => { if (id) f.set('city_id', id); setCityOpen(false); }} />
    </Screen>
  );
}
