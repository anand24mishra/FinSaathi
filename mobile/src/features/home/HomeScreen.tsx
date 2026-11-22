import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Landmark } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Panel, Cluster, useLayout } from '@/components/Layout';
import { Async, EmptyState } from '@/components/Async';
import { SkeletonBlock, SkeletonList } from '@/components/Skeleton';
import { Change } from '@/components/Change';
import { Reveal } from '@/components/Reveal';
import { useApi } from '@/api/useApi';
import { withLang } from '@/api/client';
import type { AnalystNote, CallsFeed, MarketOverview, NewsHub, StockCall } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useTheme } from '@/theme/ThemeProvider';
import { useT, type Key } from '@/i18n';
import { formatDay, timeAgo } from '@/lib/format';
import { SentimentTag } from '../shared';
import { CallRow } from '../calls/CallParts';
import { IposTab } from '../markets/IposTab';
import { useLive } from '@/live/LiveProvider';
import { LiveBadge } from '@/live/LiveBadge';
import { radius, space } from '@/theme/tokens';

type TabKey = 'invest' | 'trade' | 'rising' | 'avoid' | 'ipos';
const TABS: TabKey[] = ['invest', 'trade', 'avoid'];
const pick = (f: CallsFeed, k: Exclude<TabKey, 'ipos'>): StockCall[] => ({ invest: f.invest, trade: f.trade, rising: f.risingStars, avoid: f.avoid }[k]);

function Pulse({ o }: { o: MarketOverview }) {
  const { colors } = useTheme();
  const items = [...o.india, ...(o.fx ? [o.fx] : []), ...o.commodities.slice(0, 1)];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }} style={{ marginHorizontal: -space.lg, paddingHorizontal: space.lg }}>
      {items.map((q) => (
        <View key={q.symbol} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 124, gap: 1 }}>
          <Text v="small" tone="soft" weight="semibold" numberOfLines={1}>{q.name}</Text>
          <Text v="money" num style={{ fontSize: 18, lineHeight: 24, color: colors.ink }}>{q.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
          <Change pct={q.changePct} />
        </View>
      ))}
    </ScrollView>
  );
}

function Calls() {
  const { lang } = useApp(); const t = useT(); const router = useRouter();
  const [tab, setTab] = useState<TabKey>('invest');
  const q = useApi<CallsFeed>(withLang('/calls', lang), { fresh: 300000 });
  const shown = q.data && tab !== 'ipos' ? pick(q.data, tab).slice(0, 5) : [];
  const live = useLive(shown.map((c) => c.symbol));
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }}><Text v="h2">{t('home.callsTitle')}</Text><LiveBadge status={live.status} quote={shown[0] ? live.quotes[shown[0].symbol] : null} /></View>
      <Cluster>{TABS.map((k) => <Chip key={k} label={t(`home.tab.${k}` as Key)} selected={tab === k} onPress={() => setTab(k)} />)}</Cluster>
      {tab === 'ipos' ? <IposTab /> : (
        <Panel pad={false} style={{ paddingHorizontal: space.lg, borderRadius: radius.lg }}>
          <Async q={q} skeleton={<View style={{ paddingVertical: space.lg }}><SkeletonList rows={5} /></View>}
            isEmpty={(d) => !pick(d, tab).length} empty={<EmptyState title={t('home.callsEmpty')} />}>
            {(d) => (<>
              {pick(d, tab).slice(0, 5).map((c, i, arr) => <CallRow key={c.symbol + c.mode} call={c} live={live.quotes[c.symbol] ? { price: live.quotes[c.symbol].price, changePct: live.quotes[c.symbol].changePct } : undefined} last={i === arr.length - 1} onPress={() => router.push({ pathname: '/stock/[symbol]', params: { symbol: c.symbol, mode: c.mode } })} />)}
            </>)}
          </Async>
        </Panel>
      )}
    </View>
  );
}

function Note({ o }: { o: ReturnType<typeof useApi<MarketOverview>> }) {
  const { lang } = useApp(); const t = useT();
  const note = useApi<AnalystNote>(withLang('/agent/note', lang), { fresh: 300000 });
  const headline = note.data?.headline ?? o.data?.mood.headline;
  if (!headline) return null;
  return (
    <Panel style={{ gap: 4, borderRadius: radius.lg, padding: space.lg }}>
      <Text v="label" tone="primary" weight="bold">{t('home.note').toUpperCase()}</Text>
      <Text v="bodyLg" weight="semibold">{headline}</Text>
    </Panel>
  );
}

export function HomeScreen() {
  const { lang, user } = useApp(); const t = useT(); const { isDesktop } = useLayout(); const router = useRouter(); const { colors } = useTheme();
  const overview = useApi<MarketOverview>(withLang('/market/overview', lang), { pollMs: 60000 });
  const refetch = useCallback(() => { overview.refetch(); }, [overview]);
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const first = user?.name && user.name !== 'Guest' ? `, ${user.name.split(' ')[0]}` : '';
  return (
    <Screen onRefresh={refetch} refreshing={overview.refreshing}>
      <Reveal index={0}>
        <View style={{ marginTop: space.xl, gap: 2 }}>
          <Text v="h1">{t('home.greeting', { part: t(`home.part.${part}` as Key) })}{first}</Text>
          <Text v="bodyLg" tone="soft">{formatDay(new Date(), lang)}</Text>
        </View>
      </Reveal>
      <View style={{ marginTop: space.lg, gap: space.lg }}>
        <Async q={overview} skeleton={<SkeletonBlock lines={2} />}>{(o) => <Pulse o={o} />}</Async>
        <Note o={overview} />
        <Calls />
        <Pressable onPress={() => router.navigate('/plan')} accessibilityRole="button" accessibilityLabel={t('home.planCard')} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.sm }}>
          <Landmark size={22} color={colors.primary} />
          <Text v="body" weight="semibold" tone="primary" style={{ flex: 1 }}>{t('home.planCard')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
