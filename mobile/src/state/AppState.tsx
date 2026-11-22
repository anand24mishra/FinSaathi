import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { AuthResponse, Lang, Profile, User } from '@/api/contract';
import { api, ApiError, setAuthToken, setUnauthorizedHandler } from '@/api/client';
import { clearApiCache } from '@/api/useApi';
import { getJSON, getToken, setJSON, setToken } from '@/lib/storage';
import type { TextScale } from '@/theme/type';

type Theme = Profile['theme'];
type Prefs = { lang: Lang; textScale: TextScale; theme: Theme };
const DEFAULT_PREFS: Prefs = { lang: 'en', textScale: 1, theme: 'system' };

type Ctx = Prefs & {
  hydrated: boolean;
  token: string | null;
  user: User | null;
  draftName: string;
  setDraftName: (n: string) => void;
  setLang: (l: Lang) => void;
  setTextScale: (s: TextScale) => void;
  setTheme: (t: Theme) => void;
  signIn: (r: AuthResponse) => void;
  signOut: () => void;
  updateProfile: (p: Partial<Profile>) => Promise<void>;
  /** Re-read the account from the server (e.g. after a guest saves their account). */
  refreshUser: () => Promise<void>;
};

/** Old anonymous accounts from before sign-in became mandatory. */
export const isGuestUser = (u: User | null | undefined): boolean => !!u?.email?.endsWith('@guest.finsaathi.app');

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [token, setTok] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [draftName, setDraftName] = useState('');
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const signOut = useCallback(() => {
    setAuthToken(null); setTok(null); setUser(null); clearApiCache();
    setToken(null); setJSON('finsaathi.user', null);
  }, []);

  useEffect(() => { setUnauthorizedHandler(signOut); return () => setUnauthorizedHandler(null); }, [signOut]);

  useEffect(() => {
    (async () => {
      const saved = await getJSON<Prefs>('finsaathi.prefs');
      if (saved) setPrefs({ ...DEFAULT_PREFS, ...saved });
      const t = await getToken();
      if (t) {
        setAuthToken(t); setTok(t);
        const cachedUser = await getJSON<User>('finsaathi.user');
        if (cachedUser) setUser(cachedUser);
        try {
          const me = await api.get<User>('/me', undefined, { retries: 1, timeoutMs: 6000 });
          setUser(me); setJSON('finsaathi.user', me);
          setPrefs((p) => { const n = { lang: me.profile.language, textScale: me.profile.textScale, theme: me.profile.theme }; setJSON('finsaathi.prefs', n); return { ...p, ...n }; });
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) signOut();
        }
      }
      setHydrated(true);
    })();
  }, [signOut]);

  const patchPrefs = useCallback((p: Partial<Prefs>) => {
    const n = { ...prefsRef.current, ...p };
    setPrefs(n); setJSON('finsaathi.prefs', n);
  }, []);

  const updateProfile = useCallback(async (p: Partial<Profile>) => {
    const local: Partial<Prefs> = {};
    if (p.language) local.lang = p.language;
    if (p.textScale) local.textScale = p.textScale;
    if (p.theme) local.theme = p.theme;
    if (Object.keys(local).length) patchPrefs(local);
    setUser((u) => (u ? { ...u, profile: { ...u.profile, ...p } } : u));
    if (!getTokenSync()) return;
    const me = await api.put<User>('/me/profile', p);
    setUser(me); setJSON('finsaathi.user', me);
  }, [patchPrefs]);

  const value = useMemo<Ctx>(() => ({
    ...prefs, hydrated, token, user, draftName, setDraftName,
    setLang: (l) => { updateProfile({ language: l }).catch(() => {}); patchPrefs({ lang: l }); },
    setTextScale: (s) => { updateProfile({ textScale: s }).catch(() => {}); patchPrefs({ textScale: s }); },
    setTheme: (t) => { updateProfile({ theme: t }).catch(() => {}); patchPrefs({ theme: t }); },
    signIn: (r) => {
      setAuthToken(r.token); setTok(r.token); setUser(r.user); setToken(r.token); setJSON('finsaathi.user', r.user);
      const n = { lang: prefsRef.current.lang, textScale: r.user.profile.textScale, theme: r.user.profile.theme };
      // the language the person picked on the welcome screen wins; push it to the profile
      patchPrefs(n);
      if (r.user.profile.language !== n.lang) api.put<User>('/me/profile', { language: n.lang }).then((u) => { setUser(u); setJSON('finsaathi.user', u); }).catch(() => {});
      clearApiCache();
    },
    signOut, updateProfile,
    refreshUser: async () => { const me = await api.get<User>('/me'); setUser(me); setJSON('finsaathi.user', me); },
  }), [prefs, hydrated, token, user, draftName, updateProfile, patchPrefs, signOut]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

import { getAuthToken } from '@/api/client';
function getTokenSync() { return getAuthToken(); }
export const isWeb = Platform.OS === 'web';
