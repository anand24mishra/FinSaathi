import React from 'react';
import { Pressable, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text, type Tone } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** Selectable chip (filters, quick picks). */
export function Chip({ label, selected, onPress, icon: Icon, accessibilityLabel }: { label: string; selected?: boolean; onPress?: () => void; icon?: LucideIcon; accessibilityLabel?: string }) {
  const { colors } = useTheme();
  const fg = selected ? colors.onPrimary : colors.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: !!selected }}
      style={({ pressed }: { pressed: boolean }) => ({
        minHeight: 52, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
        borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? colors.primary : colors.surface, opacity: pressed ? 0.85 : 1,
      })}>
      {Icon ? <Icon size={18} color={fg} strokeWidth={2} /> : null}
      <Text v="label" style={{ color: fg }}>{label}</Text>
    </Pressable>
  );
}

/** Small non-interactive status label: always text, optionally with an icon. */
export function Tag({ label, tone = 'soft', icon: Icon }: { label: string; tone?: Tone; icon?: LucideIcon }) {
  const { colors } = useTheme();
  const bg = tone === 'gain' ? colors.gainBg : tone === 'loss' ? colors.lossBg : tone === 'caution' ? colors.cautionBg : tone === 'primary' ? colors.primarySoft : colors.surfaceAlt;
  const fgColor = tone === 'gain' ? colors.gain : tone === 'loss' ? colors.loss : tone === 'caution' ? colors.caution : tone === 'primary' ? colors.primary : colors.inkSoft;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      {Icon ? <Icon size={16} color={fgColor} strokeWidth={2.25} /> : null}
      <Text v="small" weight="semibold" tone={tone === 'soft' ? 'soft' : tone as Tone}>{label}</Text>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: sel }} accessibilityLabel={o.label}
            style={{ minHeight: 52, paddingHorizontal: space.lg, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: sel ? colors.primary : 'transparent' }}>
            <Text v="bodyLg" weight={sel ? 'bold' : 'medium'} tone={sel ? 'primary' : 'soft'}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
