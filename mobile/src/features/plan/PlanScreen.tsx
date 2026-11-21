import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Option } from '@/components/Option';
import { Banner } from '@/components/Banner';
import { Cluster, Hairline, Panel, Row, Section, useLayout } from '@/components/Layout';
import { AllocationBar } from '@/components/Charts';
import { RichText } from '@/components/Term';
import { api, ApiError } from '@/api/client';
import type { Goal, Plan, PlanRequest, RiskLevel } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { getJSON, setJSON } from '@/lib/storage';
import { formatDateTime, formatINR, formatNumber, simpleAmount } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const GOALS: Goal[] = ['retirement', 'child_education', 'house', 'emergency', 'wealth', 'regular_income'];
const RISKS: RiskLevel[] = ['conservative', 'balanced', 'growth'];
const PICKS = [10000, 50000, 100000, 500000];
const num = (s: string) => { const n = parseInt(s.replace(/\D/g, ''), 10); return isNaN(n) ? 0 : n; };
type Saved = { plan: Plan; savedAt: number };

function Stepper({ value, onChange, min, max, label, suffix }: { value: number; onChange: (n: number) => void; min: number; max: number; label: string; suffix: string }) {
  const t = useT();
  return (
    <View style={{ gap: space.sm }}>
      <Text v="label" weight="semibold">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
        <Button label={t('plan.less')} icon={Minus} variant="secondary" fullWidth={false} onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} accessibilityLabel={t('plan.fewerYears')} />
        <Text v="h2" num accessibilityLiveRegion="polite" style={{ minWidth: 100, textAlign: 'center' }}>{value} {suffix}</Text>
        <Button label={t('plan.more')} icon={Plus} variant="secondary" fullWidth={false} onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} accessibilityLabel={t('plan.moreYears')} />
      </View>
    </View>
  );
}

function PlanResult({ plan }: { plan: Plan }) {
  const t = useT();
  const { lang } = useApp();
  return (
    <View style={{ gap: space.xl }}>
      <View style={{ gap: space.md }}>
        <Text v="h3">{t('plan.allocation')}</Text>
        <AllocationBar items={plan.allocation.map((l) => ({ key: l.assetClass, label: t(`asset.${l.assetClass}` as Key), pct: l.pct, detail: formatINR(l.amount) }))} />
        {plan.allocation.map((l) => <View key={l.assetClass} style={{ gap: 2 }}><Text v="label" weight="semibold">{t(`asset.${l.assetClass}` as Key)}</Text><RichText text={l.why} v="label" tone="soft" /></View>)}
      </View>
      <View style={{ gap: space.sm }}>
        <Text v="h3">{t('plan.instruments')}</Text>
        <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
          {plan.instruments.map((i, k) => (
            <Row key={i.name + k} title={i.name} titleLines={3} last={k === plan.instruments.length - 1} subtitle={t(`kind.${i.kind}` as Key)}
              right={<View style={{ alignItems: 'flex-end' }}><Text v="body" weight="bold" num>{formatINR(i.amount)}</Text><Text v="small" tone="soft" num>{formatNumber(i.pct, i.pct % 1 ? 1 : 0)}%</Text></View>}>
              <RichText text={i.why} v="label" tone="soft" />
              {i.pastReturn ? <Text v="small" tone="soft">{t('plan.past', { cagr: formatNumber(i.pastReturn.cagrPct, 1), years: i.pastReturn.years, source: i.pastReturn.source })}</Text> : null}
            </Row>
          ))}
        </Panel>
      </View>
      {plan.sip ? <Banner tone="info" title={t('plan.sipTitle', { amount: formatINR(plan.sip.monthly) })} body={plan.sip.note} /> : null}
      <View style={{ gap: space.sm }}>
        <Text v="h3">{t('plan.steps')}</Text>
        {plan.stepsToStart.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.md }}>
            <Text v="body" weight="bold" tone="primary" num style={{ minWidth: 24 }}>{i + 1}.</Text>
            <View style={{ flex: 1 }}><RichText text={s} v="body" /></View>
          </View>
        ))}
      </View>
      <View style={{ gap: space.sm }}>
        <Text v="h3">{t('plan.emergency')}</Text>
        <RichText text={plan.emergencyFundNote} v="body" />
      </View>
      <View style={{ gap: space.sm }}>
        <Text v="h3">{t('plan.risks')}</Text>
        {plan.risks.map((r, i) => <View key={i} style={{ flexDirection: 'row', gap: space.md }}><Text v="body" tone="soft">•</Text><View style={{ flex: 1 }}><RichText text={r} v="body" /></View></View>)}
      </View>
      <View style={{ gap: space.sm }}>
        <Text v="h3">{t('plan.rebalance')}</Text>
        <RichText text={plan.rebalanceRule} v="body" />
      </View>
      <Text v="small" tone="soft">{t('plan.madeAt', { when: formatDateTime(plan.asOf, lang) })} {plan.disclaimer}</Text>
    </View>
  );
}

