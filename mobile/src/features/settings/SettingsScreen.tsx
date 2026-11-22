import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BookOpen, LogOut } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Option } from '@/components/Option';
import { Banner } from '@/components/Banner';
import { Cluster, Panel, Section, Row, useLayout } from '@/components/Layout';
import { api, API_BASE, ApiError } from '@/api/client';
import { DISCLAIMER, type Goal, type RiskLevel, type TelegramStatus, type User } from '@/api/contract';
import { clearApiCache, useApi } from '@/api/useApi';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { TEXT_SCALES } from '@/theme/type';
import { formatINR, simpleAmount } from '@/lib/format';
import { space } from '@/theme/tokens';

const GOALS: Goal[] = ['retirement', 'child_education', 'house', 'emergency', 'wealth', 'regular_income'];
const RISKS: RiskLevel[] = ['conservative', 'balanced', 'growth'];
const num = (s: string) => { const n = parseInt(s.replace(/\D/g, ''), 10); return isNaN(n) ? null : n; };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GUEST_SUFFIX = '@guest.finsaathi.app';

/** Connect a Telegram chat so alerts and the daily analyst note arrive there. The server never reads the user's chats. */
function TelegramCard() {
  const t = useT();
  const q = useApi<TelegramStatus>('/me/telegram', { fresh: 0 });
  const [busy, setBusy] = useState(false); const [pending, setPending] = useState(false); const [err, setErr] = useState<string | null>(null);
  const st = q.data;
  const run = async (fn: () => Promise<TelegramStatus>) => { setBusy(true); setErr(null); try { await fn(); clearApiCache(); await q.refetch(); } catch (e) { setErr((e as ApiError).isNetwork ? t('err.offlineBody') : (e as Error).message); } finally { setBusy(false); } };
  const connect = () => run(async () => { const r = await api.post<TelegramStatus>('/me/telegram/link', {}); if (r.linkUrl) { setPending(true); Linking.openURL(r.linkUrl).catch(() => {}); } return r; });
  return (
    <Panel style={{ gap: space.md }}>
      <Text v="h3">{t('tg.title')}</Text>
      <Text v="body" tone="soft">{t('tg.body')}</Text>
      {err ? <Banner tone="error" title={err} /> : null}
      {!st ? null : !st.configured ? <Text v="small" tone="soft">{t('tg.notConfigured')}</Text> : st.linked ? (<>
        <Banner tone="info" title={t('tg.linked')} />
        <Button label={t('tg.disconnect')} variant="secondary" loading={busy} onPress={() => run(() => api.del<TelegramStatus>('/me/telegram'))} />
      </>) : (<>
        {pending ? <Text v="small" tone="soft">{t('tg.pending')}</Text> : null}
        <Button label={pending ? t('tg.open') : t('tg.connect')} loading={busy} onPress={connect} />
        {pending ? <Button label={t('tg.refresh')} variant="secondary" onPress={() => run(async () => (await q.refetch()) as never)} /> : null}
      </>)}
    </Panel>
  );
}

/** Shown to guest accounts: add a name, email and password so the data is not tied to this browser. */
function SaveAccount() {
  const { refreshUser } = useApp();
  const t = useT();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const [errs, setErrs] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const submit = async () => {
    const e: typeof errs = {};
    if (!name.trim()) e.name = t('auth.errName');
    if (!EMAIL.test(email.trim())) e.email = t('auth.errEmail');
    if (password.length < 8) e.password = t('auth.errPasswordShort');
    setErrs(e); if (Object.keys(e).length) return;
    setBusy(true);
    try { await api.post<User>('/me/claim', { name: name.trim(), email: email.trim().toLowerCase(), password }, { timeoutMs: 20000 }); await refreshUser(); setDone(true); }
    catch (err) { const a = err as ApiError; setErrs({ form: a.isNetwork ? t('err.offlineBody') : a.status === 409 ? t('auth.errExists') : a.message }); }
    finally { setBusy(false); }
  };
  if (done) return <Banner tone="info" title={t('acct.saved')} />;
  return (
    <Panel style={{ gap: space.md }}>
      <Text v="h3">{t('acct.saveTitle')}</Text>
      <Text v="body" tone="soft">{t('acct.saveBody')}</Text>
      {errs.form ? <Banner tone="error" title={errs.form} /> : null}
      <Field label={t('welcome.yourName')} value={name} onChangeText={setName} error={errs.name} autoComplete="name" />
      <Field label={t('auth.email')} value={email} onChangeText={setEmail} error={errs.email} keyboardType="email-address" autoComplete="email" />
      <Field label={t('auth.password')} value={password} onChangeText={setPassword} error={errs.password} secure autoComplete="password-new" />
      <Button label={t('acct.save')} onPress={submit} loading={busy} />
    </Panel>
  );
}

