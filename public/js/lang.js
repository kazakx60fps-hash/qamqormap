import { setLangValue, getLang, isLang, savedLang, t } from './i18n.js';
import { state, emit } from './state.js';
import { api } from './api.js';
import { render, captureForms } from './router.js';
import { closeAllDialogs, toast } from './ui.js';

/** Бастапқы тіл: тіркелген қолданушының баптауы → браузерде сақталған → қазақша. */
export function initialLang() {
  return (state.user?.preferred_lang && isLang(state.user.preferred_lang) && state.user.preferred_lang) || savedLang() || 'kk';
}

/** Кіргеннен кейін: базадағы баптауды қолдану немесе ағымдағы тілді базаға жазу */
export async function syncLangAfterLogin() {
  const pref = state.user?.preferred_lang;
  if (pref && isLang(pref) && pref !== getLang()) {
    setLangValue(pref);
    emit('lang', pref);
  } else if (!pref && state.user) {
    api('/auth/language', { method: 'PATCH', body: { lang: getLang() } }).then(() => { state.user.preferred_lang = getLang(); }).catch(() => {});
  }
}

/**
 * Тілді ауыстыру: қала (URL), сүзгілер (URL) және формаға енгізілген мәндер сақталады.
 * Бет қайта салынады, бірақ енгізілген деректер қайтарылады.
 */
export async function changeLanguage(lang) {
  if (!isLang(lang) || lang === getLang()) return;
  const snapshot = captureForms();
  closeAllDialogs();
  setLangValue(lang);
  emit('lang', lang);
  if (state.user) {
    try {
      await api('/auth/language', { method: 'PATCH', body: { lang } });
      state.user.preferred_lang = lang;
    } catch {
      toast(t('lang.saveFailed'), { type: 'error' });
    }
  }
  await render({ restore: snapshot, keepScroll: true });
}
