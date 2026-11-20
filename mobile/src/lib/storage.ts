import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getJSON<T>(key: string): Promise<T | null> {
  try {
    let raw = await AsyncStorage.getItem(key);
    // one-time migration from the old ANAND key names
    if (raw == null && key.startsWith('finsaathi.')) raw = await AsyncStorage.getItem(key.replace('finsaathi.', 'anand.'));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
export async function setJSON(key: string, value: unknown): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: ignore */ }
}
export async function removeKey(key: string): Promise<void> {
  try { await AsyncStorage.removeItem(key); } catch { /* ignore */ }
}

const TOKEN_KEY = 'finsaathi.token';
const LEGACY_TOKEN_KEY = 'anand.token';
/** Token: expo-secure-store on native, localStorage on web. */
export async function getToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return typeof localStorage !== 'undefined' ? (localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY)) : null;
    const SecureStore = await import('expo-secure-store');
    return (await SecureStore.getItemAsync(TOKEN_KEY)) ?? (await SecureStore.getItemAsync(LEGACY_TOKEN_KEY));
  } catch { return null; }
}
export async function setToken(token: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return;
      if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
      return;
    }
    const SecureStore = await import('expo-secure-store');
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token); else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch { /* ignore */ }
}
