import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Empty } from './ui';
import { useI18n } from '../i18n';
import { S } from '../theme';

export function LoginPrompt({ title, text }: { title?: string; text?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Empty icon="lock" title={title ?? t('state.loginNeeded')} text={text ?? t('m.profile.guestText')}
      action={<View style={{ gap: S[2], alignSelf: 'stretch' }}>
        <Btn title={t('nav.login')} icon="login" onPress={() => router.push('/login')} testID="prompt-login" />
        <Btn title={t('nav.register')} kind="secondary" onPress={() => router.push('/register')} />
      </View>} />
  );
}
