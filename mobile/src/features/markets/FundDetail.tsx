import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Banner } from '@/components/Banner';
import { Panel, Row, Section, Cluster, useLayout } from '@/components/Layout';
import { Async } from '@/components/Async';
import { SkeletonBlock } from '@/components/Skeleton';
import { Change } from '@/components/Change';
import { LineChart } from '@/components/Charts';
import { useApi } from '@/api/useApi';
import { api, ApiError } from '@/api/client';
import type { FundDetail as FundT, SipSimulation } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT } from '@/i18n';
import { formatDate, formatINR, formatNumber, formatPct, simpleAmount } from '@/lib/format';
import { AsOfLine } from '../shared';
import { AddHoldingSheet } from '../portfolio/AddHolding';
import { space } from '@/theme/tokens';

const YEARS = [1, 3, 5, 10];
const SIPS = [500, 1000, 5000, 10000];
type R = '1y' | '3y' | '5y' | 'max';

export function SipCalculator({ schemeCode }: { schemeCode: number }) {
  const t = useT();
  const { lang } = useApp();
  const [monthly, setMonthly] = useState('5000');
  const [years, setYears] = useState(5);
  const [res, setRes] = useState<SipSimulation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const m = parseInt(monthly.replace(/\D/g, ''), 10) || 0;
  const run = async () => {
    if (m < 100) { setErr(t('sip.errMin')); return; }
    setBusy(true); setErr(null);
    try { setRes(await api.post<SipSimulation>('/funds/sip-sim', { schemeCode, monthly: m, years })); }
    catch (e) { setRes(null); setErr(e instanceof ApiError ? (e.isNetwork ? t('err.offlineBody') : e.message) : t('err.generic')); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: space.md }}>
      <Text v="body" tone="soft">{t('sip.intro')}</Text>
      <Cluster>{SIPS.map((s) => <Chip key={s} label={formatINR(s)} selected={m === s} onPress={() => setMonthly(String(s))} />)}</Cluster>
      <Field label={t('sip.monthly')} value={monthly} onChangeText={setMonthly} prefix="₹" keyboardType="number-pad" hint={simpleAmount(m, lang) ?? undefined} />
      <Text v="label" weight="semibold">{t('sip.years')}</Text>
      <Cluster>{YEARS.map((y) => <Chip key={y} label={t('sip.yearsN', { n: y })} selected={years === y} onPress={() => setYears(y)} />)}</Cluster>
      <Button label={t('sip.calculate')} onPress={run} loading={busy} />
      {err ? <Banner tone="caution" title={err} /> : null}
      {res ? (
        <Panel>
          <Text v="bodyLg" accessibilityLiveRegion="polite">{t('sip.result', { monthly: formatINR(res.monthly), years: res.years, invested: formatINR(res.invested), value: formatINR(res.currentValue) })}</Text>
          {res.years < years - 0.3 ? <Banner tone="info" title={t('sip.shorter', { n: formatNumber(res.years, 1) })} /> : null}
          <Row title={t('sip.invested')} right={<Text v="body" weight="semibold" num>{formatINR(res.invested)}</Text>} />
          <Row title={t('sip.value')} right={<Text v="body" weight="semibold" num>{formatINR(res.currentValue)}</Text>} />
          <Row title={t('sip.gain')} right={<Change pct={res.absoluteReturnPct} v="body" />} />
          {res.xirrPct != null ? <Row title={t('sip.xirr')} right={<Text v="body" weight="semibold" num>{formatPct(res.xirrPct, 1, false)}</Text>} last /> : null}
          <Banner tone="caution" title={t('sip.notForecast')} body={res.note} />
          <View style={{ marginTop: space.sm }}><AsOfLine s={res} /></View>
        </Panel>
      ) : null}
    </View>
  );
}

export function FundDetail() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const schemeCode = parseInt(String(code), 10);
  const t = useT();
  const { lang } = useApp();
  const { isDesktop } = useLayout();
  const q = useApi<FundT>(isFinite(schemeCode) ? `/funds/${schemeCode}` : null, { fresh: 60000 });
  const [range, setRange] = useState<R>('3y');
  const [adding, setAdding] = useState(false);
  const pts = useMemo(() => {
    const s = q.data?.series ?? [];
    if (range === 'max' || !s.length) return s;
    const years = range === '1y' ? 1 : range === '3y' ? 3 : 5;
    const cutoff = s[s.length - 1].t - years * 365 * 86400000;
    return s.filter((p) => p.t >= cutoff);
  }, [q.data, range]);

  const info = (
    <Async q={q} skeleton={<SkeletonBlock lines={4} />}>
      {(f) => (
        <View style={{ gap: space.lg }}>
          <View style={{ gap: 4 }}>
            <Text v="display" num>{formatINR(f.nav, 4).replace(/0+$/, '').replace(/\.$/, '')}</Text>
            <Text v="label" tone="soft">{t('fund.navOn', { date: formatDate(f.navDate, lang) })}</Text>
            <AsOfLine s={f} />
          </View>
          <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
            {(['1y', '3y', '5y'] as const).map((k, i) => (
              <Row key={k} title={t('fund.return', { n: k.replace('y', '') })} subtitle={t('fund.annualised')} last={i === 2}
                right={f.returns[k] == null ? <Text v="small" tone="soft">{t('fund.notEnough')}</Text> : <Change pct={f.returns[k]} v="body" />} />
            ))}
          </Panel>
          <Text v="small" tone="soft">{t('fund.pastNote')}</Text>
        </View>
      )}
    </Async>
  );
  const chart = (
    <Section title={t('fund.history')}>
      <Cluster style={{ marginBottom: space.md }}>
        {(['1y', '3y', '5y', 'max'] as R[]).map((r) => <Chip key={r} label={r === 'max' ? t('range.max') : t(`range.${r}` as never)} selected={range === r} onPress={() => setRange(r)} />)}
      </Cluster>
      {pts.length > 1 ? <LineChart points={pts} label={q.data?.name} /> : q.data ? <Text v="body" tone="soft">{t('chart.none')}</Text> : null}
    </Section>
  );
  const sip = (
    <Section title={t('sip.title')}>
      <SipCalculator schemeCode={schemeCode} />
    </Section>
  );
  return (
    <Screen back title={q.data?.name ?? t('markets.funds')} subtitle={[q.data?.house, q.data?.category].filter(Boolean).join(' · ') || undefined} onRefresh={q.refetch} refreshing={q.refreshing}
      headerRight={q.data ? <View style={{ minWidth: 200 }}><Button label={t('stock.add')} icon={Plus} onPress={() => setAdding(true)} /></View> : undefined}>
      <View style={{ marginTop: space.lg }}>{info}</View>
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start' }}>
          <View style={{ flex: 3 }}>{chart}</View>
          <View style={{ flex: 2 }}>{sip}</View>
        </View>
      ) : (<>{chart}{sip}</>)}
      <AddHoldingSheet visible={adding} onClose={() => setAdding(false)} preset={q.data ? { type: 'fund', schemeCode: q.data.schemeCode, name: q.data.name, price: q.data.nav } : undefined} />
    </Screen>
  );
}
