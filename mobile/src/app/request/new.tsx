// Жаңа өтініш және өңдеу (?edit=ID). Қала таңдалған қаладан қойылады, оны өзгертуге болады.
// ?event=ID — табиғи апат оқиғасына байланысты өтініш («Маған көмек керек»).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { C, R, S } from '../../theme';
import { Screen } from '../../components/Screen';
import { Alert, Btn, Check, Chip, ErrorView, Field, H3, Loading, Row, Section, Segmented, Txt } from '../../components/ui';
import { Icon, categoryIcon, disasterIcon } from '../../components/Icon';
import { CityPicker } from '../../components/CityPicker';
import { SelectField, useToast } from '../../components/overlays';
import { LoginPrompt } from '../../components/LoginPrompt';
import { LangSwitch } from '../../components/LangSwitch';
import { QMap } from '../../map/QMap';
import type { MapHandle } from '../../map/types';
import { useI18n, LANGS, type Lang } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { useMeta } from '../../lib/meta';
import { useFilters } from '../../lib/filters';
import { useFmt } from '../../lib/fmt';
import { useForm } from '../../lib/useForm';
import { api, uploadPhoto } from '../../lib/api';
import type { DisasterEvent } from '../../lib/types';

const UNITS = ['bottle', 'liter', 'kg', 'pack', 'set', 'item', 'person', 'bed', 'trip'];

type Day = 'none' | 'current' | `d${number}`;
type Slot = 'morning' | 'day' | 'evening' | 'any';
const SLOTS: Record<Slot, [number, number]> = { morning: [9, 12], day: [12, 17], evening: [17, 21], any: [9, 21] };

function buildTime(day: Day, slot: Slot, current: { from: string | null; to: string | null }) {
  if (day === 'none') return { needed_from: null, needed_to: null };
  if (day === 'current') return { needed_from: current.from, needed_to: current.to };
  const offset = Number(day.slice(1));
  const [h1, h2] = SLOTS[slot];
  const base = new Date();
  base.setDate(base.getDate() + offset);
  const from = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h1, 0, 0);
  const to = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h2, 0, 0);
  return { needed_from: from.toISOString(), needed_to: to.toISOString() };
}

