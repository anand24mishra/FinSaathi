import React, { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
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
const TABS: TabKey[] = ['invest', 'trade', 'rising', 'avoid', 'ipos'];
const pick = (f: CallsFeed, k: Exclude<TabKey, 'ipos'>): StockCall[] => ({ invest: f.invest, trade: f.trade, rising: f.risingStars, avoid: f.avoid }[k]);

function Pulse({ o }: { o: MarketOverview }) {
  const { colors } = useTheme();
  const items = [...o.india, ...(o.fx ? [o.fx] : []), ...o.commodities.slice(0, 2)];
  return (
    <Panel style={{ borderRadius: radius.lg, paddingVertical: space.lg }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xl, rowGap: space.lg }}>
        {items.map((q) => (
          <View key={q.symbol} style={{ minWidth: 118, gap: 2 }}>
            <Text v="label" tone="soft">{q.name}</Text>
            <Text v="money" num style={{ fontSize: 20, lineHeight: 26, color: colors.ink }}>{q.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
            <Change pct={q.changePct} />
          </View>
        ))}
      </View>
    </Panel>
  );
}

function Calls() {
  const { lang } = useApp(); const t = useT(); const router = useRouter();
  const [tab, setTab] = useState<TabKey>('invest');
  const q = useApi<CallsFeed>(withLang('/calls', lang), { fresh: 300000 });
  const shown = q.data && tab !== 'ipos' ? pick(q.data, tab).slice(0, 10) : [];
  const live = useLive(shown.map((c) => c.symbol));
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }}><Text v="h2">{t('home.callsTitle')}</Text><LiveBadge status={live.status} quote={shown[0] ? live.quotes[shown[0].symbol] : null} /></View>
      <Cluster>{TABS.map((k) => <Chip key={k} label={t(`home.tab.${k}` as Key)} selected={tab === k} onPress={() => setTab(k)} />)}</Cluster>
      <Text v="small" tone="soft">{t(`home.tabHelp.${tab}` as Key)}</Text>
      {tab === 'ipos' ? <IposTab /> : (
        <Panel pad={false} style={{ paddingHorizontal: space.lg, borderRadius: radius.lg }}>
          <Async q={q} skeleton={<View style={{ paddingVertical: space.lg }}><SkeletonList rows={5} /></View>}
            isEmpty={(d) => !pick(d, tab).length} empty={<EmptyState title={t('home.callsEmpty')} />}>
            {(d) => (<>
              {pick(d, tab).slice(0, 10).map((c, i, arr) => <CallRow key={c.symbol + c.mode} call={c} live={live.quotes[c.symbol] ? { price: live.quotes[c.symbol].price, changePct: live.quotes[c.symbol].changePct } : undefined} last={i === arr.length - 1} onPress={() => router.push({ pathname: '/stock/[symbol]', params: { symbol: c.symbol, mode: c.mode } })} />)}
              {d.notes.length ? <Text v="small" tone="soft" style={{ paddingVertical: space.md }}>{d.notes.join(' ')}</Text> : null}
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
  const n = note.data;
  return (
    <Panel style={{ gap: space.sm, borderRadius: radius.lg, padding: space.xl }}>
      <Text v="label" tone="primary" weight="bold">{t('home.note').toUpperCase()}</Text>
      {n ? (<>
        <Text v="h3">{n.headline}</Text>
        <Text v="body" tone="soft">{n.body}</Text>
        {n.watch.slice(0, 3).map((w) => <Text key={w} v="small" tone="soft">• {w}</Text>)}
      </>) : o.data ? (<>
        <Text v="h3">{o.data.mood.headline}</Text>
        {o.data.mood.bullets.slice(0, 3).map((b) => <Text key={b} v="small" tone="soft">• {b}</Text>)}
      </>) : <SkeletonBlock lines={3} />}
      <Text v="small" tone="soft" style={{ fontStyle: 'italic' }}>{t('home.researchOnly')}</Text>
    </Panel>
  );
}

function Social() {
  const { lang } = useApp(); const t = useT(); const { colors } = useTheme(); const router = useRouter();
  const q = useApi<NewsHub>(withLang('/news/hub', lang), { fresh: 120000 });
  const status = (s: 'live' | 'unavailable' | 'not_configured') => t(s === 'live' ? 'home.sourceLive' : s === 'not_configured' ? 'home.sourceOff' : 'home.sourceDown');
  return (
    <Panel style={{ gap: space.md, borderRadius: radius.lg, padding: space.xl }}>
      <Text v="label" tone="primary" weight="bold">{t('home.social').toUpperCase()}</Text>
      <Async q={q} skeleton={<SkeletonList rows={4} />} isEmpty={(d) => !d.news.length && !d.social.length} empty={<EmptyState title={t('news.empty')} />}>
        {(h) => (<>
          {h.buzz.length ? (<>
            <Text v="small" tone="soft">{t('home.buzz')}</Text>
            <Cluster>{h.buzz.slice(0, 6).map((b) => (
              <View key={b.symbol} style={{ backgroundColor: b.sentimentScore >= 15 ? colors.gainBg : b.sentimentScore <= -15 ? colors.lossBg : colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 5 }}>
                <Text v="small" weight="semibold" tone={b.sentimentScore >= 15 ? 'gain' : b.sentimentScore <= -15 ? 'loss' : 'ink'}>{b.name} · {t('home.mentions', { n: b.mentions })}</Text>
              </View>))}</Cluster>
          </>) : null}
          {[...h.news.slice(0, 3).map((n) => ({ id: n.id, title: n.title, url: n.url, meta: n.source, at: n.publishedAt, s: n.sentiment })),
            ...h.social.slice(0, 3).map((p) => ({ id: p.id, title: p.title, url: p.url, meta: p.community ?? (p.origin === 'x' ? 'X' : p.origin === 'telegram' ? 'Telegram' : 'Reddit'), at: p.publishedAt, s: p.sentiment }))].map((it, i, arr) => (
            <View key={it.id} style={{ gap: 4, paddingBottom: space.md, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: colors.line }}>
              <Text v="body" weight="semibold" accessibilityRole="link" onPress={() => Linking.openURL(it.url).catch(() => {})}>{it.title}</Text>
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}><SentimentTag s={it.s} /><Text v="small" tone="soft">{it.meta} · {timeAgo(it.at, lang)}</Text></View>
            </View>))}
          <Cluster>{h.sources.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.status === 'live' ? colors.gain : s.status === 'not_configured' ? colors.inkSoft : colors.loss }} />
              <Text v="small" tone="soft">{s.name}: {status(s.status)}</Text>
            </View>))}</Cluster>
          <Button label={t('home.seeNews')} variant="secondary" onPress={() => router.navigate({ pathname: '/markets', params: { tab: 'news' } })} />
        </>)}
      </Async>
    </Panel>
  );
}

export function HomeScreen() {
  const { lang, user } = useApp(); const t = useT(); const { isDesktop } = useLayout();
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
      <View style={{ marginTop: space.xl, gap: space.xl }}>
        <Async q={overview} skeleton={<SkeletonBlock lines={3} />}>{(o) => <Pulse o={o} />}</Async>
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: space.xl, alignItems: 'flex-start' }}>
          <View style={{ flex: isDesktop ? 3 : undefined, width: isDesktop ? undefined : '100%' }}><Calls /></View>
          <View style={{ flex: isDesktop ? 2 : undefined, width: isDesktop ? undefined : '100%', gap: space.xl }}><Note o={overview} /><Social /></View>
        </View>
      </View>
    </Screen>
  );
}
