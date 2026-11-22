import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessagesSquare } from 'lucide-react-native';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Banner } from '@/components/Banner';
import { Panel, Cluster, useLayout } from '@/components/Layout';
import { Change } from '@/components/Change';
import { api, ApiError } from '@/api/client';
import { DISCLAIMER, type AuthResponse, type Quote } from '@/api/contract';
import { isGuestUser, useApp } from '@/state/AppState';
import { useTheme } from '@/theme/ThemeProvider';
import { useT } from '@/i18n';
import { GoogleCancelled, getGoogleIdToken, googleAvailable } from '@/lib/googleSignIn';
import { radius, space } from '@/theme/tokens';

/** First screen: sign in or create an account (or Google). There is no guest mode, because saved chats and portfolios need an account. */
export default function Welcome() {
  const { lang, setLang, token, user, signIn } = useApp();
  const { colors } = useTheme();
  const { gutter } = useLayout();
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pulse, setPulse] = useState<Quote[] | null>(null);
  useEffect(() => { let off = false; api.get<{ india: Quote[] }>('/public/pulse', undefined, { retries: 1, timeoutMs: 8000 }).then((r) => { if (!off) setPulse(r.india.slice(0, 3)); }).catch(() => {}); return () => { off = true; }; }, []);
  // A real account goes straight in. An old guest session stays here and is asked to create an account.
  if (token && user && !isGuestUser(user)) return <Redirect href="/" />;

  const google = async () => {
    setErr(null); setBusy(true);
    try {
      const idToken = await getGoogleIdToken();
      const r = await api.post<AuthResponse>('/auth/google', { idToken, language: lang }, { timeoutMs: 30000 });
      signIn(r); router.replace('/');
    } catch (e) {
      if (e instanceof GoogleCancelled) return;
      setErr((e as ApiError).isNetwork ? t('err.offlineBody') : t('auth.googleFailed'));
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 520, paddingHorizontal: gutter, gap: space.xl }}>
          <Cluster gap={space.xs} style={{ justifyContent: 'flex-end' }}>
            <Chip label="हिन्दी" selected={lang === 'hi'} onPress={() => setLang('hi')} accessibilityLabel="हिन्दी (Hindi)" />
            <Chip label="English" selected={lang === 'en'} onPress={() => setLang('en')} />
          </Cluster>

          <View style={{ gap: space.sm, alignItems: 'center' }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <MessagesSquare size={34} color={colors.primary} />
            </View>
            <Text v="display" tone="primary" weight="bold" center>FinSaathi</Text>
            <Text v="h3" center>{t('gate.tag')}</Text>
            <Text v="body" tone="soft" center>{t(token ? 'gate.guestNote' : 'gate.sub')}</Text>
          </View>

          {err ? <Banner tone="error" title={err} /> : null}

          <View style={{ gap: space.md }}>
            <Button label={t('auth.loginCta')} onPress={() => router.push({ pathname: '/auth', params: { mode: 'login' } })} />
            <Button label={t('auth.createCta')} variant="secondary" onPress={() => router.push({ pathname: '/auth', params: { mode: 'register' } })} />
            {googleAvailable() ? <Button label={t('auth.google')} variant="secondary" onPress={google} loading={busy} /> : null}
          </View>

          {pulse?.length ? (
            <Panel style={{ borderRadius: radius.lg, padding: space.lg }}>
              <Text v="label" tone="soft" style={{ marginBottom: space.sm }}>{t('land.live')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xl }}>
                {pulse.map((q) => (
                  <View key={q.symbol} style={{ gap: 2 }}>
                    <Text v="small" tone="soft">{q.name}</Text>
                    <Text v="money" style={{ fontSize: 22, lineHeight: 28 }}>{q.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                    <Change pct={q.changePct} />
                  </View>
                ))}
              </View>
            </Panel>
          ) : null}
          <Text v="small" tone="soft">{DISCLAIMER[lang]}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
