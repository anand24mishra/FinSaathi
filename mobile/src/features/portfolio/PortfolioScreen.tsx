import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Banner } from '@/components/Banner';
import { Change } from '@/components/Change';
import { Hairline, Panel, Row, Section, Cluster, useLayout } from '@/components/Layout';
import { Async, EmptyState } from '@/components/Async';
import { SkeletonBlock, SkeletonList } from '@/components/Skeleton';
import { BarList, ScoreMeter } from '@/components/Charts';
import { Sheet } from '@/components/Sheet';
import { RichText } from '@/components/Term';
import { api, ApiError, withLang } from '@/api/client';
import { clearApiCache, useApi } from '@/api/useApi';
import type { Holding, PortfolioHealth, PortfolioView, StockCall } from '@/api/contract';
import { CallBadge } from '../calls/CallParts';
import { useTheme } from '@/theme/ThemeProvider';
import { useApp } from '@/state/AppState';
import { useT } from '@/i18n';
import { formatINR, formatNumber, formatPrice } from '@/lib/format';
import { AsOfLine, SeverityTag } from '../shared';
import { AddHoldingSheet, type Preset } from './AddHolding';
import { space } from '@/theme/tokens';

function Totals({ p }: { p: PortfolioView }) {
  const t = useT();
  const w = (n: number) => formatINR(n);
  return (
    <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
      <Row title={t('pf.value')} right={<Text v="h3" num>{w(p.totals.value)}</Text>} />
      <Row title={t('pf.invested')} right={<Text v="bodyLg" weight="semibold" num>{w(p.totals.invested)}</Text>} />
      <Row title={t('pf.pnl')} right={<Change value={p.totals.pnl} pct={p.totals.pnlPct} inr v="bodyLg" />} />
      <Row title={t('pf.today')} right={<Change value={p.totals.dayChange} inr v="bodyLg" />} last />
    </Panel>
  );
}

/** The invest call for a stock you hold. Renders nothing for funds or names we do not cover. */
function HoldingCall({ symbol }: { symbol: string }) {
  const { lang } = useApp(); const t = useT(); const router = useRouter();
  const q = useApi<StockCall>(withLang(`/calls/${encodeURIComponent(symbol)}?mode=invest`, lang), { fresh: 300000 });
  const c = q.data;
  if (!c) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
      <Text v="small" tone="soft">{t('pf.callOn')}</Text>
      <CallBadge action={c.action} />
      <Text v="small" tone="soft" accessibilityRole="link" onPress={() => router.push({ pathname: '/stock/[symbol]', params: { symbol: c.symbol, mode: 'invest' } })}>{t('calls.score', { n: c.score })} ›</Text>
    </View>
  );
}

