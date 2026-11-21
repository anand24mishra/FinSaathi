import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CallCard } from '../calls/CallParts';
import { useLive } from '@/live/LiveProvider';
import { LiveBadge } from '@/live/LiveBadge';
import { Plus } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Hairline, Panel, Row, Section, Cluster, useLayout } from '@/components/Layout';
import { Async } from '@/components/Async';
import { SkeletonBlock } from '@/components/Skeleton';
import { Change } from '@/components/Change';
import { LineChart, ScoreMeter } from '@/components/Charts';
import { RichText } from '@/components/Term';
import { Banner } from '@/components/Banner';
import { useApi } from '@/api/useApi';
import { withLang } from '@/api/client';
import type { Analysis, CallMode, Range, Series, StockCall, StockDetail as StockDetailT } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { formatCrore, formatNumber, formatPrice, formatDateTime } from '@/lib/format';
import { AsOfLine, DirectionTag, StanceTag, quotePrice, useAsOf } from '../shared';
import { AddHoldingSheet } from '../portfolio/AddHolding';
import { LevelsBand } from './LevelsBand';
import { space } from '@/theme/tokens';

const RANGES: { r: Range; k: Key }[] = [{ r: '1mo', k: 'range.1m' }, { r: '3mo', k: 'range.3m' }, { r: '6mo', k: 'range.6m' }, { r: '1y', k: 'range.1y' }, { r: '5y', k: 'range.5y' }];

function scoreWords(score: number, t: ReturnType<typeof useT>) {
  const k: Key = score >= 80 ? 'score.strong' : score >= 65 ? 'score.good' : score >= 50 ? 'score.average' : score >= 35 ? 'score.below' : 'score.weak';
  return t('score.caption', { score: Math.round(score), words: t(k) });
}

