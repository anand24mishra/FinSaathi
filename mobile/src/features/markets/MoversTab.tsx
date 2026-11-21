import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Panel, Row, Section, Cluster } from '@/components/Layout';
import { Async, EmptyState } from '@/components/Async';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { Chip } from '@/components/Chip';
import { Change } from '@/components/Change';
import { useApi } from '@/api/useApi';
import { withLang } from '@/api/client';
import type { MarketMover, MoversFeed } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { formatPrice } from '@/lib/format';
import { AsOfLine } from '../shared';
import { radius, space } from '@/theme/tokens';

type K = 'gainers' | 'losers' | 'volumeSpikes' | 'nearHigh' | 'nearLow';
const KEYS: K[] = ['gainers', 'losers', 'volumeSpikes', 'nearHigh', 'nearLow'];

function extra(m: MarketMover, k: K, t: ReturnType<typeof useT>): string {
  if (k === 'nearHigh' && m.nearHighPct != null) return t('movers.belowHigh', { n: m.nearHighPct.toFixed(1) });
  if (k === 'nearLow' && m.nearLowPct != null) return t('movers.aboveLow', { n: m.nearLowPct.toFixed(1) });
  if (k === 'volumeSpikes' && m.volume != null) return t('movers.volume', { n: Math.round(m.volume).toLocaleString('en-IN') });
  return m.change30dPct != null ? t('movers.month', { n: `${m.change30dPct >= 0 ? '+' : ''}${m.change30dPct.toFixed(1)}%` }) : '';
}

/** Whole-market screen: top movers across every stock the exchange data covers, not just the Nifty 50. */
export function MoversTab() {
  const { lang } = useApp(); const t = useT(); const router = useRouter();
  const [k, setK] = useState<K>('gainers');
  const q = useApi<MoversFeed>(withLang('/market/movers', lang), { pollMs: 30000 });
  return (
    <Section title={t('markets.movers')} style={{ marginTop: space.xl }}>
      <Async q={q} skeleton={<SkeletonList rows={8} />} isEmpty={(d) => !d.count} empty={<EmptyState title={t('movers.empty')} body={t('movers.emptyBody')} />}>
        {(d) => (
          <View style={{ gap: space.md }}>
            <Text v="small" tone="soft">{t('movers.universe', { u: d.universe })}</Text>
            <Cluster>{KEYS.map((x) => <Chip key={x} label={t(`movers.${x}` as Key)} selected={k === x} onPress={() => setK(x)} />)}</Cluster>
            <Panel pad={false} style={{ paddingHorizontal: space.lg, borderRadius: radius.lg }}>
              {d[k].map((m, i, arr) => (
                <Row key={m.symbol} title={m.name} subtitle={`${m.symbol.replace('.NS', '')}${extra(m, k, t) ? ' · ' + extra(m, k, t) : ''}`} last={i === arr.length - 1} chevron
                  onPress={() => router.push(`/stock/${encodeURIComponent(m.symbol)}`)}
                  right={<View style={{ alignItems: 'flex-end' }}><Text v="body" weight="semibold" num>{formatPrice(m.price)}</Text><Change pct={m.changePct} v="small" /></View>} />
              ))}
              {!d[k].length ? <Text v="small" tone="soft" style={{ paddingVertical: space.lg }}>{t('movers.none')}</Text> : null}
            </Panel>
            <AsOfLine s={{ asOf: d.asOf, source: d.source } as never} />
            <Text v="small" tone="soft">{d.delayNote}</Text>
          </View>
        )}
      </Async>
    </Section>
  );
}
