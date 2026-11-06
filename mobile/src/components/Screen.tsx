// Экран қаңқасы: қауіпсіз шегіністер, тақырып, артқа батырмасы, пернетақтаға бейімделу.
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { C, HIT, S } from '../theme';
import { Icon } from './Icon';
import { H2 } from './ui';
import { useI18n } from '../i18n';

export function Header({ title, back = true, right, testID }: { title: string; back?: boolean; right?: React.ReactNode; testID?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  return (
    <View style={[st.header, { paddingTop: insets.top + 6 }]} testID={testID}>
      {back ? (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button"
          accessibilityLabel={t('m.back')} style={st.back} testID="back">
          <Icon name="arrowLeft" size={24} color={C.ink} />
        </Pressable>
      ) : <View style={{ width: S[2] }} />}
      <H2 style={{ flex: 1 }} numberOfLines={2}>{title}</H2>
      {right}
    </View>
  );
}

export function Screen({ title, back = true, right, children, scroll = true, refreshing, onRefresh, contentStyle, footer, testID }: {
  title: string; back?: boolean; right?: React.ReactNode; children: React.ReactNode; scroll?: boolean;
  refreshing?: boolean; onRefresh?: () => void; contentStyle?: StyleProp<ViewStyle>; footer?: React.ReactNode; testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={st.wrap} testID={testID}>
      <Header title={title} back={back} right={right} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[st.content, { paddingBottom: (footer ? S[4] : insets.bottom + S[8]) }, contentStyle]}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.primary} /> : undefined}
          >
            {children}
          </ScrollView>
        ) : <View style={[{ flex: 1 }, contentStyle]}>{children}</View>}
        {footer ? <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, S[3]) }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: S[1], paddingHorizontal: S[2], paddingBottom: S[2], backgroundColor: C.bg },
  back: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  content: { padding: S[4], gap: S[4] },
  footer: { paddingHorizontal: S[4], paddingTop: S[3], backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border },
});
