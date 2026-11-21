import React from 'react';
import { View } from 'react-native';
import { Async } from '@/components/Async';
import { SkeletonList } from '@/components/Skeleton';
import { Panel, Section } from '@/components/Layout';
import { Text } from '@/components/Text';
import { Tag } from '@/components/Chip';
import { Change } from '@/components/Change';
import { RichText } from '@/components/Term';
import { useApi } from '@/api/useApi';
import { withLang } from '@/api/client';
import type { AlternativeCard } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { Accordion } from '@/components/Accordion';
import { quotePrice, useAsOf } from '../shared';
import { space } from '@/theme/tokens';

type Res = { asOf: string; cards: AlternativeCard[]; disclaimer: string };

export function BeyondTab() {
  const { lang } = useApp();
  const t = useT();
  const asOf = useAsOf();
  const q = useApi<Res>(withLang('/alternatives', lang), { fresh: 300000 });
  return (
    <Section title={t('markets.beyond')} style={{ marginTop: space.xl }}>
      <Text v="body" tone="soft" style={{ marginBottom: space.md }}>{t('beyond.intro')}</Text>
      <Async q={q} skeleton={<SkeletonList rows={6} />}>
        {(r) => (
          <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
            {r.cards.map((c) => (
              <Accordion key={c.id} title={c.title} meta={<Tag tone={c.typicalRisk === 'low' ? 'gain' : c.typicalRisk === 'high' ? 'loss' : 'caution'} label={t(`risklabel.${c.typicalRisk}` as Key)} />}>
                <RichText text={c.simple} v="body" />
                <Text v="label"><Text v="label" weight="semibold">{t('beyond.goodFor')}: </Text>{c.goodFor}</Text>
                <Text v="label"><Text v="label" weight="semibold">{t('beyond.watchOut')}: </Text>{c.watchOut}</Text>
                <Text v="label"><Text v="label" weight="semibold">{t('beyond.liquidity')}: </Text>{c.liquidity}</Text>
                {c.quote ? (
                  <View style={{ gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
                      <Text v="label" weight="semibold">{c.quote.name}</Text><Text v="label" num>{quotePrice(c.quote)}</Text><Change pct={c.quote.changePct} v="label" />
                    </View>
                    <Text v="small" tone="soft">{asOf(c.quote)}</Text>
                  </View>
                ) : null}
              </Accordion>
            ))}
          </Panel>
        )}
      </Async>
    </Section>
  );
}
