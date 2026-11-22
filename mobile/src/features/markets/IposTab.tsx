import React, { useState } from 'react';
import { View } from 'react-native';
import { Accordion } from '@/components/Accordion';
import { Async, EmptyState } from '@/components/Async';
import { SkeletonList } from '@/components/Skeleton';
import { Panel, Section, Hairline } from '@/components/Layout';
import { Text } from '@/components/Text';
import { Segmented, Tag } from '@/components/Chip';
import { Banner } from '@/components/Banner';
import { RichText } from '@/components/Term';
import { useApi } from '@/api/useApi';
import { withLang } from '@/api/client';
import type { IpoFeed, IpoGuide, IpoItem } from '@/api/contract';
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

const GROUPS: IpoItem['status'][] = ['open', 'upcoming', 'closed', 'listed'];

function Upcoming() {
  const { lang } = useApp();
  const t = useT();
  const q = useApi<IpoFeed>(withLang('/ipos', lang), { fresh: 120000 });
  return (
    <Async q={q} skeleton={<SkeletonList rows={4} />}>
      {(f) => (
        <View style={{ gap: space.lg }}>
          {!f.available ? <Banner tone="caution" title={t('ipo.unavailable')} body={f.note} /> : <AsOfLine s={f} />}
          {f.available && !f.items.length ? <EmptyState title={t('ipo.none')} body={f.note} /> : null}
          {GROUPS.map((g) => {
            const rows = f.items.filter((i) => i.status === g);
            if (!rows.length) return null;
            return (
              <View key={g} style={{ gap: space.sm }}>
                <Text v="h3">{t(`ipo.${g}` as Key)}</Text>
                <Panel pad={false} style={{ paddingHorizontal: space.lg }}>{rows.map((i) => <Ipo key={i.name} i={i} />)}</Panel>
              </View>
            );
          })}
          <Text v="small" tone="soft">{t('ipo.timeline')}</Text>
          <Banner tone="info" title={t('ipo.gmp')} body={f.gmpNote} />
          <View>
            <Text v="h3" style={{ marginBottom: space.sm }}>{t('ipo.checklist')}</Text>
            <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
              {f.checklist.map((c, i) => <Accordion key={i} title={c.title}><RichText text={c.body} v="body" /></Accordion>)}
            </Panel>
          </View>
        </View>
      )}
    </Async>
  );
}

/** What is new, how to follow it, how to apply, what to read, and what to avoid. Text comes from the server so it can be corrected without an app update. */
function Guide() {
  const { lang } = useApp();
  const t = useT();
  const q = useApi<IpoGuide>(withLang('/ipos/guide', lang), { fresh: 3600000 });
  return (
    <Async q={q} skeleton={<SkeletonList rows={5} />}>
      {(g) => (
        <View style={{ gap: space.lg }}>
          <Banner tone="info" title={t('ipo.guideIntro')} body={g.note} />
          <Panel pad={false} style={{ paddingHorizontal: space.lg }}>
            {g.sections.map((sec, idx) => (
              <Accordion key={sec.id} title={sec.title} open={idx === 0}>
                {sec.steps.map((st, k) => (
                  <View key={k} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
                    <Text v="body" weight="bold" tone="primary" style={{ minWidth: 24 }}>{k + 1}.</Text>
                    <View style={{ flex: 1 }}><RichText text={st} v="body" /></View>
                  </View>
                ))}
                {sec.tip ? <Banner tone="caution" title={sec.tip} /> : null}
              </Accordion>
            ))}
          </Panel>
        </View>
      )}
    </Async>
  );
}

export function IposTab() {
  const t = useT();
  const [view, setView] = useState<'upcoming' | 'guide'>('upcoming');
  return (
    <Section title={t('markets.ipos')} style={{ marginTop: space.xl }}>
      <View style={{ gap: space.lg }}>
        <Segmented<'upcoming' | 'guide'> label={t('ipo.views')} value={view} onChange={setView} options={[{ value: 'upcoming', label: t('ipo.tabUpcoming') }, { value: 'guide', label: t('ipo.tabGuide') }]} />
        {view === 'upcoming' ? <Upcoming /> : <Guide />}
        <Hairline />
      </View>
    </Section>
  );
}
