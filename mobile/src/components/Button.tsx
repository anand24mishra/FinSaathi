import React from 'react';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, TOUCH } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Props = {
  label: string; onPress?: () => void; variant?: Variant; icon?: LucideIcon; loading?: boolean; disabled?: boolean;
  fullWidth?: boolean; accessibilityLabel?: string; hint?: string; style?: ViewStyle; compact?: boolean; selected?: boolean;
};

export function Button({ label, onPress, variant = 'primary', icon: Icon, loading, disabled, fullWidth = true, accessibilityLabel, hint, style, compact, selected }: Props) {
  const { colors } = useTheme();
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.lossBg : variant === 'secondary' ? colors.surface : 'transparent';
  const fg = variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.loss : colors.primary;
  const border = variant === 'secondary' ? colors.primary : variant === 'danger' ? colors.loss : 'transparent';
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!off, busy: !!loading, selected }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        {
          minHeight: compact ? 48 : TOUCH, paddingHorizontal: space.xl, borderRadius: radius.md, borderWidth: 1.5, borderColor: border,
          backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm,
          alignSelf: fullWidth ? 'stretch' : 'flex-start', opacity: off ? 0.55 : pressed ? 0.85 : hovered ? 0.94 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : Icon ? <Icon size={22} color={fg} strokeWidth={2} /> : null}
      <View style={{ flexShrink: 1 }}>
        <Text v="bodyLg" weight="semibold" style={{ color: fg, textAlign: 'center' }}>{label}</Text>
      </View>
    </Pressable>
  );
}
