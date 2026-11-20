import React from 'react';
import { View } from 'react-native';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react-native';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { useApp } from '@/state/AppState';
import { formatPct, formatSigned, formatSignedINR } from '@/lib/format';
import type { Variant } from '@/theme/type';

/** Gain/loss: sign + arrow icon + colour; accessibility label spells out up/down. Never colour-only. */
export function Change({ value, pct, inr, v = 'label', hideValue, prefix }: { value?: number | null; pct?: number | null; inr?: boolean; v?: Variant; hideValue?: boolean; prefix?: string }) {
  const { colors } = useTheme();
  const { lang } = useApp();
  const base = pct ?? value;
  if (base == null || !isFinite(base)) return <Text v={v} tone="soft">—</Text>;
  const dir = Math.abs(base) < 0.005 ? 0 : base > 0 ? 1 : -1;
  const tone = dir > 0 ? 'gain' : dir < 0 ? 'loss' : 'soft';
  const color = dir > 0 ? colors.gain : dir < 0 ? colors.loss : colors.inkSoft;
  const Icon = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus;
  const parts: string[] = [];
  if (value != null && !hideValue) parts.push(inr ? formatSignedINR(value, 2) : formatSigned(value));
  if (pct != null) parts.push(formatPct(pct));
  const text = parts.length > 1 ? `${parts[0]} (${parts[1]})` : parts[0];
  const word = dir > 0 ? (lang === 'hi' ? 'ऊपर' : 'up') : dir < 0 ? (lang === 'hi' ? 'नीचे' : 'down') : (lang === 'hi' ? 'अपरिवर्तित' : 'unchanged');
  const spoken = (prefix ? prefix + ' ' : '') + `${word} ${parts.map((p) => p.replace(/^[+−-]/, '')).join(', ')}`;
  return (
    <View accessible accessibilityLabel={spoken} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
      <Icon size={18} color={color} strokeWidth={2.5} />
      <Text v={v} weight="semibold" tone={tone} num>{text}</Text>
    </View>
  );
}
