import React from 'react';
import { View } from 'react-native';
import { ArrowDown, ArrowUp, Minus, ShieldAlert, Info, Eye, TrendingDown, TrendingUp, ThumbsUp, ThumbsDown, CircleHelp } from 'lucide-react-native';
import type { Quote, Sourced, Stance } from '@/api/contract';
import { Tag } from '@/components/Chip';
import { Text } from '@/components/Text';
import { Change } from '@/components/Change';
import { Row } from '@/components/Layout';
import { useT } from '@/i18n';
import { useApp } from '@/state/AppState';
import { formatDateTime, formatNumber, formatPrice } from '@/lib/format';

export function StanceTag({ stance }: { stance: Stance }) {
  const t = useT();
  if (stance === 'favourable') return <Tag tone="gain" icon={ThumbsUp} label={t('stance.favourable')} />;
  if (stance === 'cautious') return <Tag tone="caution" icon={ShieldAlert} label={t('stance.cautious')} />;
  return <Tag tone="soft" icon={Minus} label={t('stance.neutral')} />;
}
export function SentimentTag({ s }: { s: 'positive' | 'neutral' | 'negative' }) {
  const t = useT();
  if (s === 'positive') return <Tag tone="gain" icon={TrendingUp} label={t('sent.positive')} />;
  if (s === 'negative') return <Tag tone="loss" icon={TrendingDown} label={t('sent.negative')} />;
  return <Tag tone="soft" icon={Minus} label={t('sent.neutral')} />;
}
export function SeverityTag({ s }: { s: 'info' | 'watch' | 'important' }) {
  const t = useT();
  if (s === 'important') return <Tag tone="loss" icon={ShieldAlert} label={t('sev.important')} />;
  if (s === 'watch') return <Tag tone="caution" icon={Eye} label={t('sev.watch')} />;
  return <Tag tone="primary" icon={Info} label={t('sev.info')} />;
}
export function DirectionTag({ d }: { d: 'positive' | 'negative' | 'neutral' }) {
  const t = useT();
  return d === 'positive' ? <Tag tone="gain" icon={ArrowUp} label={t('dir.positive')} /> : d === 'negative' ? <Tag tone="loss" icon={ArrowDown} label={t('dir.negative')} /> : <Tag tone="soft" icon={CircleHelp} label={t('dir.neutral')} />;
}
export { ThumbsDown };

export function quotePrice(q: Quote): string {
  if (q.symbol.startsWith('^')) return formatNumber(q.price, 2);
  if (q.currency === 'USD') return `$${formatNumber(q.price, 2)}`;
  return formatPrice(q.price);
}

/** "As of 3:30 pm, delayed ~15 min" from the Sourced record. */
export function useAsOf() {
  const t = useT();
  const { lang } = useApp();
  return (s: { asOf: string; delayMinutes?: number | null; source?: string }) => {
    const base = t('asof.base', { when: formatDateTime(s.asOf, lang) });
    const delay = s.delayMinutes ? ' ' + t('asof.delayed', { n: s.delayMinutes }) : '';
    return base + delay + (s.source ? ` · ${s.source}` : '');
  };
}

export function AsOfLine({ s }: { s: Sourced | { asOf: string } }) {
  const f = useAsOf();
  return <Text v="small" tone="soft">{f(s as Sourced)}</Text>;
}

export function QuoteLine({ q, onPress, last }: { q: Quote; onPress?: () => void; last?: boolean }) {
  const t = useT();
  return (
    <Row title={q.name} subtitle={q.symbol.replace('.NS', '')} onPress={onPress} last={last}
      accessibilityLabel={`${q.name}, ${quotePrice(q)}, ${q.changePct >= 0 ? t('word.up') : t('word.down')} ${formatNumber(Math.abs(q.changePct), 2)} ${t('word.percent')}`}
      right={<View style={{ alignItems: 'flex-end' }}><Text v="body" weight="semibold" num>{quotePrice(q)}</Text><Change pct={q.changePct} v="small" /></View>} />
  );
}
