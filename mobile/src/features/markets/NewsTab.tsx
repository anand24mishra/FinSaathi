import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import { Async, EmptyState } from '@/components/Async';
import { SkeletonList } from '@/components/Skeleton';
import { Cluster, Hairline, Panel, Section } from '@/components/Layout';
import { Text } from '@/components/Text';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { RichText } from '@/components/Term';
import { useApi } from '@/api/useApi';
import type { NewsFeed, NewsHub } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { SentimentTag } from '../shared';
import { space } from '@/theme/tokens';

const TOPICS = ['all', 'market', 'economy', 'stocks', 'ipo', 'gold'] as const;

export function NewsList({ feed }: { feed: NewsFeed }) {
  const t = useT();
  const { lang } = useApp();
  const router = useRouter();
  return (
    <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
      {feed.items.map((n, i) => (
        <View key={n.id} style={{ paddingVertical: space.lg, gap: space.sm }}>
          {i > 0 ? <Hairline style={{ position: 'absolute', top: 0, left: 0, right: 0 }} /> : null}
          <Text v="bodyLg" weight="semibold">{n.title}</Text>
          <Cluster gap={space.md}><SentimentTag s={n.sentiment} /><Text v="small" tone="soft">{n.source} · {timeAgo(n.publishedAt, lang)}</Text></Cluster>
          {n.explanation ? <RichText text={n.explanation} v="body" /> : null}
          {n.impact ? <Text v="label" tone="soft">{t('news.impact')}: {n.impact}</Text> : null}
          {n.affectedSymbols.length ? (
            <Cluster>
              <Text v="label" tone="soft">{t('news.affects')}:</Text>
              {n.affectedSymbols.slice(0, 5).map((s) => <Chip key={s} label={s.replace('.NS', '')} onPress={() => router.push(`/stock/${encodeURIComponent(s)}`)} accessibilityLabel={`${t('news.openStock')} ${s.replace('.NS', '')}`} />)}
            </Cluster>
          ) : null}
          <Button compact variant="secondary" fullWidth={false} icon={ExternalLink} label={t('news.openArticle')} onPress={() => Linking.openURL(n.url).catch(() => {})} />
          <Text v="small" tone="soft">{t('news.method')}: {n.sentimentMethod}</Text>
        </View>
      ))}
    </Panel>
  );
}

function Community() {
  const { lang } = useApp();
  const t = useT();
  const q = useApi<NewsHub>(`/news/hub?lang=${lang}`, { fresh: 120000 });
  return (
    <Section title={t('news.community')} style={{ marginTop: space.xl }}>
      <Async q={q} skeleton={<SkeletonList rows={4} />} isEmpty={(d) => !d.social.length} empty={<EmptyState title={t('news.communityEmpty')} />}>
        {(h) => (
          <>
            <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
              {h.social.slice(0, 15).map((p, i) => (
                <View key={p.id} style={{ paddingVertical: space.lg, gap: space.sm }}>
                  {i > 0 ? <Hairline style={{ position: 'absolute', top: 0, left: 0, right: 0 }} /> : null}
                  <Text v="body" weight="semibold" onPress={() => Linking.openURL(p.url).catch(() => {})} accessibilityRole="link">{p.title}</Text>
                  <Cluster gap={space.md}>
                    <SentimentTag s={p.sentiment} />
                    <Text v="small" tone="soft">{p.community ?? (p.origin === 'x' ? 'X' : p.origin === 'telegram' ? 'Telegram' : 'Reddit')} · {timeAgo(p.publishedAt, lang)}{p.engagement != null ? ` · ${t('news.engagement', { n: p.engagement })}` : ''}</Text>
                  </Cluster>
                </View>
              ))}
            </Panel>
            <Text v="small" tone="soft" style={{ marginTop: space.sm }}>{t('news.communityNote')}</Text>
          </>
        )}
      </Async>
    </Section>
  );
}

export function NewsTab() {
  const { lang } = useApp();
  const t = useT();
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>('all');
  const q = useApi<NewsFeed>(`/news?lang=${lang}${topic === 'all' ? '' : `&topic=${topic}`}`, { fresh: 120000 });
  return (
    <>
    <Section title={t('markets.news')} style={{ marginTop: space.xl }}>
      <Cluster style={{ marginBottom: space.lg }}>{TOPICS.map((x) => <Chip key={x} label={t(`topic.${x}` as Key)} selected={topic === x} onPress={() => setTopic(x)} />)}</Cluster>
      <Async q={q} skeleton={<SkeletonList rows={5} />} isEmpty={(d) => !d.items.length} empty={<EmptyState title={t('news.empty')} body={t('news.emptyBody')} />}>
        {(f) => (<><NewsList feed={f} /><Text v="small" tone="soft">{t('news.source')}: {f.source}</Text></>)}
      </Async>
    </Section>
    {topic === 'all' ? <Community /> : null}
    </>
  );
}
