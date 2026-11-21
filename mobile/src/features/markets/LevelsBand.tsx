import React from 'react';
import { View } from 'react-native';
import type { Analysis } from '@/api/contract';
import { Text } from '@/components/Text';
import { Banner } from '@/components/Banner';
import { useTheme } from '@/theme/ThemeProvider';
import { useT } from '@/i18n';
import { formatPrice } from '@/lib/format';
import { radius, space } from '@/theme/tokens';

type Levels = NonNullable<Analysis['levels']>;

/** Illustrative entry / target / stop-loss zones on one scale. Every zone is also written out in words. */
export function LevelsBand({ levels }: { levels: Levels }) {
  const { colors } = useTheme();
  const t = useT();
  const lo = Math.min(levels.stopLoss, levels.entryLow), hi = Math.max(levels.targetHigh, levels.entryHigh);
  const span = hi - lo || 1;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / span) * 100))}%` as const;
  const w = (a: number, b: number) => `${Math.max(1.5, ((b - a) / span) * 100)}%` as const;
  const zones = [
    { key: 'stop', label: t('levels.stop'), a: levels.stopLoss, b: levels.stopLoss, text: formatPrice(levels.stopLoss), bg: colors.loss },
    { key: 'entry', label: t('levels.entry'), a: levels.entryLow, b: levels.entryHigh, text: `${formatPrice(levels.entryLow)} – ${formatPrice(levels.entryHigh)}`, bg: colors.primary },
    { key: 'target', label: t('levels.target'), a: levels.targetLow, b: levels.targetHigh, text: `${formatPrice(levels.targetLow)} – ${formatPrice(levels.targetHigh)}`, bg: colors.gain },
  ];
  return (
    <View style={{ gap: space.md }}>
      <Text v="label" weight="semibold" tone="soft">{t('levels.title')}</Text>
      <Banner tone="caution" title={t('levels.illustrative')} body={levels.basis} />
      <View accessible accessibilityRole="image" accessibilityLabel={zones.map((z) => `${z.label} ${z.text}`).join('. ')} style={{ gap: 10 }}>
        {zones.map((z) => (
          <View key={z.key} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
              <Text v="label" weight="semibold">{z.label}</Text>
              <Text v="label" num>{z.text}</Text>
            </View>
            <View style={{ height: 14, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm }}>
              <View style={{ position: 'absolute', left: pos(z.a), width: w(z.a, z.b), top: 0, bottom: 0, backgroundColor: z.bg, borderRadius: radius.sm, minWidth: 6 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
