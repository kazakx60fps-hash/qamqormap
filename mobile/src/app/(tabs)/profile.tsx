// «Профиль»: тіл, аккаунт, рөлге сай функциялар (ерікті профилі, координатор панелі), демо-кіру, сервер баптауы.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { C, R, S } from '../../theme';
import { Screen } from '../../components/Screen';
import { Alert, Badge, Btn, Card, Row, Section, Txt } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { LangSwitch } from '../../components/LangSwitch';
import { CityPicker } from '../../components/CityPicker';
import { ConfirmDialog, useToast } from '../../components/overlays';
import { Logo } from '../../components/Logo';
import { useI18n } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { useFmt } from '../../lib/fmt';
import { useLoad } from '../../lib/useLoad';
import { api, apiBase } from '../../lib/api';

type DemoAcc = { role: 'author' | 'volunteer' | 'coordinator' | 'org_coordinator' | 'org_volunteer' | 'recipient'; full_name: string; city_id: number };

export default function ProfileTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const router = useRouter();
  const toast = useToast();
  const { user, summary, logout, demoLogin, refresh } = useAuth();
  const [cityOpen, setCityOpen] = useState(false);
  const [askLogout, setAskLogout] = useState(false);
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const demo = useLoad(() => api<{ enabled: boolean; accounts: DemoAcc[] }>('/auth/demo'), [user?.id]);

  const doDemo = async (role: DemoAcc['role']) => {
    setBusyRole(role);
    try {
      const u = await demoLogin(role);
      toast(t('auth.welcomeBack', { name: u.full_name }));
    } catch (e) {
      toast(fmt.errText(e), 'error');
    } finally {
      setBusyRole(null);
    }
  };

  const saveCity = async (id: number | null) => {
    setCityOpen(false);
    if (!user || !id) return;
    try {
      await api('/auth/profile', { method: 'PATCH', body: { full_name: user.full_name, phone: user.phone, city_id: id } });
      await refresh();
      toast(t('profile.saved'));
    } catch (e) { toast(fmt.errText(e), 'error'); }
  };

  const demoBlock = demo.data?.enabled ? (
    <Card style={{ backgroundColor: C.demo50, borderColor: '#F1DD9A' }} testID="demo-login">
      <Row gap={8}><Icon name="flag" size={20} color={C.demo} /><Txt v="h3" color={C.demo} style={{ flex: 1 }}>{t('m.profile.demoTitle')}</Txt></Row>
      <Txt v="sm" color={C.ink2}>{t('m.profile.demoText')}</Txt>
      {demo.data.accounts.map((a) => (
        <Btn key={a.role} title={`${t(`m.profile.demoAs.${a.role}`)} · ${a.full_name}`} kind={user ? 'secondary' : 'primary'} small
          icon={a.role.includes('coordinator') ? 'shield' : a.role.includes('volunteer') ? 'hand' : 'user'} loading={busyRole === a.role}
          onPress={() => doDemo(a.role)} testID={`demo-${a.role}`} />
      ))}
    </Card>
  ) : null;

  return (
    <Screen title={t('m.tabs.profile')} back={false} testID="profile-screen">
      <Section title={t('lang.label')}>
        <LangSwitch testID="lang-profile" />
      </Section>

      {!user ? (
        <>
          <Card>
            <Row gap={12}><Logo size={44} /><View style={{ flex: 1 }}><Txt v="h3">{t('m.profile.guestTitle')}</Txt><Txt v="sm" color={C.ink2}>{t('m.profile.guestText')}</Txt></View></Row>
            <Btn title={t('nav.login')} icon="login" onPress={() => router.push('/login')} testID="profile-login" />
            <Btn title={t('nav.register')} kind="secondary" onPress={() => router.push('/register')} testID="profile-register" />
          </Card>
          {demoBlock}
        </>
      ) : (
        <>
          <Card testID="profile-card">
            <Row gap={12}>
              <View style={st.avatar}><Txt v="h2" color={C.white}>{user.full_name.slice(0, 1)}</Txt></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="h3" ugc>{user.full_name}</Txt>
                <Txt v="sm" color={C.muted}>{user.email}</Txt>
              </View>
            </Row>
            <Row gap={6} wrap>
              <Badge label={t('m.profile.roleAuthor')} fg={C.primaryDark} bg={C.primary50} icon="user" />
              {user.is_volunteer ? <Badge label={t('m.profile.roleVolunteer')} fg={C.violet} bg={C.violet50} icon="hand" /> : null}
              {user.is_coordinator ? <Badge label={t('role.coordinator')} fg={C.green} bg={C.green50} icon="shield" testID="role-coordinator" /> : null}
            </Row>
            <Pressable onPress={() => setCityOpen(true)} style={st.row} accessibilityRole="button" testID="profile-city">
              <Icon name="pin" size={20} color={C.primary} />
              <Txt v="md" style={{ flex: 1 }}>{t('profile.myCity')}: {user.city_id ? fmt.cityName(user.city_id) : '—'}</Txt>
              <Icon name="chevRight" size={18} color={C.muted} />
            </Pressable>
          </Card>

          {summary ? (
            <Row gap={8} wrap>
              <Stat n={summary.my_requests} label={t('dash.stats.requests')} onPress={() => router.push('/requests?seg=mine')} testID="stat-mine" />
              <Stat n={summary.my_applications} label={t('dash.stats.applications')} onPress={() => router.push('/requests?seg=offers')} testID="stat-offers" />
              <Stat n={summary.my_tasks} label={t('dash.stats.tasks')} onPress={() => router.push('/requests?seg=tasks')} testID="stat-tasks" />
              <Stat n={summary.helped} label={t('dash.stats.helped')} />
            </Row>
          ) : null}

          <Section title={t('m.profile.features')}>
            <Item icon="list" label={t('dash.tabs.requests')} onPress={() => router.push('/requests?seg=mine')} testID="go-mine" />
            <Item icon="hand" label={t('dash.tabs.applications')} onPress={() => router.push('/requests?seg=offers')} />
            <Item icon="checkCircle" label={t('dash.tabs.tasks')} onPress={() => router.push('/requests?seg=tasks')} />
            <Item icon="heart" label={user.is_volunteer ? t('vol.title') : t('vol.become')} onPress={() => router.push('/volunteer')} testID="go-volunteer" />
            <Item icon="map" label={t('nav.incidents')} onPress={() => router.push('/incidents')} color={C.disaster} testID="go-incidents" />
            <Item icon="siren" label={t('nav.disasters')} onPress={() => router.push('/disasters')} color={C.disaster} />
            <Item icon="flag" label={t('disaster.reportBtn')} onPress={() => router.push('/report')} color={C.disaster} testID="go-report" />
            {user.orgs?.length ? <Item icon="users" label={t('nav.org')} hint={user.orgs.map((o) => o.name).join(', ')} onPress={() => router.push('/org')} color={C.violet} testID="go-org" /> : null}
            {user.is_coordinator ? <Item icon="shield" label={t('nav.coordPanel')} onPress={() => router.push('/coordinator')} color={C.green} testID="go-coordinator" /> : null}
          </Section>
          {demoBlock}
        </>
      )}

      <Section title={t('m.profile.app')}>
        <Item icon="info" label={t('nav.about')} onPress={() => router.push('/about')} />
        <Item icon="server" label={t('m.settings.server')} hint={apiBase()} onPress={() => router.push('/settings')} testID="go-settings" />
      </Section>
      <Alert kind="info" text={t('m.profile.persistNote')} />
      {user ? <Btn title={t('nav.logout')} kind="danger" icon="logout" onPress={() => setAskLogout(true)} testID="logout" /> : null}

      <CityPicker visible={cityOpen} value={user?.city_id ?? null} allowAll={false} onClose={() => setCityOpen(false)} onPick={saveCity} />
      <ConfirmDialog visible={askLogout} title={t('nav.logout')} text={t('m.profile.logoutText')} okLabel={t('nav.logout')} danger testID="logout-dlg"
        onClose={() => setAskLogout(false)} onConfirm={async () => { await logout(); setAskLogout(false); toast(t('auth.loggedOut')); }} />
    </Screen>
  );
}

function Stat({ n, label, onPress, testID }: { n: number; label: string; onPress?: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={st.stat} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${n} ${label}`} testID={testID}>
      <Txt v="h2" color={C.primaryDark}>{n}</Txt>
      <Txt v="xs" color={C.ink2}>{label}</Txt>
    </Pressable>
  );
}

function Item({ icon, label, hint, onPress, color = C.primary, testID }: { icon: string; label: string; hint?: string; onPress: () => void; color?: string; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.item, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <View style={[st.itemIco, { backgroundColor: color + '18' }]}><Icon name={icon} size={20} color={color} /></View>
      <View style={{ flex: 1 }}>
        <Txt v="md" style={{ fontWeight: '700' }}>{label}</Txt>
        {hint ? <Txt v="xs" color={C.muted} numberOfLines={1}>{hint}</Txt> : null}
      </View>
      <Icon name="chevRight" size={18} color={C.muted} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.violet, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderTopWidth: 1, borderTopColor: C.border, marginTop: 4 },
  stat: { flexGrow: 1, flexBasis: '45%', backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S[3], gap: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: S[3], backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.border },
  itemIco: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
