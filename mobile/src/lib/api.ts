// HTTP/REST клиенті: сайтпен бір API (Node.js + Express → PostgreSQL).
// Мекенжай реті: қосымшада сақталған баптау → EXPO_PUBLIC_API_URL → app.json extra.apiUrl →
// Expo Go-да Expo серверінің мекенжайы (LAN немесе tunnel, /api прокси) → веб-нұсқада беттің хосты → Android эмуляторы.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getToken, setToken } from './storage';

const API_KEY = 'qm_api_url';
const TIMEOUT_MS = 15000;

let base = '';
let token: string | null = null;
const unauthorizedListeners = new Set<() => void>();

export function normalizeBase(url: string) {
  let u = url.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `http://${u}`;
  if (u && !/:\d+$/.test(u.replace(/^https?:\/\//, '')) && /^http:\/\/\d+\.\d+\.\d+\.\d+$/.test(u)) u = `${u}:3000`;
  return u;
}

/** Expo серверінің мекенжайы (hostUri): IP болса http, tunnel домені болса https */
export function metroOrigin(hostUri?: string | null): string | null {
  if (!hostUri) return null;
  const authority = hostUri.split('/')[0];
  const host = authority.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return `http://${authority}`;
  return `https://${authority}`;
}

export function defaultBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return normalizeBase(env);
  const extra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (extra) return normalizeBase(extra);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  // Expo Go / dev build: API Expo серверінің өзі арқылы проксиленеді (metro.config.js → /api/*).
  // LAN: http://192.168.x.x:8081, tunnel: https://xxxx.exp.direct — компьютердің 3000-портын ашу қажет емес.
  const metro = metroOrigin((Constants.expoConfig as { hostUri?: string } | null)?.hostUri);
  if (metro) return metro;
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

export async function initApi() {
  try {
    const saved = await AsyncStorage.getItem(API_KEY);
    base = saved ? normalizeBase(saved) : defaultBase();
  } catch {
    base = defaultBase();
  }
  token = await getToken();
}

export const apiBase = () => base;
export const hasToken = () => !!token;
export const authHeaders = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

export async function setApiBase(url: string | null) {
  base = url ? normalizeBase(url) : defaultBase();
  try {
    if (url) await AsyncStorage.setItem(API_KEY, base);
    else await AsyncStorage.removeItem(API_KEY);
  } catch { /* */ }
}

export async function saveToken(t: string | null) {
  token = t;
  await setToken(t);
}

export function onUnauthorized(fn: () => void) {
  unauthorizedListeners.add(fn);
  return () => { unauthorizedListeners.delete(fn); };
}

export type FieldCode = { code: string; params?: Record<string, unknown> } | string;

export class ApiError extends Error {
  status: number;
  code: string;
  params: Record<string, unknown>;
  fieldCodes: Record<string, FieldCode>;
  constructor(status: number, code: string, message: string, params: Record<string, unknown> = {}, fieldCodes: Record<string, FieldCode> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.params = params;
    this.fieldCodes = fieldCodes;
  }
}

type Opts = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
  baseOverride?: string;
};

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const { method = 'GET', body, form, query, baseOverride } = opts;
  let url = `${baseOverride ?? base}/api${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Client': 'mobile', ...authHeaders() };
  let payload: BodyInit | undefined;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, signal: ctrl.signal });
  } catch {
    throw new ApiError(0, 'NETWORK', 'network');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, res.ok ? 'BAD_RESPONSE' : 'SERVER_DOWN', text.slice(0, 120));
  }
  if (!res.ok) {
    if (res.status === 401 && token) unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError(res.status, data?.code || 'UNKNOWN', data?.error || '', data?.params || {}, data?.field_codes || {});
  }
  return data as T;
}

/** Сурет жүктеу (multipart). React Native FormData файлды { uri, name, type } түрінде қабылдайды. */
export async function uploadPhoto(requestId: number, file: { uri: string; name: string; type: string; webFile?: Blob }, visibility: 'public' | 'participants') {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = file.webFile ?? (await (await fetch(file.uri)).blob());
    form.append('photo', blob as Blob, file.name);
  } else {
    form.append('photo', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  }
  form.append('visibility', visibility);
  return api(`/requests/${requestId}/attachments`, { method: 'POST', form });
}

export const attachmentUrl = (id: number) => `${base}/api/attachments/${id}`;
