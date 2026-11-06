import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C, S } from '../theme';
import { Screen } from '../components/Screen';
import { Alert, Btn, Field, Row, Txt } from '../components/ui';
import { Logo } from '../components/Logo';
import { useToast } from '../components/overlays';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useFmt } from '../lib/fmt';
import { useForm } from '../lib/useForm';

export default function Login() {
  const { t } = useI18n();
  const fmt = useFmt();
  const router = useRouter();
  const toast = useToast();
  const { login } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const f = useForm({ email: '', password: '' });
  const go = () => f.submit(async () => {
    const u = await login(f.values.email.trim(), f.values.password);
    toast(t('auth.welcomeBack', { name: u.full_name }));
    if (next && next.startsWith('/')) router.replace(next as never);
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  });
  return (
    <Screen title={t('auth.loginTitle')} testID="login-screen">
      <Row gap={12}><Logo size={44} /><Txt v="sm" color={C.ink2} style={{ flex: 1 }}>{t('auth.artLoginText')}</Txt></Row>
      {f.formError && !Object.keys(f.errors).length ? <Alert kind="danger" text={fmt.errText(f.formError)} /> : null}
      <Field label="Email" value={f.values.email} onChangeText={(v) => f.set('email', v)} autoCapitalize="none" keyboardType="email-address"
        autoComplete="email" textContentType="emailAddress" error={fmt.fieldText(f.errors.email)} testID="login-email" returnKeyType="next" />
      <Field label={t('auth.password')} value={f.values.password} onChangeText={(v) => f.set('password', v)} secureTextEntry autoComplete="password"
        textContentType="password" error={fmt.fieldText(f.errors.password)} testID="login-password" onSubmitEditing={go} returnKeyType="go" />
      <Btn title={t('nav.login')} icon="login" onPress={go} loading={f.busy} testID="login-submit" />
      <View style={{ gap: S[2], alignItems: 'center' }}>
        <Txt v="sm" color={C.muted}>{t('auth.noAccount')}</Txt>
        <Btn title={t('auth.registerLink')} kind="ghost" onPress={() => router.replace('/register')} testID="to-register" />
      </View>
    </Screen>
  );
}
