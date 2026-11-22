import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop, Circle } from 'react-native-svg';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeInUp, FadeOutUp, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { Mic, ShieldCheck, TrendingUp } from 'lucide-react-native';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Banner } from '@/components/Banner';
import { Cluster } from '@/components/Layout';
import { api, ApiError } from '@/api/client';
import type { AuthResponse, Quote } from '@/api/contract';
import { isGuestUser, useApp } from '@/state/AppState';
import { useTheme } from '@/theme/ThemeProvider';
import { useT } from '@/i18n';
import { GoogleCancelled, getGoogleIdToken, googleAvailable } from '@/lib/googleSignIn';
import { radius, space } from '@/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const COPY = {
  en: { head: 'Invest with confidence', phrases: ['Ask by voice', 'Check every tip first', "Understand today's market", 'Know every IPO'], voice: 'Speak in Hindi, Hinglish or English', tip: 'Tip check' },
  hi: { head: 'भरोसे से निवेश करें', phrases: ['बोलकर पूछिए', 'हर सलाह पहले परखिए', 'आज का बाज़ार समझिए', 'हर IPO की जानकारी'], voice: 'हिन्दी, हिंग्लिश या अंग्रेज़ी में बोलिए', tip: 'सलाह की जाँच' },
} as const;

/** Soft blurred-looking circle drifting slowly; gives the background life without distracting. */
function Orb({ size, color, x, y, dx, dy, ms }: { size: number; color: string; x: number; y: number; dx: number; dy: number; ms: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => { if (!reduce) p.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), -1, true); }, [p, ms, reduce]);
  const s = useAnimatedStyle(() => ({ transform: [{ translateX: dx * p.value }, { translateY: dy * p.value }, { scale: 1 + 0.08 * p.value }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, s]} />;
}

/** A rising price line that draws itself, then keeps a dot pulsing at the tip. */
function DrawingChart({ color, soft }: { color: string; soft: string }) {
  const reduce = useReducedMotion();
  const draw = useSharedValue(reduce ? 0 : 420);
  const fade = useSharedValue(reduce ? 1 : 0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    draw.value = withDelay(500, withTiming(0, { duration: 2200, easing: Easing.out(Easing.cubic) }));
    fade.value = withDelay(1800, withTiming(1, { duration: 900 }));
    pulse.value = withDelay(2600, withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [draw, fade, pulse, reduce]);
  const line = useAnimatedProps(() => ({ strokeDashoffset: draw.value }));
  const area = useAnimatedProps(() => ({ opacity: fade.value }));
  const dot = useAnimatedProps(() => ({ opacity: fade.value }));
  const ring = useAnimatedProps(() => ({ opacity: fade.value * (0.55 - 0.4 * pulse.value) }));
  const D = 'M0,104 C26,100 40,78 70,82 S112,58 140,62 S190,30 220,38 S268,14 300,8';
  return (
    <Svg width="100%" height={132} viewBox="0 0 300 132" preserveAspectRatio="none">
      <Defs>
        <SvgGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.28} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <AnimatedPath d={`${D} L300,132 L0,132 Z`} fill="url(#fill)" animatedProps={area} />
      <AnimatedPath d={D} stroke={color} strokeWidth={3.5} strokeLinecap="round" fill="none" strokeDasharray={[420, 420]} animatedProps={line} />
      <AnimatedCircle cx={296} cy={9} r={11} fill={soft} animatedProps={ring} />
      <AnimatedCircle cx={296} cy={9} r={6} fill={color} animatedProps={dot} />
    </Svg>
  );
}

/** Five bars bouncing like a voice meter. */
function Wave({ color }: { color: string }) {
  const reduce = useReducedMotion();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 24 }}>
      {[0.5, 0.9, 0.6, 1, 0.7].map((h, i) => <Bar key={i} i={i} h={h} color={color} reduce={reduce} />)}
    </View>
  );
}
function Bar({ i, h, color, reduce }: { i: number; h: number; color: string; reduce: boolean }) {
  const s = useSharedValue(0.35);
  useEffect(() => { if (!reduce) s.value = withDelay(i * 120, withRepeat(withSequence(withTiming(h, { duration: 380 }), withTiming(0.25, { duration: 380 })), -1)); else s.value = h; }, [s, i, h, reduce]);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleY: s.value }] }));
  return <Animated.View style={[{ width: 4, height: 24, borderRadius: 2, backgroundColor: color }, st]} />;
}

/** Floats gently up and down, offset per card. */
function Float({ children, delay = 0, amp = 6, ms = 2600 }: { children: React.ReactNode; delay?: number; amp?: number; ms?: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => { if (!reduce) p.value = withDelay(delay, withRepeat(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), -1, true)); }, [p, delay, ms, reduce]);
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: -amp * p.value }] }));
  return <Animated.View style={s}>{children}</Animated.View>;
}