export function PlanScreen() {
  const { user, lang } = useApp();
  const t = useT();
  const { isDesktop } = useLayout();
  const { colors } = useTheme();
  const p = user?.profile;
  const [capital, setCapital] = useState(String(p?.capital ?? 50000));
  const [sip, setSip] = useState(String(p?.monthlyBudget ?? ''));
  const [risk, setRisk] = useState<RiskLevel>(p?.riskLevel ?? 'balanced');
  const [years, setYears] = useState(p?.horizonYears ?? 5);
  const [goal, setGoal] = useState<Goal>(p?.goals?.[0] ?? 'wealth');
  const [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { getJSON<Saved>('finsaathi.plan').then((s) => { if (s) { setSaved(s); const r = s.plan.request; setCapital(String(r.capital)); setSip(r.monthlySip ? String(r.monthlySip) : ''); setRisk(r.riskLevel); setYears(r.horizonYears); setGoal(r.goal); } }); }, []);

  const c = num(capital);
  const build = async () => {
    if (c < 1000) { setErr(t('plan.errCapital')); return; }
    setBusy(true); setErr(null);
    const body: PlanRequest = { capital: c, riskLevel: risk, horizonYears: years, goal, ...(num(sip) > 0 ? { monthlySip: num(sip) } : {}) };
    try {
      const plan = await api.post<Plan>('/planner', body, { timeoutMs: 30000 });
      const s = { plan, savedAt: Date.now() };
      setSaved(s); setJSON('finsaathi.plan', s);
    } catch (e) { setErr(e instanceof ApiError ? (e.isNetwork ? t('err.offlineBody') : e.message) : t('err.generic')); } finally { setBusy(false); }
  };

  const form = (
    <View style={{ gap: space.xl }}>
      <View style={{ gap: space.md }}>
        <Text v="h3">{t('plan.capital')}</Text>
        <Cluster>{PICKS.map((x) => <Chip key={x} label={formatINR(x)} selected={c === x} onPress={() => setCapital(String(x))} />)}</Cluster>
        <Field label={t('plan.capitalOther')} value={capital} onChangeText={setCapital} prefix="₹" keyboardType="number-pad" hint={simpleAmount(c, lang) ?? undefined} />
        <Field label={t('plan.sip')} value={sip} onChangeText={setSip} prefix="₹" keyboardType="number-pad" hint={t('plan.sipHint')} />
      </View>
      <View style={{ gap: space.md }}>
        <Text v="h3">{t('plan.risk')}</Text>
        {RISKS.map((r) => <Option key={r} selected={risk === r} onPress={() => setRisk(r)} title={t(`risklabel.${r}` as Key)} body={t(`risk.${r}.plain` as Key)} />)}
      </View>
      <Stepper value={years} onChange={setYears} min={1} max={30} label={t('plan.horizon')} suffix={t('plan.years')} />
      <View style={{ gap: space.md }}>
        <Text v="h3">{t('plan.goal')}</Text>
        <Cluster>{GOALS.map((g) => <Chip key={g} label={t(`goal.${g}` as Key)} selected={goal === g} onPress={() => setGoal(g)} />)}</Cluster>
      </View>
      {err ? <Banner tone="error" title={err} /> : null}
      <Button label={saved ? t('plan.rebuild') : t('plan.build')} onPress={build} loading={busy} />
    </View>
  );

  const result = saved ? (
    <View style={{ gap: space.md }}>
      <Text v="h2">{t('plan.yourPlan')}</Text>
      <Text v="label" tone="soft">{t('plan.saved', { when: formatDateTime(saved.savedAt, lang) })}</Text>
      <PlanResult plan={saved.plan} />
    </View>
  ) : (
    <Panel><Text v="h3">{t('plan.emptyTitle')}</Text><Text v="body" tone="soft" style={{ marginTop: 4 }}>{t('plan.emptyBody')}</Text></Panel>
  );

  return (
    <Screen title={t('tab.plan')} subtitle={t('plan.subtitle')}>
      <Section style={{ marginTop: space.xl }}>
        {isDesktop ? (
          <View style={{ flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start' }}>
            <View style={{ flex: 2 }}>{form}</View>
            <View style={{ flex: 3, borderLeftWidth: 1, borderLeftColor: colors.line, paddingLeft: space.xxl }}>{result}</View>
          </View>
        ) : (<>{form}<Hairline style={{ marginVertical: space.xxl }} />{result}</>)}
      </Section>
    </Screen>
  );
}
