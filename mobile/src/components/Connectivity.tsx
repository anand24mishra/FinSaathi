import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { api } from '@/api/client';
import type { HealthStatus } from '@/api/contract';

type Ctx = { online: boolean; apiUp: boolean; checking: boolean; recheck: () => Promise<void>; lastOk: number | null };
const C = createContext<Ctx>({ online: true, apiUp: true, checking: false, recheck: async () => {}, lastOk: null });
export const useConnectivity = () => useContext(C);

/** Polls /v1/health and watches device connectivity so every screen can show a calm offline state. */
export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [apiUp, setApiUp] = useState(true);
  const [checking, setChecking] = useState(false);
  const [lastOk, setLastOk] = useState<number | null>(null);

  const recheck = useCallback(async () => {
    setChecking(true);
    try { await api.get<HealthStatus>('/health', undefined, { retries: 0, timeoutMs: 5000 }); setApiUp(true); setLastOk(Date.now()); }
    catch { setApiUp(false); }
    finally { setChecking(false); }
  }, []);

  useEffect(() => {
    recheck();
    const id = setInterval(recheck, apiUp ? 45000 : 8000);
    return () => clearInterval(id);
  }, [recheck, apiUp]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const up = () => { setOnline(true); recheck(); }, down = () => setOnline(false);
      setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
      window.addEventListener('online', up); window.addEventListener('offline', down);
      return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
    }
    return NetInfo.addEventListener((s) => setOnline(s.isConnected !== false));
  }, [recheck]);

  const value = useMemo(() => ({ online, apiUp, checking, recheck, lastOk }), [online, apiUp, checking, recheck, lastOk]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
