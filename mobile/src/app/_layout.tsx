import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initApi } from '../lib/api';
import { I18nProvider, useI18n } from '../i18n';
import { MetaProvider } from '../lib/meta';
import { AuthProvider } from '../lib/auth';
import { FiltersProvider } from '../lib/filters';
import { ToastProvider } from '../components/overlays';
import { Logo } from '../components/Logo';
import { C } from '../theme';

function Boot({ children }: { children: React.ReactNode }) {
  const { ready } = useI18n();
  if (!ready) return <Splash />;
  return <>{children}</>;
}

function Splash() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 20 }}>
      <Logo size={64} withText />
      <ActivityIndicator color={C.primary} />
    </View>
  );
}

function HtmlLang() {
  const { lang } = useI18n();
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);
  return null;
}

export default function RootLayout() {
  const [apiReady, setApiReady] = useState(false);
  useEffect(() => { initApi().finally(() => setApiReady(true)); }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!apiReady ? <Splash /> : (
        <I18nProvider>
          <Boot>
            <HtmlLang />
            <MetaProvider>
              <AuthProvider>
                <FiltersProvider>
                  <ToastProvider>
                    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }} />
                  </ToastProvider>
                </FiltersProvider>
              </AuthProvider>
            </MetaProvider>
          </Boot>
        </I18nProvider>
      )}
    </SafeAreaProvider>
  );
}
