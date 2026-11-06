// Төменгі навигация: Карта · Өтініштер · [Өтініш қосу] · Хабарламалар · Профиль
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, shadow } from '../../theme';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { useAuth } from '../../lib/auth';

const TABS: Record<string, { icon: string; label: string }> = {
  index: { icon: 'map', label: 'm.tabs.map' },
  requests: { icon: 'list', label: 'm.tabs.requests' },
  notifications: { icon: 'bell', label: 'm.tabs.notifications' },
  profile: { icon: 'user', label: 'm.tabs.profile' },
};

function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { summary } = useAuth();
  const router = useRouter();
  const unread = (summary?.unread ?? 0) + (summary?.unread_chats ?? 0);
  const items = state.routes.map((route, i) => {
    const conf = TABS[route.name];
    if (!conf) return null;
    const focused = state.index === i;
    const badge = route.name === 'notifications' && unread > 0 ? unread : 0;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        aria-selected={focused}
        accessibilityLabel={badge ? `${t(conf.label)}: ${badge}` : t(conf.label)}
        testID={`tab-${route.name}`}
        onPress={() => { if (!focused) navigateToTab(route.key); }}
        style={st.tab}
      >
        <View>
          <Icon name={conf.icon} size={24} color={focused ? C.primary : C.muted} stroke={focused ? 2.4 : 2} />
          {badge ? <View style={st.badge}><Text style={st.badgeText}>{badge > 99 ? '99+' : badge}</Text></View> : null}
        </View>
        <Text style={[st.label, { color: focused ? C.primary : C.muted }]} numberOfLines={1}>{t(conf.label)}</Text>
      </Pressable>
    );
  }).filter(Boolean);
  const fab = (
    <View key="fab" style={st.tab}>
      <Pressable onPress={() => router.push('/request/new')} accessibilityRole="button" accessibilityLabel={t('common.addRequest')}
        testID="fab-add" style={({ pressed }) => [st.fab, pressed && { opacity: 0.9 }]}>
        <Icon name="plus" size={28} color={C.white} stroke={2.6} />
      </Pressable>
      <Text style={[st.label, { color: C.primaryDark, fontWeight: '800' }]} numberOfLines={1}>{t('m.tabs.add')}</Text>
    </View>
  );
  return (
    <View style={[st.bar, { paddingBottom: Math.max(insets.bottom, 6) }]} accessibilityRole="tablist">
      {items.slice(0, 2)}{fab}{items.slice(2)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="requests" />
      <Tabs.Screen name="notifications" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6, ...shadow(1) },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 54, gap: 2 },
  label: { ...F.xs, fontSize: 11.5, fontWeight: '700' },
  fab: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: -22, borderWidth: 4, borderColor: C.surface, ...shadow(2) },
  badge: { position: 'absolute', top: -6, right: -12, minWidth: 20, height: 20, borderRadius: R.pill, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: C.surface },
  badgeText: { color: C.white, fontSize: 11, fontWeight: '800' },
});
