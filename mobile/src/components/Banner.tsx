import React from 'react';
import { View } from 'react-native';
import { AlertTriangle, Info, WifiOff, type LucideIcon } from 'lucide-react-native';
import { Text } from './Text';
import { Button } from './Button';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export function Banner({ tone = 'info', title, body, actionLabel, onAction, icon, loading }: {
  tone?: 'info' | 'caution' | 'error' | 'offline'; title: string; body?: string; actionLabel?: string; onAction?: () => void; icon?: LucideIcon; loading?: boolean;
}) {
  const { colors } = useTheme();
  const bg = tone === 'error' ? colors.lossBg : tone === 'caution' || tone === 'offline' ? colors.cautionBg : colors.primarySoft;
  const fg = tone === 'error' ? colors.loss : tone === 'caution' || tone === 'offline' ? colors.caution : colors.primary;
  const Icon = icon ?? (tone === 'offline' ? WifiOff : tone === 'info' ? Info : AlertTriangle);
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ backgroundColor: bg, borderRadius: radius.md, padding: space.lg, gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
        <View style={{ marginTop: 3 }}><Icon size={22} color={fg} strokeWidth={2} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text v="body" weight="semibold" style={{ color: fg }}>{title}</Text>
          {body ? <Text v="label" tone="ink">{body}</Text> : null}
        </View>
      </View>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" compact loading={loading} fullWidth={false} /> : null}
    </View>
  );
}
