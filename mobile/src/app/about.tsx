import { View } from 'react-native';
import { C, R, S } from '../theme';
import { Screen } from '../components/Screen';
import { Card, Row, Txt, H3 } from '../components/ui';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { useI18n } from '../i18n';

export default function About() {
  const { t } = useI18n();
  const arch = [
    { icon: 'phone', text: 'React Native + Expo (TypeScript)' },
    { icon: 'globe', text: 'HTML + CSS + JavaScript' },
    { icon: 'swap', text: 'HTTP / REST API' },
    { icon: 'server', text: 'Node.js + Express' },
    { icon: 'database', text: 'PostgreSQL' },
  ];
  return (
    <Screen title={t('nav.about')} testID="about-screen">
      <Logo size={56} withText />
      <Txt v="md" color={C.ink2}>{t('footer.about')}</Txt>
      <Card>
        <H3>{t('m.about.archTitle')}</H3>
        <Txt v="sm" color={C.ink2}>{t('m.about.archText')}</Txt>
        <View style={{ gap: 6 }}>
          {arch.map((a, i) => (
            <Row key={a.text} gap={10} style={{ padding: S[2], borderRadius: R.sm, backgroundColor: i < 2 ? C.primary50 : C.surface2 }}>
              <Icon name={a.icon} size={20} color={C.primary} /><Txt v="sm" style={{ fontWeight: '700', flex: 1 }}>{a.text}</Txt>
            </Row>
          ))}
        </View>
      </Card>
      <Card>
        <H3>{t('m.about.privacyTitle')}</H3>
        <Txt v="sm" color={C.ink2}>{t('form.privacy1')}</Txt>
        <Txt v="sm" color={C.ink2}>{t('form.privacy2')}</Txt>
        <Txt v="sm" color={C.ink2}>{t('m.about.token')}</Txt>
      </Card>
      <Card>
        <H3>{t('m.about.teamTitle')}</H3>
        <Txt v="md">{t('m.about.team')}</Txt>
        <Txt v="sm" color={C.muted}>{t('footer.demoNote')}</Txt>
      </Card>
    </Screen>
  );
}
