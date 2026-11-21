import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { useT } from '@/i18n';
import { space } from '@/theme/tokens';
import type { Quote } from '@/api/contract';
import type { LiveStatus } from './LiveProvider';

/** Honest freshness: LIVE only while the socket is connected AND the market is open; otherwise says why not. */
export function LiveBadge({ status, quote, note }: { status: LiveStatus; quote?: Quote | null; note?: string }) {
  const { colors } = useTheme(); const t = useT();
  const closed = quote?.marketState === 'closed';
  const live = status === 'live' && !closed;
  const label = status === 'connecting' || status === 'reconnecting' ? t('live.reconnecting') : status === 'polling' ? t('live.polling') : closed ? t('live.closed') : status === 'live' ? t('live.live') : t('live.idle');
  const color = live ? colors.gain : status === 'polling' || status === 'reconnecting' ? colors.caution : colors.inkSoft;
  return (
    <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text v="small" weight="bold" style={{ color, letterSpacing: 0.6 }}>{label}</Text>
      {note && live ? <Text v="small" tone="soft">· {note}</Text> : null}
    </View>
  );
}
