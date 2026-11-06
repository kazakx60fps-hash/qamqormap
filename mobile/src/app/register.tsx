import { useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { C, S } from '../theme';
import { Screen } from '../components/Screen';
import { Alert, Btn, Field, Txt, Row } from '../components/ui';
import { Icon } from '../components/Icon';
import { CityPicker } from '../components/CityPicker';
import { useToast } from '../components/overlays';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useFilters } from '../lib/filters';
import { useFmt } from '../lib/fmt';
import { useForm } from '../lib/useForm';

export default function Register() {
  const { t } = useI18n();
  const fmt = useFmt();
  const router = useRouter();
  const toast = useToast();
  const { register } = useAuth();
  const { cityId } = useFilters();
  const [cityOpen, setCityOpen] = useState(false);
  const f = useForm({ full_name: '', email: '', phone: '', password: '', password_confirm: '', city_id: cityId ?? 1 });
  const go = () => f.submit(async () => {
    await register({ ...f.values, email: f.values.email.trim(), phone: f.values.phone.trim() || null });
    toast(t('auth.welcomeNew'));
    router.replace('/');
  });
  return (
    <Screen title={t('nav.register')} testID="register-screen"
      footer={<Btn title={t('auth.createAccount')} onPress={go} loading={f.busy} testID="reg-submit" />}>
      <Txt v="sm" color={C.ink2}>{t('auth.artRegisterText')}</Txt>
      {f.formError && !Object.keys(f.errors).length ? <Alert kind="danger" text={fmt.errText(f.formError)} /> : null}
      <Field label={t('auth.fullName')} placeholder={t('auth.fullNamePh')} value={f.values.full_name} onChangeText={(v) => f.set('full_name', v)}
        error={fmt.fieldText(f.errors.full_name)} testID="reg-name" autoComplete="name" />
      <Field label="Email" value={f.values.email} onChangeText={(v) => f.set('email', v)} autoCapitalize="none" keyboardType="email-address"
        error={fmt.fieldText(f.errors.email)} testID="reg-email" />
      <Field label={t('auth.phone')} hint={t('auth.phoneHint')} value={f.values.phone} onChangeText={(v) => f.set('phone', v)} keyboardType="phone-pad"
        error={fmt.fieldText(f.errors.phone)} optional testID="reg-phone" />
      <Txt v="sm" style={{ fontWeight: '700' }}>{t('auth.yourCity')}</Txt>
      <Pressable onPress={() => setCityOpen(true)} accessibilityRole="button" testID="reg-city"
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S[3], borderRadius: 12, borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.surface }}>
        <Icon name="pin" size={20} color={C.primary} /><Txt v="md" style={{ flex: 1 }}>{fmt.cityName(f.values.city_id)}</Txt><Icon name="chevDown" size={18} color={C.muted} />
      </Pressable>
      <Field label={t('auth.password')} hint={t('auth.passwordHint')} value={f.values.password} onChangeText={(v) => f.set('password', v)} secureTextEntry
        error={fmt.fieldText(f.errors.password)} testID="reg-password" />
      <Field label={t('auth.passwordConfirm')} value={f.values.password_confirm} onChangeText={(v) => f.set('password_confirm', v)} secureTextEntry
        error={fmt.fieldText(f.errors.password_confirm)} testID="reg-password2" />
      <Row gap={8}><Icon name="shield" size={18} color={C.green} /><Txt v="xs" color={C.ink2} style={{ flex: 1 }}>{t('m.auth.noCoordinatorSelf')}</Txt></Row>
      <CityPicker visible={cityOpen} value={f.values.city_id} allowAll={false} onClose={() => setCityOpen(false)} onPick={(id) => { if (id) f.set('city_id', id); setCityOpen(false); }} />
    </Screen>
  );
}
