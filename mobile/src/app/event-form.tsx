// Координатордың апат оқиғасы формасы (жасау ?report=ID / өңдеу ?id=ID).
// Бір оқиға бірнеше қаланы, тұтас облысты немесе елді мекеннен тыс нүктені қамти алады.
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C, R, S } from '../theme';
import { Screen } from '../components/Screen';
import { Alert, Btn, Check, Chip, Empty, ErrorView, Field, Loading, Row, Section, Segmented, Txt } from '../components/ui';
import { disasterIcon } from '../components/Icon';
import { CityPicker } from '../components/CityPicker';
import { useToast } from '../components/overlays';
import { QMap } from '../map/QMap';
import type { MapHandle } from '../map/types';
import { LANGS, useI18n, type Lang } from '../i18n';
import { useAuth } from '../lib/auth';
import { useMeta } from '../lib/meta';
import { useFmt } from '../lib/fmt';
import { useForm } from '../lib/useForm';
import { api } from '../lib/api';

export default function EventForm() {
  const { id, report } = useLocalSearchParams<{ id?: string; report?: string }>();
  const editId = id ? Number(id) : null;
  const reportId = report ? Number(report) : null;
  const { t, lang } = useI18n();
  const fmt = useFmt();
  const meta = useMeta();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const mapRef = useRef<MapHandle>(null);
  const [cityOpen, setCityOpen] = useState(false);
  const [usePoint, setUsePoint] = useState(false);
  const [startOffset, setStartOffset] = useState<number | 'keep'>(0);
  const [keepStart, setKeepStart] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>(editId || reportId ? 'loading' : 'idle');
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const f = useForm({
    type: '', title: '', description: '', content_lang: lang as Lang, city_ids: [] as number[], region_codes: [] as string[],
    lat: null as number | null, lng: null as number | null, radius_km: '', location_note: '', source_name: '', source_url: '',
    activity_status: 'active' as 'active' | 'resolved', verification_status: 'unverified' as 'verified' | 'unverified',
  });

  useEffect(() => {
    if (!user?.is_coordinator) return;
    if (editId) {
      api<{ event: any }>(`/events/${editId}`).then(({ event: e }) => {
        f.setValues((v) => ({
          ...v, type: e.type_code, title: e.title, description: e.description, content_lang: e.content_lang,
          city_ids: e.areas.filter((a: any) => a.city_id).map((a: any) => a.city_id), region_codes: e.areas.filter((a: any) => a.region_code).map((a: any) => a.region_code),
          lat: e.lat, lng: e.lng, radius_km: e.radius_km ? String(e.radius_km) : '', location_note: e.location_note ?? '',
          source_name: e.source_name ?? '', source_url: e.source_url ?? '', activity_status: e.activity_status, verification_status: e.verification_status,
        }));
        setUsePoint(e.lat != null);
        setKeepStart(e.started_at);
        setStartOffset('keep');
        setState('idle');
      }).catch((e) => { setLoadErr(e); setState('error'); });
    } else if (reportId) {
      api<{ items: any[] }>('/coordinator/disaster-reports').then(({ items }) => {
        const r = items.find((x) => x.id === reportId);
        if (r) f.setValues((v) => ({ ...v, type: r.type_code, description: r.description, city_ids: r.city_id ? [r.city_id] : [], source_name: r.source_name ?? '', source_url: r.source_url ?? '', content_lang: r.content_lang }));
        setState('idle');
      }).catch((e) => { setLoadErr(e); setState('error'); });
    }
  }, [editId, reportId, user?.is_coordinator]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user?.is_coordinator) return <Screen title={t('event.newTitle')}><Empty icon="lock" title={t('state.noAccess')} text={t('errors.COORDINATOR_ONLY')} /></Screen>;
  if (state === 'loading') return <Screen title={t('event.editTitle')}><Loading /></Screen>;
  if (state === 'error') return <Screen title={t('event.editTitle')}><ErrorView text={fmt.errText(loadErr)} /></Screen>;

  const v = f.values;
  const firstCity = v.city_ids[0] ? meta.citiesById.get(v.city_ids[0]) : null;
  const center: [number, number] = v.lat != null ? [v.lat, v.lng!] : firstCity ? [firstCity.lat, firstCity.lng] : [48.2, 67.5];

  const save = () => f.submit(async () => {
    const started = startOffset === 'keep' && keepStart ? keepStart : (() => { const d = new Date(); d.setDate(d.getDate() - (startOffset as number)); return d.toISOString(); })();
    const body = {
      ...v, started_at: started, radius_km: usePoint && v.radius_km ? Number(v.radius_km.replace(',', '.')) : null,
      lat: usePoint ? v.lat : null, lng: usePoint ? v.lng : null, source_url: v.source_url.trim() || null, report_id: reportId ?? undefined,
    };
    const r = editId ? await api<{ id: number }>(`/events/${editId}`, { method: 'PUT', body }) : await api<{ id: number }>('/events', { method: 'POST', body });
    toast(t('event.saved'));
    router.replace(`/event/${editId ?? r.id}`);
  });
  const err = (k: string) => fmt.fieldText(f.errors[k]);

  return (
    <Screen title={editId ? t('event.editTitle') : t('event.newTitle')} testID="event-form"
      footer={<Btn title={editId ? t('common.save') : t('event.create')} kind="disaster" icon="check" onPress={save} loading={f.busy} testID="ev-save" />}>
      <Txt v="sm" color={C.ink2}>{t('event.formLead')}</Txt>
      {reportId ? <Alert kind="info" title={t('event.fromReport', { id: reportId })} text={t('event.fromReportHint')} /> : null}
      <View style={{ gap: 6, padding: S[3], borderRadius: R.md, backgroundColor: C.surface2 }}>
        <Txt v="sm" style={{ fontWeight: '800' }}>{t('event.rulesTitle')}</Txt>
        {[1, 2, 3, 4].map((i) => <Txt key={i} v="xs" color={C.ink2}>• {t(`event.rule${i}`)}</Txt>)}
      </View>
      {f.formError && !Object.keys(f.errors).length ? <Alert kind="danger" text={fmt.errText(f.formError)} /> : null}

      <Section title={t('event.s1')}>
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('event.f.type_id')}</Txt>
        <Row wrap gap={8}>
          {meta.disasterTypes.map((d) => <Chip key={d.code} label={t(`dtype.${d.code}`)} icon={disasterIcon(d.code)} color={C.disaster} selected={v.type === d.code} onPress={() => f.set('type', d.code)} testID={`ev-type-${d.code}`} />)}
        </Row>
        {err('type') ? <Txt v="sm" color={C.red}>{err('type')}</Txt> : null}
        <Field label={t('event.f.title')} hint={t('event.titleHint')} value={v.title} onChangeText={(x) => f.set('title', x)} error={err('title')} testID="ev-title" />
        <Field label={t('event.f.description')} hint={t('event.descHint')} value={v.description} onChangeText={(x) => f.set('description', x)} multiline error={err('description')} testID="ev-desc" />
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('event.f.content_lang')}</Txt>
        <Segmented<Lang> value={v.content_lang} onChange={(x) => f.set('content_lang', x)} options={LANGS.map((l) => ({ value: l.code, label: l.native }))} />
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('event.f.started_at')}</Txt>
        <Row wrap gap={8}>
          {keepStart ? <Chip label={fmt.dateTime(keepStart)} selected={startOffset === 'keep'} onPress={() => setStartOffset('keep')} /> : null}
          {[0, 1, 2, 3, 7].map((n) => <Chip key={n} label={n === 0 ? t('m.form.today') : t('m.event.daysAgo', { count: n })} selected={startOffset === n} onPress={() => setStartOffset(n)} />)}
        </Row>
      </Section>

      <Section title={t('event.s2')}>
        <Txt v="xs" color={C.muted}>{t('event.s2hint')}</Txt>
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('event.f.cities')}</Txt>
        <Row wrap gap={8}>
          {v.city_ids.length === 0 ? <Txt v="xs" color={C.muted}>{t('event.noCities')}</Txt> : null}
          {v.city_ids.map((cid) => <Chip key={cid} label={`${fmt.cityName(cid)} ✕`} selected onPress={() => f.set('city_ids', v.city_ids.filter((x) => x !== cid))} />)}
          <Chip label={t('common.add')} icon="plus" onPress={() => setCityOpen(true)} testID="ev-add-city" />
        </Row>
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('event.f.regions')}</Txt>
        <Row wrap gap={8}>
          {meta.regions.map((r) => <Chip key={r.code} label={fmt.regionName(r.code)} selected={v.region_codes.includes(r.code)} testID={`ev-region-${r.code}`}
            onPress={() => f.set('region_codes', v.region_codes.includes(r.code) ? v.region_codes.filter((x) => x !== r.code) : [...v.region_codes, r.code])} />)}
        </Row>
        <Check label={t('event.f.point')} hint={t('event.pointHint')} value={usePoint} onChange={(x) => { setUsePoint(x); if (x && v.lat == null) { f.set('lat', center[0]); f.set('lng', center[1]); } }} testID="ev-use-point" />
        {usePoint ? (
          <>
            <QMap ref={mapRef} style={{ height: 220, borderRadius: R.md, overflow: 'hidden' }} initialView={{ center, zoom: 8 }} tiles={meta.mapConfig} demoLabel={t('demo.eventBadge')}
              pick={{ enabled: true, lat: v.lat, lng: v.lng }} onPick={(lat, lng) => { f.set('lat', lat); f.set('lng', lng); }} testID="ev-map" />
            <Field label={t('event.f.radius_km')} hint={t('event.radiusHint')} value={v.radius_km} onChangeText={(x) => f.set('radius_km', x)} keyboardType="decimal-pad" optional error={err('radius_km')} />
          </>
        ) : null}
        {err('areas') || err('lat') ? <Txt v="sm" color={C.red} testID="ev-area-error">{err('areas') || err('lat')}</Txt> : null}
        <Field label={t('event.f.location_note')} hint={t('event.locationNoteHint')} value={v.location_note} onChangeText={(x) => f.set('location_note', x)} optional />
      </Section>

      <Section title={t('event.s3')}>
        <Txt v="xs" color={C.muted}>{t('event.s3hint')}</Txt>
        <Field label={t('event.f.source_name')} value={v.source_name} onChangeText={(x) => f.set('source_name', x)} optional />
        <Field label={t('event.f.source_url')} value={v.source_url} onChangeText={(x) => f.set('source_url', x)} autoCapitalize="none" keyboardType="url" optional error={err('source_url')} />
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('disaster.verification')}</Txt>
        <Segmented value={v.verification_status} onChange={(x) => f.set('verification_status', x)} testID="ev-verify"
          options={[{ value: 'unverified', label: t('verify.unverified') }, { value: 'verified', label: t('verify.verified') }]} />
        <Txt v="xs" color={C.muted}>{t('event.rule1')}</Txt>
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('disaster.activity')}</Txt>
        <Segmented value={v.activity_status} onChange={(x) => f.set('activity_status', x)}
          options={[{ value: 'active', label: t('activity.active') }, { value: 'resolved', label: t('activity.resolved') }]} />
      </Section>
      <CityPicker visible={cityOpen} value={null} allowAll={false} onClose={() => setCityOpen(false)}
        onPick={(cid) => { if (cid && !v.city_ids.includes(cid)) f.set('city_ids', [...v.city_ids, cid]); setCityOpen(false); }} />
    </Screen>
  );
}
