// Сессия токені: Android/iOS — қорғалған қойма (Keychain / Keystore), веб-тексеру нұсқасы — localStorage.
// Басқа баптаулар (тіл, қала, сервер мекенжайы) — AsyncStorage.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'qm_token';

export async function getToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string | null) {
  try {
    if (Platform.OS === 'web') {
      if (token) globalThis.localStorage?.setItem(TOKEN_KEY, token);
      else globalThis.localStorage?.removeItem(TOKEN_KEY);
      return;
    }
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* қойма қолжетімсіз — сессия тек осы іске қосуда сақталады */
  }
}