/** The first screen: a short, alive pitch, then sign in or create an account. There is no guest mode. */
export default function Welcome() {
  const { lang, setLang, token, user, signIn } = useApp();
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const c = COPY[lang];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pulse, setPulse] = useState<Quote[] | null>(null);
  const [i, setI] = useState(0);
  useEffect(() => { let off = false; api.get<{ india: Quote[] }>('/public/pulse', undefined, { retries: 1, timeoutMs: 8000 }).then((r) => { if (!off) setPulse(r.india.slice(0, 2)); }).catch(() => {}); return () => { off = true; }; }, []);
  useEffect(() => { const id = setInterval(() => setI((n) => (n + 1) % c.phrases.length), 2400); return () => clearInterval(id); }, [c.phrases.length]);
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
  const nifty = pulse?.[0];

  return (
    <LinearGradient colors={['#DDF4EA', '#F1F9F5', '#FFFFFF']} locations={[0, 0.5, 1]} style={{ flex: 1 }}>
      <Orb size={280} color="rgba(11,122,91,0.14)" x={-90} y={-60} dx={40} dy={50} ms={7000} />
      <Orb size={200} color="rgba(52,211,160,0.20)" x={220} y={180} dx={-50} dy={40} ms={9000} />
      <Orb size={160} color="rgba(161,98,7,0.10)" x={-40} y={520} dx={60} dy={-30} ms={8000} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flex: 1, width: '100%', maxWidth: 480, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.xl, justifyContent: 'space-between', gap: space.xl }}>
            <Animated.View entering={FadeIn.duration(600)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><TrendingUp size={22} color={colors.onPrimary} strokeWidth={2.5} /></View>
                <Text v="h3" tone="primary" weight="bold">FinSaathi</Text>
              </View>
              <Cluster gap={space.xs}>
                <Chip label="हिन्दी" selected={lang === 'hi'} onPress={() => setLang('hi')} accessibilityLabel="हिन्दी (Hindi)" />
                <Chip label="English" selected={lang === 'en'} onPress={() => setLang('en')} />
              </Cluster>
            </Animated.View>

            <View style={{ gap: space.lg }}>
              <Animated.View entering={FadeInDown.delay(150).duration(700)} style={{ gap: space.sm }}>
                <Text v="display" weight="bold" style={{ fontSize: 38, lineHeight: 44 }}>{c.head}</Text>
                <View style={{ height: 34, overflow: 'hidden', justifyContent: 'center' }} accessibilityLiveRegion="polite">
                  <Animated.View key={`${lang}-${i}`} entering={FadeInDown.duration(450)} exiting={FadeOutUp.duration(300)}>
                    <Text v="h2" tone="primary" weight="semibold">{c.phrases[i]}</Text>
                  </Animated.View>
                </View>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(350).duration(800)} style={{ backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.sm, overflow: 'hidden' }}>
                {nifty ? (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <Text v="label" tone="soft" weight="semibold">{nifty.name}</Text>
                    <Text v="label" weight="bold" tone={nifty.changePct >= 0 ? 'gain' : 'loss'}>{nifty.changePct >= 0 ? '▲' : '▼'} {Math.abs(nifty.changePct).toFixed(2)}%</Text>
                  </View>
                ) : null}
                <DrawingChart color={colors.primary} soft="rgba(11,122,91,0.6)" />
              </Animated.View>

              <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
                <Animated.View entering={FadeInUp.delay(900).duration(600)} style={{ flex: 1.3 }}>
                  <Float amp={5} ms={2800}>
                    <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space.md, gap: space.sm, minHeight: 92 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Mic size={18} color={colors.primary} /></View>
                        <Wave color={colors.primary} />
                      </View>
                      <Text v="small" tone="soft">{c.voice}</Text>
                    </View>
                  </Float>
                </Animated.View>
                <Animated.View entering={FadeInUp.delay(1100).duration(600)} style={{ flex: 1 }}>
                  <Float amp={7} delay={500} ms={3200}>
                    <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space.md, gap: space.sm, minHeight: 92 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cautionBg, alignItems: 'center', justifyContent: 'center' }}><ShieldCheck size={18} color={colors.caution} /></View>
                      <Text v="small" weight="semibold">{c.tip}</Text>
                    </View>
                  </Float>
                </Animated.View>
              </View>
            </View>

            <Animated.View entering={FadeInUp.delay(700).duration(700)} style={{ gap: space.md }}>
              {err ? <Banner tone="error" title={err} /> : null}
              <Button label={t('auth.createCta')} onPress={() => router.push({ pathname: '/auth', params: { mode: 'register' } })} />
              <Button label={t('auth.loginCta')} variant="secondary" onPress={() => router.push({ pathname: '/auth', params: { mode: 'login' } })} />
              {googleAvailable() ? <Button label={t('auth.google')} variant="ghost" onPress={google} loading={busy} /> : null}
              {token ? <Text v="small" tone="soft" center>{t('gate.guestNote')}</Text> : null}
              <Text v="small" tone="soft" center>{t('gate.legal')}</Text>
            </Animated.View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