function Research({ a }: { a: Analysis }) {
  const t = useT();
  const { lang } = useApp();
  const conf = t(`conf.${a.confidence}` as Key);
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <Cluster gap={space.md}><StanceTag stance={a.stance} /><Text v="label" tone="soft">{t('research.confidence', { level: conf })}</Text></Cluster>
        <ScoreMeter score={a.score} caption={scoreWords(a.score, t)} />
      </View>
      <View style={{ gap: space.sm }}>
        <Text v="label" weight="semibold" tone="soft">{t('research.thesis')}</Text>
        <RichText text={a.thesis} v="bodyLg" />
        <Text v="label" tone="soft">{t('research.horizon')}: {a.horizon.label}</Text>
      </View>
      {a.evidence.length ? (
        <View>
          <Text v="label" weight="semibold" tone="soft">{t('research.evidence')}</Text>
          {a.evidence.map((e, i) => (
            <View key={i} style={{ paddingVertical: space.md, gap: 4 }}>
              <Hairline style={{ marginBottom: space.md, display: i === 0 ? 'none' : 'flex' }} />
              <Cluster gap={space.sm}><DirectionTag d={e.direction} /><Text v="body" weight="semibold">{e.label}: {e.value}</Text></Cluster>
              <RichText text={e.detail} v="label" tone="soft" />
              <Text v="small" tone="soft">{e.source} · {formatDateTime(e.asOf, lang)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {a.levels ? <LevelsBand levels={a.levels} /> : null}
      {a.risks.length ? (
        <View style={{ gap: space.sm }}>
          <Text v="label" weight="semibold" tone="soft">{t('research.risks')}</Text>
          {a.risks.map((r, i) => <View key={i} style={{ flexDirection: 'row', gap: space.md }}><Text v="body" tone="soft">•</Text><View style={{ flex: 1 }}><RichText text={r} v="body" /></View></View>)}
        </View>
      ) : null}
      <Banner tone="caution" title={t('research.uncertainty')} body={a.uncertainty} />
      <View style={{ gap: 4 }}>
        <Text v="small" tone="soft">{t('research.sources')}: {a.sources.map((s) => s.name).join(', ')}</Text>
        {a.sources.filter((s) => s.url).slice(0, 3).map((s, i) => <Button key={i} compact variant="ghost" fullWidth={false} label={s.name} onPress={() => Linking.openURL(s.url!).catch(() => {})} />)}
        <Text v="small" tone="soft">{a.generatedBy === 'llm' ? t('research.byAi') : t('research.byRules')} · {formatDateTime(a.asOf, lang)}</Text>
      </View>
    </View>
  );
}

function KeyNumbers({ d }: { d: StockDetailT }) {
  const t = useT();
  const { lang } = useApp();
  const f = d.fundamentals;
  if (!f) return <Text v="body" tone="soft">{d.fundamentalsNote || t('stock.noFundamentals')}</Text>;
  const rows: [string, string][] = [
    [t('kn.pe'), f.pe != null ? formatNumber(f.pe, 1) : '—'], [t('kn.pb'), f.pb != null ? formatNumber(f.pb, 1) : '—'],
    [t('kn.roe'), f.roePct != null ? `${formatNumber(f.roePct, 1)}%` : '—'], [t('kn.de'), f.debtToEquity != null ? formatNumber(f.debtToEquity, 2) : '—'],
    [t('kn.div'), f.dividendYieldPct != null ? `${formatNumber(f.dividendYieldPct, 2)}%` : '—'], [t('kn.mcap'), formatCrore(f.marketCapCr, lang)],
    [t('kn.margin'), f.profitMarginPct != null ? `${formatNumber(f.profitMarginPct, 1)}%` : '—'], [t('kn.sector'), f.sector ?? d.sector ?? '—'],
  ];
  const termFor: Record<number, string> = {};
  return (
    <View>
      {rows.map(([k, v], i) => <Row key={k} title={k} right={<Text v="body" weight="semibold" num>{v}</Text>} last={i === rows.length - 1} />)}
      <Text v="small" tone="soft" style={{ marginTop: space.sm }}>{f.source} · {formatDateTime(f.asOf, lang)}{termFor ? '' : ''}</Text>
    </View>
  );
}

export function StockDetail() {
  const { symbol: raw, mode: rawMode } = useLocalSearchParams<{ symbol: string; mode?: string }>();
  const [mode, setMode] = useState<CallMode>(rawMode === 'trade' ? 'trade' : 'invest');
  const symbol = decodeURIComponent(String(raw ?? ''));
  const t = useT();
  const { lang } = useApp();
  const { isDesktop } = useLayout();
  const asOf = useAsOf();
  const [range, setRange] = useState<Range>('1y');
  const [adding, setAdding] = useState(false);
  const enc = encodeURIComponent(symbol);
  const detail = useApi<StockDetailT>(`/stocks/${enc}`, { pollMs: 60000 });
  const series = useApi<Series>(`/market/series?symbol=${enc}&range=${range}`, { fresh: 60000 });
  const analysis = useApi<Analysis>(withLang(`/stocks/${enc}/analysis`, lang), { fresh: 120000 });
  const call = useApi<StockCall>(withLang(`/calls/${enc}?mode=${mode}`, lang), { fresh: 120000 });
  const live = useLive(symbol ? [symbol] : []);
  const d = detail.data;

  const top = (
    <Async q={detail} skeleton={<SkeletonBlock lines={3} />}>
      {(s) => { const lq = live.quotes[symbol] ?? s.quote; return (
        <View style={{ gap: space.sm }}>
          <Text v="display" num>{quotePrice(lq)}</Text>
          <Change value={lq.change} pct={lq.changePct} v="bodyLg" inr={lq.currency === 'INR'} />
          <LiveBadge status={live.status} quote={lq} note={live.hello ? undefined : undefined} />
          <Text v="small" tone="soft">{asOf(lq)}</Text>
          {live.hello && live.quotes[symbol] ? <Text v="small" tone="soft">{live.hello.delayNote}</Text> : null}
          {lq.dayLow != null && lq.dayHigh != null ? <Text v="label" tone="soft">{t('stock.dayRange')}: {formatPrice(lq.dayLow)} – {formatPrice(lq.dayHigh)}</Text> : null}
        </View>
      ); }}
    </Async>
  );

  const callSection = (
    <Section title={t('home.callsTitle')} style={{ marginTop: space.xl }}>
      <Cluster style={{ marginBottom: space.md }}>
        {(['invest', 'trade'] as const).map((m) => <Chip key={m} label={t(`calls.mode.${m}` as Key)} selected={mode === m} onPress={() => setMode(m)} />)}
      </Cluster>
      <Async q={call} skeleton={<SkeletonBlock lines={8} />}>{(c) => <CallCard call={c} wide={isDesktop} />}</Async>
    </Section>
  );

  const chart = (
    <Section title={t('stock.priceHistory')}>
      <Cluster style={{ marginBottom: space.md }}>
        {RANGES.map((x) => <Chip key={x.r} label={t(x.k)} selected={range === x.r} onPress={() => setRange(x.r)} />)}
      </Cluster>
      <Async q={series} skeleton={<SkeletonBlock lines={6} />} isEmpty={(s) => s.points.length < 2} empty={<Text v="body" tone="soft">{t('chart.none')}</Text>}>
        {(s) => (<><LineChart points={s.points} label={d?.quote.name} /><AsOfLine s={s} /></>)}
      </Async>
    </Section>
  );

  const perf = d ? (
    <Section title={t('stock.performance')}>
      <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
        {(['1m', '3m', '6m', '1y'] as const).map((k, i) => <Row key={k} title={t(`perf.${k}` as Key)} last={i === 3} right={<Change pct={d.performance[k]} v="body" />} />)}
      </Panel>
    </Section>
  ) : null;

  const nums = (
    <Section title={t('stock.keyNumbers')}>
      <Async q={detail} skeleton={<SkeletonBlock />}>{(s) => <KeyNumbers d={s} />}</Async>
    </Section>
  );

  const research = (
    <Section title={t('research.title')} style={{ marginTop: isDesktop ? space.xl : space.xxl }}>
      <Async q={analysis} skeleton={<SkeletonBlock lines={8} />}>{(a) => <Research a={a} />}</Async>
    </Section>
  );

  return (
    <Screen back title={d?.quote.name ?? symbol.replace('.NS', '')} subtitle={d?.sector ?? symbol.replace('.NS', '')} onRefresh={() => { detail.refetch(); series.refetch(); analysis.refetch(); call.refetch(); }} refreshing={detail.refreshing}
      headerRight={<View style={{ minWidth: 200 }}><Button label={t('stock.add')} icon={Plus} onPress={() => setAdding(true)} /></View>}>
      <View style={{ marginTop: space.lg }}>{top}</View>
      {callSection}
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start' }}>
          <View style={{ flex: 3 }}>{chart}{perf}{nums}</View>
          <View style={{ flex: 2 }}>{research}</View>
        </View>
      ) : (<>{chart}{perf}{research}{nums}</>)}
      <AddHoldingSheet visible={adding} onClose={() => setAdding(false)} preset={d ? { type: 'stock', symbol: d.quote.symbol, name: d.quote.name, price: d.quote.price } : undefined} />
    </Screen>
  );
}