export default function RequestForm() {
  const params = useLocalSearchParams<{ edit?: string; event?: string }>();
  const editId = params.edit ? Number(params.edit) : null;
  const presetEvent = params.event ? Number(params.event) : null;
  const { t, tArr, lang } = useI18n();
  const fmt = useFmt();
  const meta = useMeta();
  const router = useRouter();
  const toast = useToast();
  const { user, refreshSummary } = useAuth();
  const { cityId } = useFilters();
  const mapRef = useRef<MapHandle>(null);
  const startCity = cityId ?? user?.city_id ?? 1;
  const c0 = meta.citiesById.get(startCity);

  const f = useForm({
    city_id: startCity, category_id: null as number | null, title: '', description: '', urgency: 'normal' as 'low' | 'normal' | 'high',
    district: '', public_place: '', lat: c0?.lat ?? 51.13, lng: c0?.lng ?? 71.43, address: '', contact_phone: user?.phone ?? '',
    needed_note: '', disaster_event_id: presetEvent as number | null, content_lang: lang as Lang,
    quantity: '', quantity_unit: null as string | null,
  });
  const [day, setDay] = useState<Day>('d0');
  const [slot, setSlot] = useState<Slot>('any');
  const [current, setCurrent] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [pointTouched, setPointTouched] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [events, setEvents] = useState<DisasterEvent[]>([]);
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string; webFile?: Blob } | null>(null);
  const [photoPublic, setPhotoPublic] = useState(false);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>(editId ? 'loading' : 'idle');
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [orig, setOrig] = useState<{ moderation_status: string; rejection_reason?: string } | null>(null);

  // Өңдеу: бар өтінішті жүктеу (жеке деректер тек авторға келеді)
  useEffect(() => {
    if (!editId || !user) return;
    api<any>(`/requests/${editId}`).then((d) => {
      const r = d.request;
      f.setValues((v) => ({
        ...v, city_id: r.city_id, category_id: r.category_id, title: r.title, description: r.description, urgency: r.urgency,
        district: r.district ?? '', public_place: r.public_place ?? '', needed_note: r.needed_note ?? '', disaster_event_id: r.disaster_event_id,
        content_lang: r.content_lang, address: d.private?.address ?? '', contact_phone: d.private?.contact_phone ?? '',
        lat: d.private?.exact_lat ?? r.approx_lat, lng: d.private?.exact_lng ?? r.approx_lng,
        quantity: r.quantity != null ? String(r.quantity) : '', quantity_unit: r.quantity_unit ?? null,
      }));
      setCurrent({ from: r.needed_from, to: r.needed_to });
      setDay(r.needed_from ? 'current' : 'none');
      setPointTouched(true);
      setOrig({ moderation_status: r.moderation_status, rejection_reason: r.rejection_reason });
      setLoadState('idle');
      mapRef.current?.setView([d.private?.exact_lat ?? r.approx_lat, d.private?.exact_lng ?? r.approx_lng], 14);
    }).catch((e) => { setLoadErr(e); setLoadState('error'); });
  }, [editId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Қаладағы белсенді апат оқиғалары
  useEffect(() => {
    api<{ items: DisasterEvent[] }>('/events', { query: { activity: 'active', city_id: f.values.city_id } })
      .then(async (r) => {
        let items = r.items;
        if (f.values.disaster_event_id && !items.some((e) => e.id === f.values.disaster_event_id)) {
          const one = await api<{ event: DisasterEvent }>(`/events/${f.values.disaster_event_id}`).then((x) => x.event).catch(() => null);
          if (one) items = [one, ...items];
        }
        setEvents(items);
      }).catch(() => setEvents([]));
  }, [f.values.city_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Оқиға таңдалса — тек «Табиғи апаттар» санаттары
  const ev = events.find((e) => e.id === f.values.disaster_event_id);
  useEffect(() => {
    if (f.values.disaster_event_id && f.values.category_id && meta.categoriesById.get(f.values.category_id)?.direction !== 'disaster') f.set('category_id', null);
  }, [f.values.disaster_event_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeCity = (id: number | null) => {
    setCityOpen(false);
    if (!id) return;
    const c = meta.citiesById.get(id);
    f.set('city_id', id);
    if (c && !editId) { f.set('lat', c.lat); f.set('lng', c.lng); setPointTouched(false); mapRef.current?.setView([c.lat, c.lng], c.zoom || 12); }
    else if (c) mapRef.current?.setView([c.lat, c.lng], c.zoom || 12);
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const type = a.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(a.mimeType) ? a.mimeType : 'image/jpeg';
    setPhoto({ uri: a.uri, name: a.fileName ?? `photo.${type.split('/')[1]}`, type, webFile: (a as { file?: Blob }).file });
  };

  const days = useMemo(() => {
    const short = tArr('date.daysShort');
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() + i);
      const label = i === 0 ? t('m.form.today') : i === 1 ? t('m.form.tomorrow') : `${short[d.getDay()]}, ${d.getDate()}`;
      return { value: `d${i}` as Day, label };
    });
  }, [t, tArr]);

  const save = (submit: boolean) => f.submit(async () => {
    const v = f.values;
    const body = { ...v, ...buildTime(day, slot, current), submit, district: v.district.trim(), public_place: v.public_place.trim(),
      quantity: v.quantity.trim() ? Number(v.quantity.replace(',', '.')) : null, quantity_unit: v.quantity.trim() ? v.quantity_unit : null };
    let id = editId;
    if (editId) {
      await api(`/requests/${editId}`, { method: 'PUT', body });
    } else {
      const r = await api<{ id: number }>('/requests', { method: 'POST', body });
      id = r.id;
    }
    if (photo && id) {
      try { await uploadPhoto(id, photo, photoPublic ? 'public' : 'participants'); }
      catch (e) { toast(`${t('form.photoFailed')} ${fmt.errText(e)}`, 'error'); }
    }
    refreshSummary();
    toast(submit ? t('form.sentToReview') : t('form.saved'));
    router.replace(`/request/${id}`);
  });

  if (!user) return <Screen title={t('form.newTitle')}><LoginPrompt text={t('m.form.loginText')} /></Screen>;
  if (loadState === 'loading') return <Screen title={t('form.editTitle')}><Loading /></Screen>;
  if (loadState === 'error') return <Screen title={t('form.editTitle')}><ErrorView text={fmt.errText(loadErr)} onRetry={() => router.replace(`/request/new?edit=${editId}`)} /></Screen>;

  const err = (k: string) => fmt.fieldText(f.errors[k]);
  const everyday = meta.categories.filter((c) => c.direction === 'everyday');
  const disaster = meta.categories.filter((c) => c.direction === 'disaster');
  const isDisasterCat = f.values.category_id ? meta.categoriesById.get(f.values.category_id)?.direction === 'disaster' : !!f.values.disaster_event_id;
  const resubmit = orig?.moderation_status === 'rejected' || orig?.moderation_status === 'draft';
  const hasErrors = Object.keys(f.errors).length > 0;

  return (
    <Screen title={editId ? t('form.editTitle') : t('form.newTitle')} testID="request-form" right={<LangSwitch compact testID="lang-form" />}
      footer={<View style={{ gap: 8 }}>
        <Btn title={editId ? (resubmit ? t('form.resubmit') : t('form.saveChanges')) : t('form.submit')} icon="send" loading={f.busy}
          onPress={() => save(!editId || resubmit)} testID="form-submit" />
        {!editId ? <Btn title={t('form.saveDraft')} kind="ghost" small onPress={() => save(false)} testID="form-draft" /> : null}
      </View>}>
      <Txt v="sm" color={C.ink2}>{editId ? t('form.editLead') : t('form.newLead')}</Txt>
      {orig?.rejection_reason && orig.moderation_status === 'rejected' ? <Alert kind="danger" title={t('form.coordNote')} text={orig.rejection_reason} /> : null}
      {f.formError && hasErrors ? <Alert kind="danger" text={t('errors.VALIDATION')} testID="form-errors" /> : null}
      {f.formError && !hasErrors ? <Alert kind="danger" text={fmt.errText(f.formError)} testID="form-error" /> : null}
      <Alert kind="warn" text={t('form.emergencyHint')} />

      <Section title={t('form.s1')}>
        <Txt v="xs" color={C.muted}>{t('form.s1hint')}</Txt>
        <SelectField<number | null> label={t('form.event')} value={f.values.disaster_event_id} onChange={(x) => f.set('disaster_event_id', x)} optional testID="f-event"
          options={[{ value: null, label: t('form.noEvent') }, ...events.map((e) => ({ value: e.id as number | null, label: e.title, hint: `${t(`dtype.${e.type_code}`)}${e.is_demo ? ' · ' + t('demo.eventBadge') : ''}`, icon: disasterIcon(e.type_code), color: C.disaster }))]} />
        <Txt v="xs" color={C.muted}>{t('form.eventHint')}</Txt>
        {ev ? <Alert kind="disaster" title={t(`dtype.${ev.type_code}`)} text={t('form.disasterSafety')} testID="form-disaster-note" /> : null}
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('form.category')}</Txt>
        {!f.values.disaster_event_id ? (
          <>
            <Txt v="xs" color={C.primaryDark}>{t('dir.everyday')}</Txt>
            <Row wrap gap={8}>
              {everyday.map((c) => <Chip key={c.id} label={t(`catShort.${c.code}`)} icon={categoryIcon(c.code)} selected={f.values.category_id === c.id} onPress={() => f.set('category_id', c.id)} testID={`cat-${c.code}`} />)}
            </Row>
          </>
        ) : null}
        <Txt v="xs" color={C.disasterDark}>{t('dir.disaster')}</Txt>
        <Row wrap gap={8}>
          {disaster.map((c) => <Chip key={c.id} label={t(`catShort.${c.code}`)} icon={categoryIcon(c.code)} color={C.disaster} selected={f.values.category_id === c.id} onPress={() => f.set('category_id', c.id)} testID={`cat-${c.code}`} />)}
        </Row>
        {err('category_id') ? <Txt v="sm" color={C.red}>{err('category_id')}</Txt> : null}
        {f.values.category_id ? <Txt v="xs" color={C.muted}>{t(`cat.${meta.categoriesById.get(f.values.category_id)?.code}`)}</Txt> : null}
        {isDisasterCat && !ev ? <Alert kind="disaster" text={t('form.disasterSafety')} /> : null}
        <Field label={t('form.title')} hint={t('form.titleHint')} placeholder={t('form.titlePh')} value={f.values.title} onChangeText={(x) => f.set('title', x)} error={err('title')} maxLength={120} testID="f-title" />
        <Field label={t('form.description')} hint={t('form.descriptionHint')} placeholder={t('form.descriptionPh')} value={f.values.description} onChangeText={(x) => f.set('description', x)} multiline error={err('description')} maxLength={2000} testID="f-description" />
        <Row gap={8} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Field label={t('form.quantity')} value={f.values.quantity} onChangeText={(x) => f.set('quantity', x.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad"
              optional error={err('quantity')} testID="f-quantity" />
          </View>
          <View style={{ flex: 1.2 }}>
            <SelectField<string | null> label={t('form.unit')} value={f.values.quantity_unit} onChange={(x) => f.set('quantity_unit', x)} error={err('quantity_unit')} testID="f-unit"
              placeholder={t('form.noUnit')} options={UNITS.map((u) => ({ value: u as string | null, label: t(`unitName.${u}`) }))} />
          </View>
        </Row>
        <Txt v="xs" color={C.muted}>{t('form.quantityHint')}</Txt>
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('m.form.textLang')}</Txt>
        <Segmented<Lang> value={f.values.content_lang} onChange={(x) => f.set('content_lang', x)} options={LANGS.map((l) => ({ value: l.code, label: l.native }))} testID="f-lang" />
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('form.urgency')}</Txt>
        <Segmented value={f.values.urgency} onChange={(x) => f.set('urgency', x)} testID="f-urgency"
          options={[{ value: 'high', label: t('urgency.high') }, { value: 'normal', label: t('urgency.normal') }, { value: 'low', label: t('urgency.low') }]} />
      </Section>

      <Section title={t('form.s2')}>
        <Txt v="xs" color={C.muted}>{t('form.s2hint')}</Txt>
        <Row wrap gap={8}>
          {current.from ? <Chip label={t('m.form.keepTime')} selected={day === 'current'} onPress={() => setDay('current')} /> : null}
          {days.map((d) => <Chip key={d.value} label={d.label} selected={day === d.value} onPress={() => setDay(d.value)} testID={`day-${d.value}`} />)}
          <Chip label={t('time.agree')} selected={day === 'none'} onPress={() => setDay('none')} testID="day-none" />
        </Row>
        {day.startsWith('d') ? (
          <Row wrap gap={8}>
            {(Object.keys(SLOTS) as Slot[]).map((s) => <Chip key={s} label={t(`m.form.slot.${s}`)} selected={slot === s} onPress={() => setSlot(s)} testID={`slot-${s}`} />)}
          </Row>
        ) : day === 'current' ? <Txt v="sm" color={C.ink2}>{fmt.neededText(current.from, current.to)}</Txt> : null}
        {err('needed_from') || err('needed_to') ? <Txt v="sm" color={C.red}>{err('needed_from') || err('needed_to')}</Txt> : null}
        <Field label={t('form.timeNote')} hint={t('form.timeNoteHint')} value={f.values.needed_note} onChangeText={(x) => f.set('needed_note', x)} optional maxLength={200} />
      </Section>

      <Section title={t('form.s3')}>
        <Txt v="xs" color={C.muted}>{t('form.s3hint')}</Txt>
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('form.city')}</Txt>
        <Pressable onPress={() => setCityOpen(true)} style={st.city} accessibilityRole="button" accessibilityLabel={`${t('form.city')}: ${fmt.cityName(f.values.city_id)}`} testID="f-city">
          <Icon name="pin" size={20} color={C.primary} />
          <View style={{ flex: 1 }}><Txt v="md" style={{ fontWeight: '700' }}>{fmt.cityName(f.values.city_id)}</Txt><Txt v="xs" color={C.muted}>{fmt.cityRegion(f.values.city_id)}</Txt></View>
          <Txt v="xs" color={C.primaryDark}>{t('city.change')}</Txt>
        </Pressable>
        {err('city_id') ? <Txt v="sm" color={C.red}>{err('city_id')}</Txt> : null}
        <Field label={t('form.district')} placeholder={t('form.districtPh')} value={f.values.district} onChangeText={(x) => f.set('district', x)} optional hint={t('form.public')} error={err('district')} />
        <Field label={t('form.publicPlace')} placeholder={t('form.publicPlacePh')} hint={t('form.publicPlaceHint')} value={f.values.public_place} onChangeText={(x) => f.set('public_place', x)} optional error={err('public_place')} />
        <Txt v="sm" style={{ fontWeight: '700' }}>{t('form.mapPoint')}</Txt>
        <QMap ref={mapRef} style={st.map} initialView={{ center: [f.values.lat, f.values.lng], zoom: c0?.zoom || 12 }} tiles={meta.mapConfig} demoLabel={t('demo.eventBadge')}
          pick={{ enabled: true, lat: f.values.lat, lng: f.values.lng }} onPick={(lat, lng) => { f.set('lat', lat); f.set('lng', lng); setPointTouched(true); }}
          accessibilityLabel={t('form.mapPoint')} testID="f-map" />
        <Row gap={6}>
          <Icon name={pointTouched ? 'checkCircle' : 'info'} size={16} color={pointTouched ? C.green : C.amber} />
          <Txt v="xs" color={pointTouched ? C.green : C.amber} style={{ flex: 1 }} testID="f-point-state">{pointTouched ? t('map.pointSelected') : t('m.form.pointHint')}</Txt>
        </Row>
        {err('lat') ? <Txt v="sm" color={C.red} testID="f-point-error">{err('lat')}</Txt> : null}
      </Section>

      <Section title={t('form.s4')}>
        <Row gap={8}><Icon name="lock" size={18} color={C.green} /><Txt v="xs" color={C.ink2} style={{ flex: 1 }}>{t('form.s4hint')}</Txt></Row>
        <Field label={t('form.address')} placeholder={t('form.addressPh')} value={f.values.address} onChangeText={(x) => f.set('address', x)} error={err('address')} testID="f-address" />
        <Field label={t('form.phone')} placeholder="+7 7XX XXX XX XX" value={f.values.contact_phone} onChangeText={(x) => f.set('contact_phone', x)} keyboardType="phone-pad" error={err('contact_phone')} testID="f-phone" />
      </Section>

      <Section title={t('form.s5')}>
        <Txt v="xs" color={C.muted}>{t('form.s5hint')}</Txt>
        {photo ? (
          <Row gap={12}>
            <Image source={{ uri: photo.uri }} style={st.thumb} accessibilityLabel={t('request.photoAlt')} />
            <View style={{ flex: 1, gap: 8 }}>
              <Check label={t('form.photoPublic')} value={photoPublic} onChange={setPhotoPublic} />
              <Btn title={t('form.deletePhoto')} kind="ghost" small onPress={() => setPhoto(null)} />
            </View>
          </Row>
        ) : <Btn title={t('form.choosePhoto')} kind="secondary" icon="image" onPress={pickPhoto} testID="f-photo" />}
      </Section>

      <View style={st.privacy}>
        <H3>{t('form.privacyTitle')}</H3>
        <Txt v="xs" color={C.ink2}>• {t('form.privacy1')}</Txt>
        <Txt v="xs" color={C.ink2}>• {t('form.privacy2')}</Txt>
        <Txt v="xs" color={C.ink2}>• {t('form.privacy3')}</Txt>
      </View>
      <CityPicker visible={cityOpen} value={f.values.city_id} allowAll={false} onClose={() => setCityOpen(false)} onPick={changeCity} />
    </Screen>
  );
}

const st = StyleSheet.create({
  city: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: S[3], borderRadius: R.md, borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.surface },
  map: { height: 230, borderRadius: R.md, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  thumb: { width: 96, height: 96, borderRadius: R.md, backgroundColor: C.surface2 },
  privacy: { gap: 6, padding: S[3], backgroundColor: C.green50, borderRadius: R.md },
});
