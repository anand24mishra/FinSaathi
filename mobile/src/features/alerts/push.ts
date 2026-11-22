import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api, withLang } from '@/api/client';
import type { Alert } from '@/api/contract';
import { getJSON, setJSON } from '@/lib/storage';
import { useApp } from '@/state/AppState';

/** Native only: ask for permission and register the Expo push token. Graceful no-op on web and simulators. */
export function usePushRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    (async () => {
      try {
        const Device = await import('expo-device');
        if (!Device.isDevice) return;
        const Notifications = await import('expo-notifications');
        const { status: existing } = await Notifications.getPermissionsAsync();
        const status = existing === 'granted' ? existing : (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted') return;
        const tok = await Notifications.getExpoPushTokenAsync();
        await api.post('/me/push-token', { token: tok.data, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
      } catch { /* push is optional */ }
    })();
  }, [enabled]);
}

type WebPerm = 'unsupported' | 'default' | 'granted' | 'denied';
export const webNotifyState = (): WebPerm => (Platform.OS === 'web' && typeof Notification !== 'undefined' ? (Notification.permission as WebPerm) : 'unsupported');
/** Must be called from a tap/click (browsers require a user gesture). */
export async function requestWebNotifications(): Promise<WebPerm> {
  if (webNotifyState() === 'unsupported') return 'unsupported';
  try { return (await Notification.requestPermission()) as WebPerm; } catch { return webNotifyState(); }
}

/** Show a notification for a new important alert: the browser Notification API on web, a local notification on phones. */
export async function notifyLocal(title: string, body: string) {
  if (Platform.OS === 'web') {
    try { if (webNotifyState() === 'granted') new Notification(title, { body: body.slice(0, 180), tag: title }); } catch { /* ignore */ }
    return;
  }
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch { /* ignore */ }
}

/** Polls alerts every 2 minutes; the first poll only records what already exists, later new watch/important alerts are notified. */
export function useAlertNotifier(enabled: boolean) {
  const { lang } = useApp();
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    const tick = async () => {
      try {
        const list = await api.get<Alert[]>(withLang('/alerts', lang), undefined, { retries: 0, timeoutMs: 8000 });
        const seen = new Set((await getJSON<string[]>('finsaathi.seenAlerts')) ?? []);
        const first = seen.size === 0 && (await getJSON<string[]>('finsaathi.seenAlerts')) == null;
        const fresh = list.filter((a) => !seen.has(a.id));
        if (!off && !first) for (const a of fresh.filter((x) => !x.read && x.severity !== 'info').slice(0, 3)) await notifyLocal(a.title, a.body);
        if (fresh.length || first) await setJSON('finsaathi.seenAlerts', list.map((a) => a.id).slice(0, 200));
      } catch { /* offline: try again next tick */ }
    };
    tick();
    const id = setInterval(tick, 120_000);
    return () => { off = true; clearInterval(id); };
  }, [enabled, lang]);
}
