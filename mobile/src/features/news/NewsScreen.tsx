import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, MessageCircleQuestion } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Async, EmptyState } from '@/components/Async';
import { SkeletonList } from '@/components/Skeleton';
import { Cluster, Hairline, Panel, Section } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { RichText } from '@/components/Term';
import { useApi } from '@/api/useApi';
import type { NewsChannelId, NewsFeed, NewsHub, NewsItem } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { SentimentTag } from '../shared';

const CHANNELS: { id: NewsChannelId; key: Key }[] = [
  { id: 'all', key: 'topic.all' }, { id: 'markets', key: 'topic.market' }, { id: 'stocks', key: 'topic.stocks' },
  { id: 'economy', key: 'topic.economy' }, { id: 'ipo', key: 'topic.ipo' }, { id: 'funds', key: 'topic.funds' }, { id: 'gold', key: 'topic.gold' },
];
const openWeb = (url: string) => { WebBrowser.openBrowserAsync(url).catch(() => {}); };

/** The whole story, inside the app. Nothing here sends the reader to another app unless they ask for the publisher's page. */
function NewsDetail({ n, onClose }: { n: NewsItem | null; onClose: () => void }) {
  const t = useT();
  const { lang } = useApp();
  const router = useRouter();
  if (!n) return null;
  const text = n.body ?? n.summary;
  return (
    <Sheet visible onClose={onClose} title={n.source}>
      <Text v="h3">{n.title}</Text>
      <Cluster gap={space.md}><SentimentTag s={n.sentiment} /><Text v="small" tone="soft">{n.source} · {timeAgo(n.publishedAt, lang)}</Text></Cluster>
      {text ? <Text v="bodyLg">{text}</Text> : null}
      {n.explanation ? <RichText text={n.explanation} v="body" /> : null}
      {n.impact ? <Text v="label" tone="soft">{t('news.impact')}: {n.impact}</Text> : null}
      {n.affectedSymbols.length ? (
        <Cluster>
          <Text v="label" tone="soft">{t('news.affects')}:</Text>
          {n.affectedSymbols.slice(0, 5).map((s) => <Chip key={s} label={s.replace('.NS', '')} onPress={() => { onClose(); router.push(`/stock/${encodeURIComponent(s)}`); }} accessibilityLabel={`${t('news.openStock')} ${s.replace('.NS', '')}`} />)}
        </Cluster>
      ) : null}
      <Button label={t('news.askAbout')} icon={MessageCircleQuestion} onPress={() => { onClose(); router.push({ pathname: '/ask', params: { q: n.title } }); }} />
      {n.url ? <Button compact variant="secondary" fullWidth={false} icon={ExternalLink} label={t('news.openArticle')} onPress={() => openWeb(n.url)} /> : null}
      <Text v="small" tone="soft">{t('news.method')}: {n.sentimentMethod}</Text>
    </Sheet>
  );
}

function NewsCard({ n, onOpen, first }: { n: NewsItem; onOpen: () => void; first: boolean }) {
  const { lang } = useApp();
  const t = useT();
  const preview = n.summary ?? (n.body && n.body !== n.title ? n.body : undefined);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${n.source}. ${n.title}`} accessibilityHint={t('common.openDetails')} style={{ paddingVertical: space.lg, gap: space.sm }}>
      {!first ? <Hairline style={{ position: 'absolute', top: 0, left: 0, right: 0 }} /> : null}
      <Text v="small" tone="soft" weight="semibold">{n.source} · {timeAgo(n.publishedAt, lang)}</Text>
      <Text v="bodyLg" weight="semibold">{n.title}</Text>
      {preview ? <Text v="body" tone="soft" numberOfLines={2}>{preview}</Text> : null}
      <Cluster gap={space.sm}>
        <SentimentTag s={n.sentiment} />
        {n.affectedSymbols.slice(0, 3).map((s) => <Text key={s} v="small" tone="primary" weight="semibold">{s.replace('.NS', '')}</Text>)}
      </Cluster>
    </Pressable>
  );
}

/** Reddit and X posts. These are people's opinions, so they live below the real news and carry a warning. */
function Community() {
  const { lang } = useApp();
  const t = useT();
  const q = useApi<NewsHub>(`/news/hub?lang=${lang}`, { fresh: 120000 });
  return (
    <Section title={t('news.community')} style={{ marginTop: space.xl }}>
      <Async q={q} skeleton={<SkeletonList rows={3} />} isEmpty={(d) => !d.social.length} empty={<EmptyState title={t('news.communityEmpty')} />}>
        {(h) => (<>
          <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
            {h.social.slice(0, 10).map((p, i) => (
              <View key={p.id} style={{ paddingVertical: space.lg, gap: space.sm }}>
                {i > 0 ? <Hairline style={{ position: 'absolute', top: 0, left: 0, right: 0 }} /> : null}
                <Text v="body" weight="semibold" onPress={() => openWeb(p.url)} accessibilityRole="link">{p.title}</Text>
                <Cluster gap={space.md}><SentimentTag s={p.sentiment} /><Text v="small" tone="soft">{p.community ?? (p.origin === 'x' ? 'X' : 'Reddit')} · {timeAgo(p.publishedAt, lang)}</Text></Cluster>
              </View>
            ))}
          </Panel>
          <Text v="small" tone="soft" style={{ marginTop: space.sm }}>{t('news.communityNote')}</Text>
        </>)}
      </Async>
    </Section>
  );
}

export function NewsScreen() {
  const { lang } = useApp();
  const t = useT();
  const { colors } = useTheme();
  const [channel, setChannel] = useState<NewsChannelId>('all');
  const [open, setOpen] = useState<NewsItem | null>(null);
  const q = useApi<NewsFeed>(`/news/channel?lang=${lang}&id=${channel}`, { fresh: 120000, pollMs: 300000 });
  return (
    <Screen title={t('tab.news')} subtitle={t('news.sub')} onRefresh={() => { q.refetch(); }} refreshing={q.refreshing}>
      <Cluster style={{ marginTop: space.lg, marginBottom: space.lg }}>
        {CHANNELS.map((c) => <Chip key={c.id} label={t(c.key)} selected={channel === c.id} onPress={() => setChannel(c.id)} />)}
      </Cluster>
      <Async q={q} skeleton={<SkeletonList rows={6} />} isEmpty={(d) => !d.items.length} empty={<EmptyState title={t('news.empty')} body={t('news.emptyBody')} />}>
        {(f) => (<>
          <Panel pad={false} style={{ paddingHorizontal: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface }}>
            {f.items.map((n, i) => <NewsCard key={n.id} n={n} first={i === 0} onOpen={() => setOpen(n)} />)}
          </Panel>
          <Text v="small" tone="soft" style={{ marginTop: space.sm }}>{t('news.source')}: {f.source}</Text>
        </>)}
      </Async>
      {channel === 'all' ? <Community /> : null}
      <NewsDetail n={open} onClose={() => setOpen(null)} />
    </Screen>
  );
}
