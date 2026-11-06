// Нәтижелер панелі: үш күй (жиналған, орташа, толық). Тартып немесе батырмалармен басқарылады.
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import { C, R, S, shadow } from '../theme';
import { Icon } from './Icon';
import { useI18n } from '../i18n';

export type SheetState = 'collapsed' | 'mid' | 'expanded';
const ORDER: SheetState[] = ['collapsed', 'mid', 'expanded'];

export function BottomSheet({ state, onChange, heights, header, children, testID = 'sheet' }: {
  state: SheetState; onChange: (s: SheetState) => void; heights: Record<SheetState, number>;
  header: React.ReactNode; children: React.ReactNode; testID?: string;
}) {
  const { t } = useI18n();
  const h = useRef(new Animated.Value(heights[state])).current;
  const cur = useRef(heights[state]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const hRef = useRef(heights);
  hRef.current = heights;

  useEffect(() => {
    cur.current = heights[state];
    Animated.spring(h, { toValue: heights[state], useNativeDriver: false, bounciness: 2, speed: 16 }).start();
  }, [state, heights, h]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => {
      const hs = hRef.current;
      const v = Math.min(hs.expanded, Math.max(hs.collapsed, cur.current - g.dy));
      h.setValue(v);
    },
    onPanResponderRelease: (_e, g) => {
      const hs = hRef.current;
      const v = Math.min(hs.expanded, Math.max(hs.collapsed, cur.current - g.dy));
      let next: SheetState;
      if (Math.abs(g.vy) > 0.6) {
        const i = ORDER.indexOf(stateRef.current) + (g.vy < 0 ? 1 : -1);
        next = ORDER[Math.max(0, Math.min(2, i))];
      } else {
        next = ORDER.reduce((best, s) => (Math.abs(hs[s] - v) < Math.abs(hs[best] - v) ? s : best), 'collapsed' as SheetState);
      }
      if (next === stateRef.current) Animated.spring(h, { toValue: hs[next], useNativeDriver: false, bounciness: 2 }).start();
      onChange(next);
    },
  }), [h, onChange]);

  const idx = ORDER.indexOf(state);
  return (
    <Animated.View style={[st.sheet, { height: h }]} testID={testID} accessibilityLabel={t('m.sheet.label')}>
      <View {...pan.panHandlers} style={st.drag}>
        <View style={st.handleRow}>
          <Pressable onPress={() => onChange(ORDER[Math.max(0, idx - 1)])} disabled={idx === 0} accessibilityRole="button"
            accessibilityLabel={t('m.sheet.down')} accessibilityState={{ disabled: idx === 0 }} style={[st.ctl, idx === 0 && { opacity: 0.35 }]} testID={`${testID}-down`}>
            <Icon name="chevDown" size={22} color={C.ink2} />
          </Pressable>
          <Pressable onPress={() => onChange(ORDER[(idx + 1) % 3])} accessibilityRole="button" accessibilityLabel={t('m.sheet.toggle')} style={st.handleHit} testID={`${testID}-handle`}>
            <View style={st.handle} />
          </Pressable>
          <Pressable onPress={() => onChange(ORDER[Math.min(2, idx + 1)])} disabled={idx === 2} accessibilityRole="button"
            accessibilityLabel={t('m.sheet.up')} accessibilityState={{ disabled: idx === 2 }} style={[st.ctl, idx === 2 && { opacity: 0.35 }]} testID={`${testID}-up`}>
            <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="chevDown" size={22} color={C.ink2} /></View>
          </Pressable>
        </View>
        {header}
      </View>
      <View style={{ flex: 1 }} testID={`${testID}-state-${state}`}>{children}</View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.surface,
    borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, overflow: 'hidden', ...shadow(3),
    ...(Platform.OS === 'web' ? { touchAction: 'none' } as object : {}),
  },
  drag: { paddingBottom: S[2], borderBottomWidth: 1, borderBottomColor: C.border },
  handleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S[2], height: 40 },
  handleHit: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: C.borderStrong },
  ctl: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
});
