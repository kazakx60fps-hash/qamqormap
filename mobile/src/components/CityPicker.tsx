// Қала таңдау: Қазақстанның барлық қаласы, облыс бойынша топталған; қазақша, орысша және латынша іздеу.
import { useMemo, useState } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, HIT, R, S } from '../theme';
import { Icon } from './Icon';
import { Empty, H3, Txt } from './ui';
import { useI18n } from '../i18n';
import { useMeta } from '../lib/meta';
import { useFmt } from '../lib/fmt';
import type { City } from '../lib/types';

const KZ_MAP: Record<string, string> = { 'ә': 'а', 'ғ': 'г', 'қ': 'к', 'ң': 'н', 'ө': 'о', 'ұ': 'у', 'ү': 'у', 'һ': 'х', 'і': 'и', 'ё': 'е', 'й': 'и' };
export const norm = (s: string) => s.toLowerCase().replace(/[әғқңөұүһіёй]/g, (c) => KZ_MAP[c] ?? c).replace(/[^\p{L}\p{N}\s-]/gu, '').trim();

export function searchCities(cities: City[], q: string) {
  const n = norm(q);
  if (!n) return cities;
  return cities.filter((c) => norm(`${c.name_kk} ${c.name_ru} ${c.name_en} ${c.search_text}`).includes(n));
}

export function CityPicker({ visible, onClose, value, onPick, allowAll = true, title }: {
  visible: boolean; onClose: () => void; value: number | null; onPick: (id: number | null) => void; allowAll?: boolean; title?: string;
}) {
  const { t, lang } = useI18n();
  const meta = useMeta();
  const fmt = useFmt();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');

  const sections = useMemo(() => {
    const list = searchCities(meta.cities, q);
    const groups = new Map<string, City[]>();
    for (const c of list) {
      const k = c.region_code ?? '_';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(c);
    }
    const coll = lang === 'en' ? 'en' : lang === 'ru' ? 'ru' : 'kk';
    const out = [...groups.entries()].map(([code, data]) => ({
      code, title: fmt.regionName(code === '_' ? null : code) || '—',
      sort: meta.regionsByCode.get(code)?.sort ?? 999,
      data: data.sort((a, b) => Number(b.is_major) - Number(a.is_major) || fmt.cityObjName(a).localeCompare(fmt.cityObjName(b), coll)),
    }));
    return out.sort((a, b) => a.sort - b.sort);
  }, [meta.cities, meta.regionsByCode, q, fmt, lang]);

  const close = () => { setQ(''); onClose(); };
  const pick = (id: number | null) => { setQ(''); onPick(id); };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
      <View style={[st.wrap, { paddingTop: insets.top + 8 }]} testID="city-picker">
        <View style={st.head}>
          <H3 style={{ flex: 1 }}>{title ?? t('city.pickTitle')}</H3>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} style={st.close} testID="city-close">
            <Icon name="x" size={24} color={C.ink} />
          </Pressable>
        </View>
        <View style={st.search}>
          <Icon name="search" size={20} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder={t('city.searchPlaceholder')} placeholderTextColor={C.subtle}
            style={st.input} accessibilityLabel={t('city.search')} autoCorrect={false} testID="city-search" />
          {q ? <Pressable onPress={() => setQ('')} accessibilityLabel={t('common.clear')} style={{ padding: 8 }}><Icon name="x" size={18} color={C.muted} /></Pressable> : null}
        </View>
        <Txt v="xs" color={C.muted} style={{ paddingHorizontal: S[4], marginBottom: 6 }}>{t('m.city.total', { count: meta.cities.length })}</Txt>
        <SectionList
          sections={sections}
          keyExtractor={(c) => String(c.id)}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={allowAll && !q ? (
            <Pressable onPress={() => pick(null)} style={[st.row, value === null && st.rowOn]} accessibilityRole="radio" accessibilityState={{ checked: value === null }} testID="city-all">
              <View style={[st.dot, { backgroundColor: C.primary50 }]}><Icon name="kz" size={20} color={C.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[F.md, { fontWeight: '800', color: C.ink }]}>{t('city.all')}</Text>
                <Text style={[F.xs, { color: C.muted, fontWeight: '500' }]}>{t('city.allHint')}</Text>
              </View>
              {value === null ? <Icon name="check" size={20} color={C.primary} stroke={3} /> : null}
            </Pressable>
          ) : undefined}
          ListEmptyComponent={<Empty icon="search" title={t('city.notFound')} text={t('city.notFoundHint')} />}
          renderSectionHeader={({ section }) => (
            <View style={st.secHead}><Text style={[F.xs, { color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 }]}>{section.title}</Text></View>
          )}
          renderItem={({ item }) => {
            const on = item.id === value;
            return (
              <Pressable onPress={() => pick(item.id)} style={[st.row, on && st.rowOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}
                accessibilityLabel={fmt.cityObjName(item)} testID={`city-${item.id}`}>
                <View style={st.dot}><Icon name="pin" size={18} color={item.is_major ? C.primary : C.muted} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[F.md, { fontWeight: item.is_major ? '800' : '600', color: C.ink }]}>{fmt.cityObjName(item)}</Text>
                  {/* Жергілікті атауы (іздеуге көмектеседі) — аударма емес */}
                  <Text style={[F.xs, { color: C.muted, fontWeight: '500' }]} {...({ dataSet: { local: '1' } } as object)}>{lang === 'ru' ? item.name_kk : lang === 'en' ? `${item.name_kk} · ${item.name_ru}` : item.name_ru}</Text>
                </View>
                {item.active_count ? <Text style={[F.xs, st.count]}>{item.active_count}</Text> : null}
                {on ? <Icon name="check" size={20} color={C.primary} stroke={3} /> : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: S[4], paddingRight: S[2] },
  close: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: S[4], marginVertical: S[2], paddingHorizontal: S[3], minHeight: HIT, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.borderStrong },
  input: { flex: 1, fontSize: 16, color: C.ink, minHeight: HIT - 4 },
  secHead: { backgroundColor: C.bg, paddingHorizontal: S[4], paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: S[4], paddingVertical: 8, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  rowOn: { backgroundColor: C.primary50 },
  dot: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  count: { color: C.primaryDark, backgroundColor: C.primary50, paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.pill, overflow: 'hidden' },
});
