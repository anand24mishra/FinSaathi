import React, { useState } from 'react';
import { View } from 'react-native';
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
import { DISCLAIMER, type Goal, type RiskLevel, type User } from '@/api/contract';
import { clearApiCache } from '@/api/useApi';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { TEXT_SCALES } from '@/theme/type';
import { formatINR, simpleAmount } from '@/lib/format';
import { space } from '@/theme/tokens';

const GOALS: Goal[] = ['retirement', 'child_education', 'house', 'emergency', 'wealth', 'regular_income'];
const RISKS: RiskLevel[] = ['conservative', 'balanced', 'growth'];
const num = (s: string) => { const n = parseInt(s.replace(/\D/g, ''), 10); return isNaN(n) ? null : n; };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SettingsScreen() {
  const { lang, setLang, textScale, setTextScale, user, updateProfile, signOut } = useApp();
  const t = useT();
  const router = useRouter();
  const { isDesktop } = useLayout();
  const p = user?.profile;
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
    <Screen back title={t('settings.title')} subtitle={user ? `${user.name} · ${user.email}` : undefined}>
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>{display}</View><View style={{ flex: 1 }}>{profile}</View>
        </View>
      ) : (<>{display}{profile}</>)}
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
        <Button label={t('settings.logout')} icon={LogOut} variant="danger" onPress={() => { signOut(); router.replace('/welcome'); }} />
      </View>
    </Screen>
  );
}