export function SettingsScreen() {
  const { lang, setLang, textScale, setTextScale, theme, setTheme, user, updateProfile, signOut } = useApp();
  const t = useT();
  const router = useRouter();
  const { isDesktop } = useLayout();
  const p = user?.profile;
  const isGuest = !!user?.email.endsWith(GUEST_SUFFIX);
  const [risk, setRisk] = useState<RiskLevel>(p?.riskLevel ?? 'balanced');
  const [capital, setCapital] = useState(p?.capital != null ? String(p.capital) : '');
  const [sip, setSip] = useState(p?.monthlyBudget != null ? String(p.monthlyBudget) : '');
  const [goals, setGoals] = useState<Goal[]>(p?.goals ?? []);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const save = async () => {
    setSaving(true); setMsg(null);
    try { await updateProfile({ riskLevel: risk, capital: num(capital), monthlyBudget: num(sip), goals }); setMsg({ tone: 'info', text: t('settings.saved') }); }
    catch { setMsg({ tone: 'error', text: t('err.offlineBody') }); } finally { setSaving(false); }
  };

  const display = (
    <>
      <Section title={t('settings.language')} style={{ marginTop: space.xl }}>
        <Cluster><Chip label="हिन्दी" selected={lang === 'hi'} onPress={() => setLang('hi')} /><Chip label="English" selected={lang === 'en'} onPress={() => setLang('en')} /></Cluster>
      </Section>
      <Section title={t('settings.textSize')}>
        <Cluster>{TEXT_SCALES.map((s, i) => <Chip key={s} label={[t('size.normal'), t('size.large'), t('size.larger')][i]} selected={textScale === s} onPress={() => setTextScale(s)} />)}</Cluster>
        <Panel style={{ marginTop: space.md }}>
          <Text v="small" tone="soft">{t('settings.preview')}</Text>
          <Text v="h3">{t('settings.previewHead')}</Text>
          <Text v="body">{t('settings.previewBody')}</Text>
          <Text v="money" num>{formatINR(125000)}</Text>
        </Panel>
      </Section>
      <Section title={t('settings.theme')}>
        <Cluster>{(['system', 'light', 'dark'] as const).map((x) => <Chip key={x} label={t(`theme.${x}` as Key)} selected={theme === x} onPress={() => setTheme(x)} />)}</Cluster>
      </Section>
      <Section title={t('settings.learn')}>
        <Button label={t('learn.title')} icon={BookOpen} variant="secondary" onPress={() => router.push('/learn')} />
      </Section>
    </>
  );
  const profile = (
    <>
      <Section title={t('settings.risk')} style={{ marginTop: isDesktop ? space.xl : space.xxl }}>
        <View style={{ gap: space.md }}>{RISKS.map((r) => <Option key={r} selected={risk === r} onPress={() => setRisk(r)} title={t(`risklabel.${r}` as Key)} body={t(`risk.${r}.plain` as Key)} />)}</View>
      </Section>
      <Section title={t('settings.money')}>
        <View style={{ gap: space.md }}>
          <Field label={t('settings.capital')} value={capital} onChangeText={setCapital} prefix="₹" keyboardType="number-pad" hint={capital && num(capital) ? simpleAmount(num(capital)!, lang) ?? undefined : undefined} />
          <Field label={t('setup.sip')} value={sip} onChangeText={setSip} prefix="₹" keyboardType="number-pad" />
        </View>
      </Section>
      <Section title={t('settings.goals')}>
        <Cluster>{GOALS.map((g) => <Chip key={g} label={t(`goal.${g}` as Key)} selected={goals.includes(g)} onPress={() => setGoals((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g]))} />)}</Cluster>
      </Section>
      <View style={{ marginTop: space.xl, gap: space.md }}>
        {msg ? <Banner tone={msg.tone} title={msg.text} /> : null}
        <Button label={t('settings.save')} onPress={save} loading={saving} />
      </View>
    </>
  );
  return (
    <Screen back title={t('settings.title')} subtitle={user ? (isGuest ? t('acct.guest') : `${user.name} · ${user.email}`) : undefined}>
      {isGuest ? <View style={{ marginTop: space.lg }}><SaveAccount /></View> : null}
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>{display}</View><View style={{ flex: 1 }}>{profile}</View>
        </View>
      ) : (<>{display}{profile}</>)}
      <View style={{ marginTop: space.xl }}><TelegramCard /></View>
      <Section title={t('about.title')}>
        <Panel style={{ gap: space.md }}>
          <Text v="body" weight="semibold">{t('about.is')}</Text>
          <Text v="body">{t('about.isBody')}</Text>
          <Text v="body" weight="semibold">{t('about.isnt')}</Text>
          <Text v="body">{t('about.isntBody')}</Text>
          <Text v="label" tone="soft">{t('about.local')}</Text>
        </Panel>
        <View style={{ marginTop: space.md }}><Text v="label" tone="soft">{DISCLAIMER[lang]}</Text></View>
        <Row title={t('about.server')} subtitle={API_BASE} last />
      </Section>
      <View style={{ marginTop: space.xl, gap: space.md }}>
        {isGuest ? <Banner tone="caution" title={t('acct.logoutWarn')} /> : null}
        <Button label={t('settings.logout')} icon={LogOut} variant="danger" onPress={() => { signOut(); router.replace('/welcome'); }} />
      </View>
    </Screen>
  );
}