function HoldingRow({ h, onEdit, onRemove, onOpen, last }: { h: Holding; onEdit: () => void; onRemove: () => void; onOpen: () => void; last: boolean }) {
  const t = useT();
  return (
    <View style={{ paddingVertical: space.md, gap: space.sm }}>
      <Row title={h.name} titleLines={2} subtitle={`${h.quantity} × ${formatPrice(h.avgPrice)} ${t('pf.avgShort')}${h.sector ? ' · ' + h.sector : ''}`} onPress={h.type === 'stock' && h.symbol ? onOpen : undefined} last
        right={<View style={{ alignItems: 'flex-end' }}><Text v="body" weight="bold" num>{h.value != null ? formatINR(h.value) : '—'}</Text>{h.pnl != null ? <Change value={h.pnl} pct={h.pnlPct} inr v="small" /> : <Text v="small" tone="soft">{t('pf.noPrice')}</Text>}</View>} />
      {h.type === 'stock' && h.symbol ? <HoldingCall symbol={h.symbol} /> : null}
      <Cluster>
        <Button compact fullWidth={false} variant="secondary" icon={Pencil} label={t('common.edit')} accessibilityLabel={`${t('common.edit')} ${h.name}`} onPress={onEdit} />
        <Button compact fullWidth={false} variant="ghost" icon={Trash2} label={t('common.remove')} accessibilityLabel={`${t('common.remove')} ${h.name}`} onPress={onRemove} />
      </Cluster>
      {!last ? <Hairline style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

function Health({ h }: { h: PortfolioHealth }) {
  const t = useT();
  if (h.empty) return <Text v="body" tone="soft">{t('health.empty')}</Text>;
  const c = h.concentration;
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <Text v="h2" num>{t('health.score', { score: Math.round(h.score) })}</Text>
        <Text v="bodyLg" weight="semibold" tone="soft">{h.label}</Text>
        <ScoreMeter score={h.score} caption={t('health.scoreWords', { score: Math.round(h.score), label: h.label })} />
        <Text v="body" tone="soft">{t('health.explain')}</Text>
      </View>
      <View style={{ gap: space.sm }}>
        <Text v="h3">{t('health.concentration')}</Text>
        <Text v="body">{t('health.concText', { top: formatNumber(c.topHoldingPct, 0), top3: formatNumber(c.top3Pct, 0) })}</Text>
        {c.sectorWeights.length ? <BarList items={c.sectorWeights.map((s) => ({ label: s.sector, pct: s.pct }))} /> : null}
      </View>
      {h.issues.length ? (
        <View style={{ gap: space.md }}>
          <Text v="h3">{t('health.issues')}</Text>
          {h.issues.map((i, k) => (
            <Panel key={k} style={{ gap: space.sm }}>
              <SeverityTag s={i.severity} />
              <Text v="bodyLg" weight="semibold">{i.title}</Text>
              <RichText text={i.detail} v="body" />
              <Text v="label"><Text v="label" weight="semibold">{t('health.consider')}: </Text>{i.action}</Text>
            </Panel>
          ))}
        </View>
      ) : <Banner tone="info" title={t('health.noIssues')} />}
      {h.suggestions.length ? (
        <View style={{ gap: space.sm }}>
          <Text v="h3">{t('health.suggestions')}</Text>
          {h.suggestions.map((s, i) => <View key={i} style={{ flexDirection: 'row', gap: space.md }}><Text v="body" tone="soft">•</Text><View style={{ flex: 1 }}><RichText text={s} v="body" /></View></View>)}
        </View>
      ) : null}
      <Text v="small" tone="soft">{h.disclaimer}</Text>
    </View>
  );
}

export function PortfolioScreen() {
  const { lang } = useApp();
  const t = useT();
  const router = useRouter();
  const { isDesktop } = useLayout();
  const pf = useApi<PortfolioView>('/portfolio', { fresh: 20000 });
  const health = useApi<PortfolioHealth>(withLang('/portfolio/health', lang), { fresh: 30000 });
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<Holding | null>(null);
  const [remove, setRemove] = useState<Holding | null>(null);
  const [rmBusy, setRmBusy] = useState(false);
  const [rmErr, setRmErr] = useState<string | null>(null);
  const reload = () => { clearApiCache(); pf.refetch(); health.refetch(); };

  const doRemove = async () => {
    if (!remove) return;
    setRmBusy(true); setRmErr(null);
    try { await api.del(`/portfolio/holdings/${remove.id}`); setRemove(null); reload(); }
    catch (e) { setRmErr(e instanceof ApiError ? e.message : t('err.generic')); } finally { setRmBusy(false); }
  };
  const editPreset: Preset | undefined = edit ? { type: edit.type, symbol: edit.symbol ?? undefined, schemeCode: edit.schemeCode ?? undefined, name: edit.name } : undefined;

  const holdings = (
    <Section title={pf.data?.holdings.length ? t('pf.holdings') : undefined} style={{ marginTop: space.xxl }} aside={pf.data?.holdings.length ? <Button compact fullWidth={false} icon={Plus} label={t('pf.add')} onPress={() => setAdding(true)} /> : undefined}>
      <Async q={pf} skeleton={<SkeletonList rows={4} />} isEmpty={(d) => !d.holdings.length}
        empty={(
          <Panel style={{ gap: space.md, borderRadius: 20, padding: space.xl }}>
            <Text v="h2">{t('pf.emptyTitle')}</Text>
            <Text v="body" tone="soft">{t('pf.emptyBody')}</Text>
            {(['pf.b1', 'pf.b2', 'pf.b3'] as const).map((k) => <View key={k} style={{ flexDirection: 'row', gap: space.sm }}><Text v="body" tone="primary">✓</Text><Text v="body" style={{ flex: 1 }}>{t(k)}</Text></View>)}
            <Button label={t('pf.add')} icon={Plus} fullWidth={false} onPress={() => setAdding(true)} />
          </Panel>
        )}>
        {(p) => (
          <View style={{ gap: space.md }}>
            <Totals p={p} />
            <AsOfLine s={p} />
            <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
              {p.holdings.map((h, i) => <HoldingRow key={h.id} h={h} last={i === p.holdings.length - 1} onEdit={() => setEdit(h)} onRemove={() => { setRmErr(null); setRemove(h); }} onOpen={() => router.push(`/stock/${encodeURIComponent(h.symbol!)}`)} />)}
            </Panel>
          </View>
        )}
      </Async>
    </Section>
  );
  const healthSec = (
    <Section title={t('health.title')} style={{ marginTop: isDesktop ? space.xxl : space.xxl }}>
      <Async q={health} skeleton={<SkeletonBlock lines={5} />}>{(h) => <Health h={h} />}</Async>
    </Section>
  );

  return (
    <Screen title={t('tab.portfolio')} onRefresh={reload} refreshing={pf.refreshing}>
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start' }}>
          <View style={{ flex: 3 }}>{holdings}</View>
          <View style={{ flex: 2 }}>{healthSec}</View>
        </View>
      ) : (<>{holdings}{healthSec}</>)}
      <AddHoldingSheet visible={adding} onClose={() => setAdding(false)} onAdded={reload} />
      <AddHoldingSheet visible={!!edit} onClose={() => setEdit(null)} onAdded={reload} preset={editPreset} initial={edit ? { qty: String(edit.quantity), price: String(edit.avgPrice) } : undefined} replaceId={edit?.id} />
      <Sheet visible={!!remove} onClose={() => setRemove(null)} title={t('pf.removeTitle')}>
        <Text v="bodyLg">{t('pf.removeBody', { name: remove?.name ?? '' })}</Text>
        {rmErr ? <Banner tone="error" title={rmErr} /> : null}
        <Button label={t('common.remove')} variant="danger" icon={Trash2} onPress={doRemove} loading={rmBusy} />
        <Button label={t('common.cancel')} variant="secondary" onPress={() => setRemove(null)} />
      </Sheet>
    </Screen>
  );
}
