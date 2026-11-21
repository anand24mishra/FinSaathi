import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { Square, Volume2 } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Hairline, Panel, Row, Section, useLayout } from '@/components/Layout';
import { Async, EmptyState } from '@/components/Async';
import { SkeletonBlock, SkeletonList } from '@/components/Skeleton';
import { RichText } from '@/components/Term';
import { Change } from '@/components/Change';
import { Reveal } from '@/components/Reveal';
import { Banner } from '@/components/Banner';
import { Accordion } from '@/components/Accordion';
import { Sheet } from '@/components/Sheet';
import { useApi } from '@/api/useApi';
import { withLang } from '@/api/client';
import type { Briefing, DailyIdeas, IdeaItem, MarketOverview, NewsFeed, PortfolioView, Quote } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useTheme } from '@/theme/ThemeProvider';
import { useT } from '@/i18n';
import { formatDay, formatINR, formatSignedINR, timeAgo } from '@/lib/format';
import { AsOfLine, QuoteLine, SentimentTag, StanceTag, quotePrice } from '../shared';
import { space } from '@/theme/tokens';

function ListenButton({ text }: { text: string }) {
  const { lang } = useApp();
  const t = useT();
  const [speaking, setSpeaking] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => { Speech.stop(); }, []);
  const toggle = () => {
    if (speaking) { Speech.stop(); setSpeaking(false); return; }
    setFailed(false);
    try {
      setSpeaking(true);
      Speech.speak(text, { language: lang === 'hi' ? 'hi-IN' : 'en-IN', rate: 0.92, onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => { setSpeaking(false); setFailed(true); } });
    } catch { setSpeaking(false); setFailed(true); }
  };
  return (
    <View style={{ gap: space.sm }}>
      <Button label={speaking ? t('today.stop') : t('today.listen')} icon={speaking ? Square : Volume2} onPress={toggle} accessibilityLabel={speaking ? t('today.stopHint') : t('today.listenHint')} />
      {failed ? <Text v="label" tone="caution">{t('today.listenFailed')}</Text> : null}
    </View>
  );
}

function Mood({ o }: { o: MarketOverview }) {
  const t = useT();
  const router = useRouter();
  const mood = o.mood;
  return (
    <View style={{ gap: space.md }}>
      <Reveal index={1} settle><Text v="h2" accessibilityRole="header">{mood.headline}</Text></Reveal>
      <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
        {o.india.length ? o.india.map((q, i) => <QuoteLine key={q.symbol} q={q} last={i === o.india.length - 1} onPress={q.symbol.startsWith('^') ? undefined : () => router.push(`/stock/${encodeURIComponent(q.symbol)}`)} />) : <EmptyState title={t('today.noIndices')} />}
      </Panel>
      {o.india[0] ? <AsOfLine s={o.india[0]} /> : <AsOfLine s={o} />}
    </View>
  );
}

function GlobalTable({ o }: { o: MarketOverview }) {
  const t = useT();
  const groups: { title: string; items: Quote[] }[] = [
    { title: t('today.global'), items: o.global },
    { title: t('today.commodities'), items: o.commodities },
    { title: t('today.currency'), items: o.fx ? [o.fx] : [] },
  ];
  return (
    <View style={{ gap: space.md }}>
      {groups.map((g) => g.items.length ? (
        <Panel key={g.title} pad={false} style={{ paddingHorizontal: space.lg }}>
          <Text v="label" weight="semibold" tone="soft" style={{ paddingTop: space.md }}>{g.title}</Text>
          {g.items.map((q, i) => <QuoteLine key={q.symbol} q={q} last={i === g.items.length - 1} />)}
        </Panel>
      ) : null)}
      <Panel>
        <Text v="label" weight="semibold">{t('today.flows')}</Text>
        <Text v="label" tone="soft">{o.flows.available && (o.flows.fii != null || o.flows.dii != null)
          ? `FII ${formatSignedINR(o.flows.fii ?? 0)} Cr · DII ${formatSignedINR(o.flows.dii ?? 0)} Cr`
          : t('today.notAvailable') + (o.flows.note ? ` ${o.flows.note}` : '')}</Text>
        <Hairline style={{ marginVertical: space.sm }} />
        <Text v="label" weight="semibold">{t('today.rates')}</Text>
        <Text v="label" tone="soft">{o.rates.available ? o.rates.note : t('today.notAvailable') + (o.rates.note ? ` ${o.rates.note}` : '')}</Text>
      </Panel>
      {o.unavailable.length ? <Text v="small" tone="soft">{t('today.unavailable', { list: o.unavailable.join(', ') })}</Text> : null}
    </View>
  );
}

