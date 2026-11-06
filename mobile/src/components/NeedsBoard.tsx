// «Қажеттіліктер» тақтасы (мобильді): күйлер бойынша өтініштер саны (басқанда тізім), қала/аудан × санат топтары,
// ресурс мөлшері бірлігімен бөлек, сүзгілер, шамамен нүктелер картасы. Деректер — GET /api/events/:id/needs.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { C, R, S } from '../theme';
import { Badge, Btn, Empty, ErrorView, H2, Loading, Row, Txt } from './ui';
import { Icon, categoryIcon } from './Icon';
import { RequestCard } from './cards';
import { SelectField } from './overlays';
import { QMap } from '../map/QMap';
import { useI18n } from '../i18n';
import { useMeta } from '../lib/meta';
import { useFmt } from '../lib/fmt';
import { useLoad } from '../lib/useLoad';
import { api } from '../lib/api';
import type { NeedState, RequestItem } from '../lib/types';

const STATES: NeedState[] = ['need_executor', 'assigned', 'awaiting', 'confirmed'];
export const NEED_COLOR: Record<NeedState, { fg: string; bg: string }> = {
  need_executor: { fg: '#C2410C', bg: '#FFF1E7' },
  assigned: { fg: C.violet, bg: C.violet50 },
  awaiting: { fg: C.amber, bg: C.amber50 },
  confirmed: { fg: C.green, bg: C.green50 },
};

type Group = { city_id: number; district: string | null; category_code: string; counts: Record<NeedState, number>; total: number; resources: { unit: string; amount: number }[] };
type Needs = {
  event: { id: number; is_demo: boolean };
  totals: Record<NeedState, number> & { total: number };
  groups: Group[];
  items: (RequestItem & { need_state: NeedState })[];
  facets: { areas: { city_id: number; district: string | null }[]; categories: string[] };
};

export const qtyLabel = (t: (k: string, p?: Record<string, string | number>) => string, q?: number | null, unit?: string | null) =>
  q != null && unit ? t(`units.${unit}`, { count: Number(q) }) : '';

