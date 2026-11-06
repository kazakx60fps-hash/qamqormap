// Ерікті профилі: қала, аудан, көмек түрлері, қызмет радиусы, бос күндер мен уақыт, апаттағы көмекке қатысу.
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { C, S } from '../theme';
import { Screen } from '../components/Screen';
import { Alert, Btn, Check, Chip, ErrorView, Field, Loading, Row, Section, Txt } from '../components/ui';
import { Icon, categoryIcon } from '../components/Icon';
import { CityPicker } from '../components/CityPicker';
import { LoginPrompt } from '../components/LoginPrompt';
import { useToast } from '../components/overlays';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useMeta } from '../lib/meta';
import { useFmt } from '../lib/fmt';
import { useForm } from '../lib/useForm';
import { api } from '../lib/api';

const RADII = [1, 3, 5, 10, 20, 50];
const DAYS = [1, 2, 3, 4, 5, 6, 7]; // 1 — дүйсенбі … 7 — жексенбі

export default function Volunteer() {
  const { t, tArr } = useI18n();
  const fmt = useFmt();
  const meta = useMeta();
  const router = useRouter();
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [cityOpen, setCityOpen] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [exists, setExists] = useState(false);
  const f = useForm({
    is_active: true, city_id: user?.city_id ?? 1, district: '', bio: '', radius_km: 5, category_ids: [] as number[],
    available_days: [] as number[], time_from: '', time_to: '', disaster_support: false,
  });
  const load = () => {
    setState('loading');
    api<{ profile: any }>('/me/volunteer').then(({ profile: p }) => {
      if (p) {
        setExists(true);
        f.setValues({
          is_active: p.is_active, city_id: p.city_id, district: p.district ?? '', bio: p.bio ?? '', radius_km: Number(p.radius_km),
          category_ids: p.category_ids, available_days: p.available_days ?? [], time_from: p.time_from ?? '', time_to: p.time_to ?? '',
          disaster_support: !!p.disaster_support,
        });
      }
      setState('ready');
    }).catch((e) => { setLoadErr(e); setState('error'); });
  };
  useEffect(() => { if (user) load(); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Screen title={t('vol.title')}><LoginPrompt /></Screen>;
  if (state === 'loading') return <Screen title={t('vol.title')}><Loading /></Screen>;
  if (state === 'error') return <Screen title={t('vol.title')}><ErrorView text={fmt.errText(loadErr)} onRetry={load} /></Screen>;

  const v = f.values;
  const toggle = (k: 'category_ids' | 'available_days', id: number) => f.set(k, v[k].includes(id) ? v[k].filter((x) => x !== id) : [...v[k], id]);
  const save = () => f.submit(async () => {
    await api('/me/volunteer', { method: 'PUT', body: { ...v, time_from: v.time_from || null, time_to: v.time_to || null, district: v.district.trim() || null, bio: v.bio.trim() || null } });
    await refresh();
    toast(t('vol.saved'));
    router.back();
  });
  const days = tArr('date.daysShort');
  return (
    <Screen title={t('vol.title')} testID="volunteer-screen" footer={<Btn title={exists ? t('vol.save') : t('vol.become')} icon="heart" onPress={save} loading={f.busy} testID="vol-save" />}>
      <Txt v="sm" color={C.ink2}>{t('vol.lead')}</Txt>
      {f.formError && !Object.keys(f.errors).length ? <Alert kind="danger" text={fmt.errText(f.formError)} /> : null}
      <Check label={t('vol.recommendMe')} value={v.is_active} onChange={(x) => f.set('is_active', x)} hint={v.is_active ? t('vol.active') : t('vol.paused')} />
      <Section title={t('form.s3')}>
        <Pressable onPress={() => setCityOpen(true)} accessibilityRole="button" testID="vol-city"
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S[3], borderRadius: 12, borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.surface }}>
          <Icon name="pin" size={20} color={C.primary} /><Txt v="md" style={{ flex: 1 }}>{fmt.cityName(v.city_id)}</Txt><Icon name="chevDown" size={18} color={C.muted} />
        </Pressable>
        <Field label={t('form.district')} value={v.district} onChangeText={(x) => f.set('district', x)} optional placeholder={t('form.districtPh')} />
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('vol.radius')}</Txt>
        <Row wrap gap={8}>{RADII.map((r) => <Chip key={r} label={`${r} ${t('unit.km')}`} selected={v.radius_km === r} onPress={() => f.set('radius_km', r)} testID={`vol-radius-${r}`} />)}</Row>
      </Section>
      <Section title={t('vol.categories')}>
        <Row wrap gap={8}>
          {meta.categories.map((c) => <Chip key={c.id} label={t(`catShort.${c.code}`)} icon={categoryIcon(c.code)} color={c.direction === 'disaster' ? C.disaster : C.primary}
            selected={v.category_ids.includes(c.id)} onPress={() => toggle('category_ids', c.id)} testID={`vol-cat-${c.code}`} />)}
        </Row>
        {f.errors.category_ids ? <Txt v="sm" color={C.red}>{fmt.fieldText(f.errors.category_ids)}</Txt> : null}
      </Section>
      <Section title={t('vol.days')}>
        <Row wrap gap={8}>{DAYS.map((d) => <Chip key={d} label={days[d % 7]} selected={v.available_days.includes(d)} onPress={() => toggle('available_days', d)} />)}</Row>
        <Row gap={8}>
          <View style={{ flex: 1 }}><Field label={t('vol.timeFrom')} placeholder="18:00" value={v.time_from} onChangeText={(x) => f.set('time_from', x)} error={fmt.fieldText(f.errors.time_from)} testID="vol-from" /></View>
          <View style={{ flex: 1 }}><Field label={t('vol.timeTo')} placeholder="21:00" value={v.time_to} onChangeText={(x) => f.set('time_to', x)} error={fmt.fieldText(f.errors.time_to)} testID="vol-to" /></View>
        </Row>
        <Txt v="xs" color={C.muted}>{t('vol.timeHint')}</Txt>
      </Section>
      <Section title={t('dir.disaster')}>
        <Alert kind="disaster" title={t('disaster.safetyTitle')} text={t('vol.disasterSupportHint')} />
        <Check label={t('vol.disasterSupport')} value={v.disaster_support} onChange={(x) => f.set('disaster_support', x)} testID="vol-disaster" />
      </Section>
      <Field label={t('vol.bio')} hint={t('vol.bioHint')} value={v.bio} onChangeText={(x) => f.set('bio', x)} multiline optional />
      <CityPicker visible={cityOpen} value={v.city_id} allowAll={false} onClose={() => setCityOpen(false)} onPick={(id) => { if (id) f.set('city_id', id); setCityOpen(false); }} />
    </Screen>
  );
}
