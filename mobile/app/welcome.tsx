import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart3, Compass, ShieldCheck, Sprout, TrendingUp } from 'lucide-react-native';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Banner } from '@/components/Banner';
import { Panel, Cluster, useLayout } from '@/components/Layout';
import { Change } from '@/components/Change';
import { api, ApiError } from '@/api/client';
import { DISCLAIMER, type AuthResponse, type Quote } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useTheme } from '@/theme/ThemeProvider';
import { useT, type Key } from '@/i18n';
import { MAX_WIDTH, radius, space } from '@/theme/tokens';

/** Landing page. "Start" creates an anonymous account and opens today's calls: no questions, no form. */
export default function Welcome() {
  const { lang, setLang, token, signIn } = useApp();
  const { colors } = useTheme();
  const { isWide, isDesktop, gutter } = useLayout();
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pulse, setPulse] = useState<Quote[] | null>(null);
  useEffect(() => { let off = false; api.get<{ india: Quote[] }>('/public/pulse', undefined, { retries: 1, timeoutMs: 8000 }).then((r) => { if (!off) setPulse(r.india.slice(0, 3)); }).catch(() => {}); return () => { off = true; }; }, []);
  if (token) return <Redirect href="/" />;

  const start = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.post<AuthResponse>('/auth/guest', { language: lang }, { timeoutMs: 20000 }); signIn(r); router.replace('/'); }
    catch (e) { setErr((e as ApiError).isNetwork ? t('err.offlineBody') : t('err.apiDown')); }
    finally { setBusy(false); }
  };
  const bigNum = isDesktop ? 72 : isWide ? 56 : 40;
  const Step = ({ n, icon: Icon, k }: { n: number; icon: typeof Compass; k: 'land.how1' | 'land.how2' | 'land.how3' }) => (
    <Panel style={{ flex: isWide ? 1 : undefined, gap: space.sm, borderRadius: radius.lg, padding: space.xl }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon size={22} color={colors.primary} /></View>
      <Text v="label" tone="soft">{String(n).padStart(2, '0')}</Text>
      <Text v="h3">{t(`${k}.t` as Key)}</Text>
      <Text v="body" tone="soft">{t(`${k}.b` as Key)}</Text>
    </Panel>
  );
  const Lens = ({ icon: Icon, k }: { icon: typeof Compass; k: 'buffett' | 'jj' | 'tech' }) => (
    <View style={{ flex: isWide ? 1 : undefined, gap: space.sm }}>
      <Icon size={26} color={colors.primary} />
      <Text v="h3">{t(`land.lens.${k}` as Key)}</Text>
      <Text v="body" tone="soft">{t(`land.lens.${k}B` as Key)}</Text>
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: space.xxxl }}>
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, paddingHorizontal: gutter, gap: space.xxl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', paddingTop: space.lg, gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
              <Text v="h2" tone="primary" weight="bold">FinSaathi</Text>
              <Text v="small" tone="soft">फ़िनसाथी</Text>
            </View>
            <Cluster gap={space.xs} style={{ alignItems: 'center' }}>
              <Chip label="हिन्दी" selected={lang === 'hi'} onPress={() => setLang('hi')} accessibilityLabel="हिन्दी (Hindi)" />
              <Chip label="English" selected={lang === 'en'} onPress={() => setLang('en')} />
              <Button label={t('land.signIn')} variant="ghost" fullWidth={false} compact onPress={() => router.push({ pathname: '/auth', params: { mode: 'login' } })} />
            </Cluster>
          </View>

          <View style={{ gap: space.lg, paddingTop: isWide ? space.xxl : space.md }}>
            <Text v="label" tone="primary" weight="bold" style={{ letterSpacing: 1.4 }}>{t('land.kicker').toUpperCase()}</Text>
            <Text v="display" style={{ fontSize: bigNum, lineHeight: bigNum * 1.08, maxWidth: 900 }}>
              {t('land.h1a')} <Text v="bodyLg" weight="bold" tone="primary" style={{ fontSize: bigNum, lineHeight: bigNum * 1.08 }}>{t('land.h1b')}</Text>
            </Text>
            <Text v="bodyLg" tone="soft" style={{ maxWidth: 620 }}>{t('land.sub')}</Text>
            {err ? <Banner tone="error" title={err} /> : null}
            <View style={{ flexDirection: isWide ? 'row' : 'column', alignItems: isWide ? 'center' : 'stretch', gap: space.md }}>
              <Button label={busy ? t('land.ctaBusy') : t('land.cta')} onPress={start} loading={busy} fullWidth={!isWide} icon={TrendingUp} style={isWide ? { minWidth: 300 } : undefined} />
              <Text v="small" tone="soft">{t('land.ctaNote')}</Text>
            </View>
            {pulse?.length ? (
              <Panel style={{ alignSelf: isWide ? 'flex-start' : 'stretch', borderRadius: radius.lg, padding: space.xl }}>
                <Text v="label" tone="soft" style={{ marginBottom: space.sm }}>{t('land.live')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xl }}>
                  {pulse.map((q) => (
                    <View key={q.symbol} style={{ gap: 2 }}>
                      <Text v="small" tone="soft">{q.name}</Text>
                      <Text v="money" style={{ fontSize: 26, lineHeight: 32 }}>{q.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                      <Change pct={q.changePct} />
                    </View>
                  ))}
                </View>
              </Panel>
            ) : null}
          </View>

          <View style={{ gap: space.lg }}>
            <Text v="h1">{t('land.how.title')}</Text>
            <View style={{ flexDirection: isWide ? 'row' : 'column', gap: space.lg }}>
              <Step n={1} icon={Compass} k="land.how1" /><Step n={2} icon={BarChart3} k="land.how2" /><Step n={3} icon={Sprout} k="land.how3" />
            </View>
          </View>

          <Panel style={{ gap: space.xl, borderRadius: radius.lg, padding: space.xxl, backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
            <Text v="h1">{t('land.lens.title')}</Text>
            <View style={{ flexDirection: isWide ? 'row' : 'column', gap: space.xl }}>
              <Lens icon={ShieldCheck} k="buffett" /><Lens icon={Sprout} k="jj" /><Lens icon={TrendingUp} k="tech" />
            </View>
          </Panel>

          <View style={{ gap: space.sm, alignItems: isWide ? 'center' : 'flex-start' }}>
            <Text v="h2" center={isWide}>{t('land.trust.title')}</Text>
            <Text v="body" tone="soft" center={isWide} style={{ maxWidth: 640 }}>{t('land.trust.body')}</Text>
            <Button label={t('land.cta')} onPress={start} loading={busy} fullWidth={!isWide} style={isWide ? { minWidth: 300, marginTop: space.md } : { marginTop: space.md }} />
          </View>
          <Text v="small" tone="soft">{DISCLAIMER[lang]}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
