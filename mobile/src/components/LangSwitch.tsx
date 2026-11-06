// Тіл ауыстырғыш (KK / RU / EN). Тіл ауысқанда экран, қала, сүзгілер және енгізілген мәтін өзгермейді.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F, R } from '../theme';
import { LANGS, useI18n } from '../i18n';
import { useAuth } from '../lib/auth';

export function LangSwitch({ compact, testID = 'lang' }: { compact?: boolean; testID?: string }) {
  const { lang, t } = useI18n();
  const { changeLang } = useAuth();
  return (
    <View style={[st.wrap, compact && st.compact]} accessibilityRole="radiogroup" accessibilityLabel={t('lang.label')} testID={testID}>
      {LANGS.map((l) => {
        const on = l.code === lang;
        return (
          <Pressable key={l.code} onPress={() => changeLang(l.code)} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on}
            accessibilityLabel={l.native} testID={`${testID}-${l.code}`} hitSlop={4}
            style={[st.item, compact && st.itemCompact, on && st.on]}>
            <Text style={[F.xs, { color: on ? C.white : C.ink2, fontWeight: '800' }]}>{compact ? l.short : l.native}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: R.pill, padding: 3, gap: 2, alignSelf: 'flex-start' },
  compact: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  item: { minHeight: 42, paddingHorizontal: 14, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  itemCompact: { minHeight: 38, minWidth: 40, paddingHorizontal: 8 },
  on: { backgroundColor: C.primary },
});
