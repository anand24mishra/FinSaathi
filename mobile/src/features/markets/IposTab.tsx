import React from 'react';
import { View } from 'react-native';
import { Accordion } from '@/components/Accordion';
import { Async, EmptyState } from '@/components/Async';
import { SkeletonList } from '@/components/Skeleton';
import { Panel, Section, Hairline } from '@/components/Layout';
import { Text } from '@/components/Text';
import { Tag } from '@/components/Chip';
import { Banner } from '@/components/Banner';
import { RichText } from '@/components/Term';
import { useApi } from '@/api/useApi';
import { withLang } from '@/api/client';
import type { IpoFeed, IpoItem } from '@/api/contract';
import { useApp } from '@/state/AppState';
import { useT, type Key } from '@/i18n';
import { formatDate, formatNumber } from '@/lib/format';
import { AsOfLine } from '../shared';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';



function Ipo({ i }: { i: IpoItem }) {
  const t = useT();
  const { lang } = useApp();
  const d = (s: string | null) => (s ? formatDate(s, lang, { day: 'numeric', month: 'short' }) : '—');
  const tone = i.status === 'open' ? 'gain' : i.status === 'upcoming' ? 'primary' : 'soft';
  return (
    <Accordion title={i.name} meta={<Tag tone={tone} label={t(`ipo.${i.status}` as Key)} />}>
      <Text v="label" tone="soft">{t('ipo.dates')}: {d(i.openDate)} – {d(i.closeDate)} · {t('ipo.listing')}: {d(i.listingDate)}</Text>
      {i.priceBand ? <Text v="label" tone="soft">{t('ipo.band')}: {i.priceBand}{i.lotSize ? ` · ${t('ipo.lot')}: ${i.lotSize}` : ''}{i.issueSizeCr ? ` · ${t('ipo.size')}: ₹${formatNumber(i.issueSizeCr, 0)} Cr` : ''}</Text> : null}
      {i.subscription ? <Text v="label" tone="soft">{t('ipo.subscribed')}: {i.subscription.total != null ? `${formatNumber(i.subscription.total, 2)}×` : '—'}{i.subscription.retail != null ? ` · ${t('ipo.retail')} ${formatNumber(i.subscription.retail, 2)}×` : ''}</Text> : null}
      {i.summary ? <RichText text={i.summary} v="body" /> : null}
      {i.checks.map((c, k) => (
        <View key={k} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <Tag tone={c.status === 'ok' ? 'gain' : c.status === 'warn' ? 'caution' : 'soft'} label={t(`check.${c.status}` as Key)} />
          <Text v="label" style={{ flex: 1 }}><Text v="label" weight="semibold">{c.label}: </Text>{c.detail}</Text>
        </View>
      ))}
    </Accordion>
  );
}

export function IposTab() {
  const { lang } = useApp();
  const t = useT();
  const q = useApi<IpoFeed>(withLang('/ipos', lang), { fresh: 120000 });
  return (
    <Section title={t('markets.ipos')} style={{ marginTop: space.xl }}>
      <Async q={q} skeleton={<SkeletonList rows={4} />}>
        {(f) => (
          <View style={{ gap: space.lg }}>
            {!f.available ? <Banner tone="caution" title={t('ipo.unavailable')} body={f.note} /> : <AsOfLine s={f} />}
            {f.available && !f.items.length ? <EmptyState title={t('ipo.none')} body={f.note} /> : null}
            {f.items.length ? <Panel pad={false} style={{ paddingHorizontal: space.lg }}>{f.items.map((i) => <Ipo key={i.name} i={i} />)}</Panel> : null}
            <Banner tone="info" title={t('ipo.gmp')} body={f.gmpNote} />
            <View>
              <Text v="h3" style={{ marginBottom: space.sm }}>{t('ipo.checklist')}</Text>
              <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
                {f.checklist.map((c, i) => <Accordion key={i} title={c.title}><RichText text={c.body} v="body" /></Accordion>)}
              </Panel>
            </View>
            <Hairline />
          </View>
        )}
      </Async>
    </Section>
  );
}
