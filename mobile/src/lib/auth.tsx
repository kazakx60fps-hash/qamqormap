// Аккаунт: кіру, тіркелу, демо-кіру, шығу. Сессия серверде (PostgreSQL), құрылғыда тек токен.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, hasToken, onUnauthorized, saveToken } from './api';
import type { User } from './types';
import { useI18n, type Lang } from '../i18n';

export type Summary = { my_requests: number; my_applications: number; my_tasks: number; helped: number; unread: number; my_reports: number; unread_chats: number };
type AuthResp = { user: User; token?: string };

type Auth = {
  user: User | null;
  ready: boolean;
  summary: Summary | null;
  login: (email: string, password: string) => Promise<User>;
  register: (data: Record<string, unknown>) => Promise<User>;
  demoLogin: (role: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshSummary: () => Promise<void>;
  changeLang: (l: Lang) => void;
};

const AuthCtx = createContext<Auth | null>(null);
const POLL_MS = 20000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { lang, setLang } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const langRef = useRef(lang);
  langRef.current = lang;

  const refreshSummary = useCallback(async () => {
    if (!hasToken()) { setSummary(null); return; }
    try {
      setSummary(await api<Summary>('/me/summary'));
    } catch { /* желі уақытша жоқ */ }
  }, []);

  const refresh = useCallback(async () => {
    if (!hasToken()) { setUser(null); setReady(true); return; }
    try {
      const r = await api<{ user: User | null }>('/auth/me');
      setUser(r.user);
      if (!r.user) await saveToken(null);
      else if (r.user.preferred_lang) setLang(r.user.preferred_lang);
    } catch {
      /* сервер қолжетімсіз: токен сақталады, келесі әрекетте қайта тексеріледі */
    } finally {
      setReady(true);
    }
  }, [setLang]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onUnauthorized(() => { saveToken(null); setUser(null); setSummary(null); }), []);

  // Оқылмаған хабарламалар санын жаңарту: белсенді кезде 20 секунд сайын
  useEffect(() => {
    if (!user) return;
    refreshSummary();
    const id = setInterval(() => { if (AppState.currentState === 'active') refreshSummary(); }, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshSummary(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [user, refreshSummary]);

  /** Кіргеннен кейін тіл: профильде сақталған тіл басым, болмаса қазіргі тіл профильге жазылады */
  const afterAuth = useCallback(async (r: AuthResp) => {
    if (r.token) await saveToken(r.token);
    setUser(r.user);
    if (r.user.preferred_lang) setLang(r.user.preferred_lang);
    else api('/auth/language', { method: 'PATCH', body: { lang: langRef.current } }).catch(() => {});
    return r.user;
  }, [setLang]);

  const login = useCallback(async (email: string, password: string) =>
    afterAuth(await api<AuthResp>('/auth/login', { method: 'POST', body: { email, password } })), [afterAuth]);
  const register = useCallback(async (data: Record<string, unknown>) =>
    afterAuth(await api<AuthResp>('/auth/register', { method: 'POST', body: { ...data, lang: langRef.current } })), [afterAuth]);
  const demoLogin = useCallback(async (role: string) =>
    afterAuth(await api<AuthResp>('/auth/demo-login', { method: 'POST', body: { role } })), [afterAuth]);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* */ }
    await saveToken(null);
    setUser(null);
    setSummary(null);
  }, []);

  const changeLang = useCallback((l: Lang) => {
    setLang(l);
    if (user) {
      api('/auth/language', { method: 'PATCH', body: { lang: l } }).catch(() => {});
      setUser({ ...user, preferred_lang: l });
    }
  }, [setLang, user]);

  const value = useMemo<Auth>(() => ({ user, ready, summary, login, register, demoLogin, logout, refresh, refreshSummary, changeLang }),
    [user, ready, summary, login, register, demoLogin, logout, refresh, refreshSummary, changeLang]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('AuthProvider жоқ');
  return c;
}
