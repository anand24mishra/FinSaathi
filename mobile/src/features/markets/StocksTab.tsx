import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Field } from '@/components/Field';
import { Panel, Row, Section } from '@/components/Layout';
import { Async, EmptyState } from '@/components/Async';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { Change } from '@/components/Change';
import { useApi } from '@/api/useApi';
import type { CallAction, CallsFeed, StockListItem } from '@/api/contract';
import { withLang } from '@/api/client';
import { Chip } from '@/components/Chip';
import { Cluster } from '@/components/Layout';
import { useApp } from '@/state/AppState';
import { CallBadge } from '../calls/CallParts';
import { useLive } from '@/live/LiveProvider';
import { useT } from '@/i18n';
import { quotePrice, useAsOf } from '../shared';
import { space } from '@/theme/tokens';

export function StocksTab() {
  const t = useT();
  const { lang } = useApp();
  const router = useRouter();
  const [sector, setSector] = useState<string>('all');
  const feed = useApi<CallsFeed>(withLang('/calls', lang), { fresh: 300000 });
  // The invest call for every name that appears in today's lists (others have no list call; we show nothing rather than guess).
  const calls = new Map<string, CallAction>();
  if (feed.data) for (const c of [...feed.data.invest, ...feed.data.avoid, ...feed.data.risingStars]) if (!calls.has(c.symbol)) calls.set(c.symbol, c.action);
  const asOf = useAsOf();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const id = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(id); }, [q]);
  const res = useApi<StockListItem[]>(`/stocks${dq ? `?query=${encodeURIComponent(dq)}` : ''}`, { fresh: 30000 });
  const stamp = res.data?.find((s) => s.quote)?.quote;
  const live = useLive((res.data ?? []).slice(0, 40).map((s) => s.symbol));
  return (
    <Section title={t('stocks.title')} style={{ marginTop: space.xl }}>
      <Field label={t('stocks.search')} value={q} onChangeText={setQ} placeholder={t('stocks.searchPlaceholder')} hint={t('stocks.searchAll')} />
      <View style={{ marginTop: space.lg }}>
        <Async q={res} skeleton={<SkeletonList rows={8} />} isEmpty={(d) => !d.length} empty={<EmptyState title={t('stocks.none')} body={t('stocks.noneBody')} action={t('stocks.clear')} onAction={() => setQ('')} />}>
          {(all) => {
            const counts = new Map<string, number>(); all.forEach((x) => x.sector && counts.set(x.sector, (counts.get(x.sector) ?? 0) + 1));
            const sectors = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
            const list0 = all.filter((x) => (sector === 'all' ? true : sector === '__calls' ? calls.has(x.symbol) : x.sector === sector));
            const list = list0.map((x) => (live.quotes[x.symbol] ? { ...x, quote: live.quotes[x.symbol] } : x));
            return (
            <View style={{ gap: space.md }}>
              <Cluster>
                <Chip label={t('stocks.all')} selected={sector === 'all'} onPress={() => setSector('all')} />
                {calls.size ? <Chip label={t('stocks.withCall')} selected={sector === '__calls'} onPress={() => setSector('__calls')} /> : null}
                {sectors.map((k) => <Chip key={k} label={k} selected={sector === k} onPress={() => setSector(k)} />)}
              </Cluster>
              <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
                {list.map((s, i) => (
                  <Row key={s.symbol} title={s.name} subtitle={`${s.symbol.replace('.NS', '')}${s.sector ? ' · ' + s.sector : ''}`} last={i === list.length - 1}
                    onPress={() => router.push(`/stock/${encodeURIComponent(s.symbol)}`)} chevron
                    right={s.quote ? (<View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>{calls.get(s.symbol) ? <CallBadge action={calls.get(s.symbol)!} /> : null}<View style={{ alignItems: 'flex-end' }}><Text v="body" weight="semibold" num>{quotePrice(s.quote)}</Text><Change pct={s.quote.changePct} v="small" /></View></View>) : <Text v="small" tone="soft">{t('stocks.noPrice')}</Text>} />
                ))}
              </Panel>
              {stamp ? <Text v="small" tone="soft">{asOf(stamp)}</Text> : null}
            </View>
            );
          }}
        </Async>
      </View>
    </Section>
  );
}
