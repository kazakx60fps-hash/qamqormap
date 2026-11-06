// Сервер мекенжайы: телефон компьютердегі QamqorMap серверіне бір Wi‑Fi желісі арқылы қосылады.
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { C } from '../theme';
import { Screen } from '../components/Screen';
import { Alert, Btn, Field, Txt } from '../components/ui';
import { useToast } from '../components/overlays';
import { useI18n } from '../i18n';
import { api, apiBase, defaultBase, normalizeBase, setApiBase } from '../lib/api';
import { useMeta } from '../lib/meta';
import { useAuth } from '../lib/auth';

export default function Settings() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const meta = useMeta();
  const { refresh } = useAuth();
  const [url, setUrl] = useState(apiBase());
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');

  const check = async () => {
    setState('checking');
    try {
      await api('/health', { baseOverride: normalizeBase(url) });
      setState('ok');
      return true;
    } catch {
      setState('fail');
      return false;
    }
  };
  const save = async () => {
    await check();
    await setApiBase(url);
    toast(t('m.settings.saved'));
    meta.reload();
    refresh();
    router.back();
  };
  const reset = async () => {
    await setApiBase(null);
    setUrl(defaultBase());
    setState('idle');
    meta.reload();
  };
  return (
    <Screen title={t('m.settings.server')} testID="settings-screen">
      <Txt v="sm" color={C.ink2}>{t('m.settings.lead')}</Txt>
      <Field label={t('m.settings.address')} value={url} onChangeText={(v) => { setUrl(v); setState('idle'); }} autoCapitalize="none" autoCorrect={false}
        keyboardType="url" placeholder="http://192.168.1.10:3000" hint={t('m.settings.hint')} testID="api-url" />
      {state === 'ok' ? <Alert kind="success" text={t('m.settings.ok')} testID="api-ok" /> : null}
      {state === 'fail' ? <Alert kind="danger" text={t('m.settings.fail')} testID="api-fail" /> : null}
      <Btn title={t('m.settings.check')} kind="secondary" icon="refresh" loading={state === 'checking'} onPress={check} testID="api-check" />
      <Btn title={t('common.save')} onPress={save} testID="api-save" />
      <Btn title={t('m.settings.reset')} kind="ghost" onPress={reset} />
      <Alert kind="info" title={t('m.settings.phoneTitle')} text={t('m.settings.phoneText')} />
    </Screen>
  );
}