function IdeaList({ title, items, empty, limit }: { title: string; items: IdeaItem[]; empty: string; limit?: number }) {
  items = limit ? items.slice(0, limit) : items;
  const router = useRouter();
  const t = useT();
  return (
    <View>
      <Text v="label" weight="semibold" tone="soft" style={{ marginBottom: 2 }}>{title}</Text>
      {items.length ? items.map((it, i) => (
        <Row key={it.symbol} title={it.name} last={i === items.length - 1} onPress={() => router.push(`/stock/${encodeURIComponent(it.symbol)}`)} hint={t('common.openDetails')}
          right={<StanceTag stance={it.stance} />}>
          <Text v="label" tone="soft">{it.oneLiner}</Text>
        </Row>
      )) : <Text v="label" tone="soft" style={{ paddingVertical: space.sm }}>{empty}</Text>}
    </View>
  );
}

function Money({ p }: { p: PortfolioView }) {
  const t = useT();
  const router = useRouter();
  if (!p.holdings.length) return null;
  return (
    <Section title={t('today.myMoney')}>
      <Panel>
        <Row title={t('pf.value')} right={<Text v="money" weight="bold" num>{formatINR(p.totals.value)}</Text>} />
        <Row title={t('pf.today')} right={<Change value={p.totals.dayChange} inr v="body" />} />
        <Row title={t('pf.pnl')} right={<Change pct={p.totals.pnlPct} value={p.totals.pnl} inr v="body" />} last />
      </Panel>
    </Section>
  );
}