export function NeedsBoard({ eventId }: { eventId: number }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const meta = useMeta();
  const router = useRouter();
  const [area, setArea] = useState('');
  const [cat, setCat] = useState('');
  const [state, setState] = useState<NeedState | ''>('');
  const [cityId, district] = area ? area.split('|') : ['', ''];
  const { data, error, loading, reload } = useLoad<Needs>(() => api(`/events/${eventId}/needs`, {
    query: { city_id: cityId || undefined, district: area ? district : undefined, category: cat || undefined, state: state || undefined },
  }), [eventId, area, cat, state]);

  const areaText = (a: { city_id: number; district: string | null }) => `${fmt.cityName(a.city_id)} · ${a.district || t('needs.noDistrict')}`;
  const pick = (st: NeedState, g?: Group) => {
    setState(st);
    if (g) { setArea(`${g.city_id}|${g.district || ''}`); setCat(g.category_code); }
  };
  const filtered = !!(area || cat || state);

  return (
    <View style={st.wrap} testID="needs-board">
      <Row gap={8} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Row gap={8}><Icon name="list" size={22} color={C.disaster} /><H2>{t('needs.title')}</H2></Row>
          <Txt v="sm" color={C.ink2}>{t('needs.lead')}</Txt>
        </View>
        {data?.event.is_demo ? <Badge label={t('demo.eventBadge')} fg={C.demo} bg={C.demo50} icon="flag" testID="needs-demo" /> : null}
      </Row>
      <Txt v="xs" color={C.muted}>{t('needs.publicNote')}</Txt>
      {loading && !data ? <Loading /> : error ? <ErrorView text={fmt.errText(error)} onRetry={reload} /> : data ? (
        <>
          <View style={st.tiles} accessibilityLabel={t('needs.requests')}>
            {STATES.map((s) => {
              const c = NEED_COLOR[s];
              const on = state === s;
              return (
                <Pressable key={s} onPress={() => setState(on ? '' : s)} accessibilityRole="button" aria-selected={on}
                  accessibilityLabel={`${t(`needs.states.${s}`)}: ${data.totals[s]}`} testID={`needs-tile-${s}`}
                  style={[st.tile, { borderColor: c.fg + '55' }, on && { borderColor: c.fg, backgroundColor: c.bg }]}>
                  <Txt v="h2" color={c.fg}>{data.totals[s]}</Txt>
                  <Txt v="xs" color={C.ink2}>{t(`needs.states.${s}`)}</Txt>
                </Pressable>
              );
            })}
            <View style={[st.tile, { backgroundColor: C.surface2 }]}><Txt v="h2">{data.totals.total}</Txt><Txt v="xs" color={C.ink2}>{t('needs.requests')}</Txt></View>
          </View>
          <SelectField<string> label={t('needs.area')} value={area} onChange={setArea} testID="needs-area"
            options={[{ value: '', label: t('needs.any') }, ...data.facets.areas.map((a) => ({ value: `${a.city_id}|${a.district || ''}`, label: areaText(a) }))]} />
          <Row gap={8}>
            <View style={{ flex: 1 }}>
              <SelectField<string> label={t('needs.category')} value={cat} onChange={setCat} testID="needs-cat"
                options={[{ value: '', label: t('needs.any') }, ...data.facets.categories.map((c) => ({ value: c, label: t(`catShort.${c}`), icon: categoryIcon(c) }))]} />
            </View>
            <View style={{ flex: 1 }}>
              <SelectField<string> label={t('needs.state')} value={state} onChange={(v) => setState(v as NeedState | '')} testID="needs-state"
                options={[{ value: '', label: t('needs.any') }, ...STATES.map((s) => ({ value: s, label: t(`needs.states.${s}`) }))]} />
            </View>
          </Row>
          {filtered ? <Btn title={t('needs.reset')} kind="ghost" small icon="x" onPress={() => { setArea(''); setCat(''); setState(''); }} testID="needs-reset" /> : null}

          {data.groups.length === 0 ? <Empty icon="inbox" title={filtered ? t('needs.empty') : t('needs.emptyAll')} /> : data.groups.map((g) => (
            <View key={`${g.city_id}|${g.district}|${g.category_code}`} style={st.group} testID={`needs-group-${g.category_code}`}>
              <Row gap={8}>
                <Icon name={categoryIcon(g.category_code)} size={20} color={C.disaster} />
                <View style={{ flex: 1 }}>
                  <Txt v="md" style={{ fontWeight: '800' }}>{t(`catShort.${g.category_code}`)}</Txt>
                  <Txt v="xs" color={C.muted} ugc={!!g.district}>{areaText(g)}</Txt>
                </View>
              </Row>
              <Row wrap gap={6}>
                {STATES.map((s) => {
                  const n = g.counts[s];
                  const c = NEED_COLOR[s];
                  return (
                    <Pressable key={s} disabled={!n} onPress={() => pick(s, g)} accessibilityRole="button" accessibilityLabel={`${t(`needs.states.${s}`)}: ${n}`}
                      testID={`needs-count-${g.category_code}-${s}`} style={[st.count, { backgroundColor: n ? c.bg : C.surface2 }]}>
                      <Txt v="md" color={n ? c.fg : C.subtle} style={{ fontWeight: '800' }}>{n}</Txt>
                      <Txt v="xs" color={n ? c.fg : C.subtle}>{t(`needs.states.${s}`)}</Txt>
                    </Pressable>
                  );
                })}
              </Row>
              {g.resources.length ? (
                <Row wrap gap={6}>
                  <Txt v="xs" color={C.muted}>{t('needs.resources')}:</Txt>
                  {g.resources.map((x) => <Badge key={x.unit} label={qtyLabel(t, x.amount, x.unit)} fg={C.ink} bg={C.surface2} icon="layers" />)}
                </Row>
              ) : null}
            </View>
          ))}
          {data.groups.length ? <Txt v="xs" color={C.muted}>{t('needs.resourcesHint')}</Txt> : null}

          {data.items.length ? (
            <View style={{ gap: S[3] }} testID="needs-list">
              <Txt v="h3">{t('needs.listTitle', { count: data.items.length })}</Txt>
              <QMap style={st.map} initialView={{ center: [data.items[0].approx_lat ?? 48, data.items[0].approx_lng ?? 67], zoom: 12 }}
                tiles={meta.mapConfig} demoLabel={t('demo.eventBadge')} requests={data.items} fitOnData
                onSelect={(kind, id) => { if (kind === 'request') router.push(`/request/${id}`); }} accessibilityLabel={t('needs.showOnMap')} testID="needs-map" />
              {data.items.map((r) => (
                <View key={r.id} style={{ gap: 6 }} testID="needs-item">
                  <Row wrap gap={6}>
                    <Badge label={t(`needs.states.${r.need_state}`)} fg={NEED_COLOR[r.need_state].fg} bg={NEED_COLOR[r.need_state].bg} />
                    <Badge label={t('needs.checked')} fg={C.green} bg={C.green50} icon="shield" />
                    <Txt v="xs" color={C.muted}>{t('event.updated', { time: fmt.rel(r.updated_at) })}</Txt>
                  </Row>
                  <RequestCard r={r} compact onPress={() => router.push(`/request/${r.id}`)}
                    onHelp={r.status === 'open' ? () => router.push(`/request/${r.id}?apply=1`) : undefined} />
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: S[3], padding: S[4], borderRadius: R.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.disaster100 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 72, padding: S[3], borderRadius: R.md, borderWidth: 2, borderColor: C.border, gap: 2 },
  group: { gap: S[2], padding: S[3], borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  count: { minWidth: 72, minHeight: 48, paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  map: { height: 220, borderRadius: R.md, overflow: 'hidden' },
});
