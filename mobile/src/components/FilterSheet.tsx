// Сүзгілер: санат, шұғылдық, мәртебе; апаттар үшін — түрі, өзектілігі, тексеру; «Бүкіл Қазақстан» режимінде — облыс.
import { View } from 'react-native';
import { C, S } from '../theme';
import { BottomModal } from './overlays';
import { Btn, Chip, Row, Segmented, Txt } from './ui';
import { categoryIcon, disasterIcon } from './Icon';
import { useI18n } from '../i18n';
import { useMeta } from '../lib/meta';
import { useFilters, type Filters } from '../lib/filters';
import { useFmt } from '../lib/fmt';

export function FilterSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const meta = useMeta();
  const fmt = useFmt();
  const { filters: f, setFilters, resetFilters, cityId } = useFilters();
  const cats = meta.categories.filter((c) => f.direction === 'all' || c.direction === f.direction);
  const showDisaster = f.direction !== 'everyday';
  return (
    <BottomModal visible={visible} onClose={onClose} title={t('map.filters')} testID="filters" full
      footer={<Row gap={8}>
        <Btn title={t('map.reset')} kind="secondary" onPress={resetFilters} style={{ flex: 1 }} testID="filters-reset" />
        <Btn title={t('m.filters.show')} onPress={onClose} style={{ flex: 1.3 }} testID="filters-apply" />
      </Row>}>
      <Txt v="sm" style={{ fontWeight: '800' }}>{t('map.category')}</Txt>
      <Row wrap gap={8}>
        <Chip label={t('map.allCategories')} selected={!f.categoryId} onPress={() => setFilters({ categoryId: null })} testID="f-cat-all" />
        {cats.map((c) => (
          <Chip key={c.id} label={t(`catShort.${c.code}`)} icon={categoryIcon(c.code)} color={c.direction === 'disaster' ? C.disaster : C.primary}
            selected={f.categoryId === c.id} onPress={() => setFilters({ categoryId: f.categoryId === c.id ? null : c.id })} testID={`f-cat-${c.code}`} />
        ))}
      </Row>
      <Txt v="sm" style={{ fontWeight: '800' }}>{t('map.urgency')}</Txt>
      <Segmented<string> value={f.urgency ?? 'any'} onChange={(v) => setFilters({ urgency: v === 'any' ? null : (v as Filters['urgency']) })} testID="f-urg"
        options={[{ value: 'any', label: t('m.filters.any') }, { value: 'high', label: t('urgency.high') }, { value: 'normal', label: t('urgency.normal') }, { value: 'low', label: t('urgency.low') }]} />
      <Txt v="sm" style={{ fontWeight: '800' }}>{t('map.status')}</Txt>
      <Row wrap gap={8}>
        {(['active', 'open', 'progress', 'completed', 'all'] as const).map((s) => (
          <Chip key={s} label={t(`map.statusOpt.${s}`)} selected={f.status === s} onPress={() => setFilters({ status: s })} testID={`f-status-${s}`} />
        ))}
      </Row>
      {cityId === null ? (
        <>
          <Txt v="sm" style={{ fontWeight: '800' }}>{t('disaster.region')}</Txt>
          <Row wrap gap={8}>
            <Chip label={t('city.allRegions')} selected={!f.region} onPress={() => setFilters({ region: null })} />
            {meta.regions.map((r) => (
              <Chip key={r.code} label={fmt.regionName(r.code)} selected={f.region === r.code} onPress={() => setFilters({ region: r.code })} testID={`f-region-${r.code}`} />
            ))}
          </Row>
        </>
      ) : null}
      {showDisaster ? (
        <View style={{ gap: S[3], padding: S[3], borderRadius: 14, backgroundColor: C.disaster50 }}>
          <Txt v="sm" color={C.disasterDark} style={{ fontWeight: '800' }}>{t('dir.disaster')}</Txt>
          <Txt v="xs" color={C.ink2}>{t('disaster.type')}</Txt>
          <Row wrap gap={8}>
            <Chip label={t('disaster.anyType')} selected={!f.disasterType} onPress={() => setFilters({ disasterType: null })} color={C.disaster} />
            {meta.disasterTypes.map((d) => (
              <Chip key={d.code} label={t(`dtype.${d.code}`)} icon={disasterIcon(d.code)} color={C.disaster} selected={f.disasterType === d.code}
                onPress={() => setFilters({ disasterType: f.disasterType === d.code ? null : d.code })} testID={`f-dtype-${d.code}`} />
            ))}
          </Row>
          <Txt v="xs" color={C.ink2}>{t('disaster.activity')}</Txt>
          <Segmented<string> value={f.activity ?? 'any'} onChange={(v) => setFilters({ activity: v === 'any' ? null : (v as Filters['activity']) })} testID="f-activity"
            options={[{ value: 'active', label: t('disaster.activityOpt.active') }, { value: 'resolved', label: t('disaster.activityOpt.resolved') }, { value: 'any', label: t('disaster.activityOpt.any') }]} />
          <Txt v="xs" color={C.ink2}>{t('disaster.verification')}</Txt>
          <Segmented<string> value={f.verification ?? 'any'} onChange={(v) => setFilters({ verification: v === 'any' ? null : (v as Filters['verification']) })} testID="f-verify"
            options={[{ value: 'any', label: t('m.filters.any') }, { value: 'verified', label: t('verify.verified') }, { value: 'unverified', label: t('verify.unverified') }]} />
        </View>
      ) : null}
    </BottomModal>
  );
}