export function TodayScreen() {
  const { lang, user } = useApp();
  const { colors } = useTheme();
  const t = useT();
  const router = useRouter();
  const { isDesktop } = useLayout();
  const overview = useApi<MarketOverview>(withLang('/market/overview', lang), { pollMs: 60000 });
  const briefing = useApi<Briefing>(withLang('/briefing/daily', lang), { fresh: 120000 });
  const ideas = useApi<DailyIdeas>(withLang('/ideas/daily', lang), { fresh: 120000 });
  const news = useApi<NewsFeed>(withLang('/news', lang), { fresh: 120000 });
  const portfolio = useApi<PortfolioView>('/portfolio', { fresh: 30000 });
  const refreshing = overview.refreshing || briefing.refreshing || ideas.refreshing || news.refreshing;
  const refetchAll = useCallback(() => { overview.refetch(); briefing.refetch(); ideas.refetch(); news.refetch(); portfolio.refetch(); }, [overview, briefing, ideas, news, portfolio]);
  const first = user?.name?.split(' ')[0] ?? '';
  const [allIdeas, setAllIdeas] = useState(false);

  const left = (
    <>
      <Section title={t('today.marketMood')} style={{ marginTop: space.xl }}>
        <Async q={overview} skeleton={<SkeletonList rows={4} />}>{(o) => <Mood o={o} />}</Async>
      </Section>
      <Async q={briefing} skeleton={<SkeletonBlock lines={3} />}>
        {(b) => (
          <>
            <View style={{ marginTop: space.xl }}><ListenButton text={b.speechText} /></View>
            <Section title={t('today.briefing')}>
              <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
                {b.sections.map((s, idx) => (
                  <Accordion key={s.id} title={s.title} open={idx === 0}>
                    {s.body ? <RichText text={s.body} v="body" /> : null}
                    {s.bullets.map((x, k) => (
                      <View key={k} style={{ flexDirection: 'row', gap: space.md }}>
                        <Text v="body" tone="soft">•</Text>
                        <View style={{ flex: 1 }}><RichText text={x} v="body" /></View>
                      </View>
                    ))}
                    {idx === 0 ? <Text v="small" tone="soft">{t('today.sources')}: {b.sources.join(', ')}</Text> : null}
                  </Accordion>
                ))}
              </View>
            </Section>
          </>
        )}
      </Async>
    </>
  );
  const right = (
    <>
      <Section title={t('today.ideas')} style={{ marginTop: isDesktop ? space.xl : space.xxl }}>
        <Async q={ideas} skeleton={<SkeletonList rows={4} />} isEmpty={(d) => !d.favourable.length && !d.cautious.length} empty={<EmptyState title={t('today.noIdeas')} body={t('today.noIdeasBody')} />}>
          {(d) => (
            <View style={{ gap: space.md }}>
              <IdeaList title={t('today.favourable')} items={d.favourable} empty={t('today.noneToday')} limit={3} />
              <IdeaList title={t('today.cautious')} items={d.cautious} empty={t('today.noneToday')} limit={3} />
              {d.favourable.length > 3 || d.cautious.length > 3 ? <Button label={t('today.seeAll')} variant="secondary" onPress={() => setAllIdeas(true)} /> : null}
              <AsOfLine s={d} />
              <Sheet visible={allIdeas} onClose={() => setAllIdeas(false)} title={t('today.ideas')}>
                <IdeaList title={t('today.favourable')} items={d.favourable} empty={t('today.noneToday')} />
                <IdeaList title={t('today.cautious')} items={d.cautious} empty={t('today.noneToday')} />
                <Text v="small" tone="soft">{d.methodology}</Text>
              </Sheet>
            </View>
          )}
        </Async>
      </Section>
      <Section title={t('today.headlines')}>
        <Async q={news} skeleton={<SkeletonList rows={4} />} isEmpty={(d) => !d.items.length} empty={<EmptyState title={t('news.empty')} />}>
          {(d) => (
            <View>
              {d.items.slice(0, 5).map((n, i, arr) => (
                <Row key={n.id} title={n.title} titleLines={2} last={i === arr.length - 1} onPress={() => Linking.openURL(n.url).catch(() => {})} hint={t('news.openArticle')}>
                  <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                    <SentimentTag s={n.sentiment} />
                    <Text v="small" tone="soft">{n.source} · {timeAgo(n.publishedAt, lang)}</Text>
                  </View>
                </Row>
              ))}
              <View style={{ marginTop: space.md }}><Button label={t('today.allNews')} variant="secondary" onPress={() => router.navigate({ pathname: '/markets', params: { tab: 'news' } })} /></View>
            </View>
          )}
        </Async>
      </Section>
      {portfolio.data ? <Money p={portfolio.data} /> : null}
      <Section style={{ marginTop: space.xl }}>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
          <Accordion title={t('today.worldTitle')}>
            <Async q={overview} skeleton={<SkeletonList rows={4} />}>{(o) => <GlobalTable o={o} />}</Async>
          </Accordion>
        </View>
      </Section>
    </>
  );

  return (
    <Screen onRefresh={refetchAll} refreshing={refreshing}>
      <Reveal index={0}>
        <View style={{ marginTop: space.xl }}>
          <Text v="h1">{briefing.data?.greeting || t('today.hello', { name: first })}</Text>
          <Text v="bodyLg" tone="soft">{formatDay(new Date(), lang)}</Text>
        </View>
      </Reveal>
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start' }}>
          <View style={{ flex: 3 }}>{left}</View>
          <View style={{ flex: 2 }}>{right}</View>
        </View>
      ) : (<>{left}{right}</>)}
    </Screen>
  );
}
