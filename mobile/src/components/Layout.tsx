import React from 'react';
import { Box } from '../../components/ui/box';
import { Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Text, type Tone } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { DESKTOP_BP, radius, space } from '@/theme/tokens';

export function useLayout() {
  const { width } = useWindowDimensions();
  return { width, isDesktop: width >= DESKTOP_BP, isWide: width >= 720, gutter: width >= 720 ? space.xl : space.lg };
}

/** Flat paper surface separated by a hairline. No shadow. */
export function Panel({ children, style, pad = true }: { children: React.ReactNode; style?: ViewStyle; pad?: boolean }) {
  const { colors } = useTheme();
  // gluestack's web Box hands `style` straight to the DOM, so give it one flat object (not an array).
  return <Box style={StyleSheet.flatten([{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: pad ? space.lg : 0 }, style])}>{children}</Box>;
}

export function Section({ title, children, aside, style, id }: { title?: string; children: React.ReactNode; aside?: React.ReactNode; style?: ViewStyle; id?: string }) {
  return (
    <View style={[{ marginTop: space.xxl }, style]} nativeID={id}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md, gap: space.md, flexWrap: 'wrap' }}>
          <Text v="h3" style={{ flexShrink: 1 }}>{title}</Text>
          {aside}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Hairline({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[{ height: 1, backgroundColor: colors.line }, style]} />;
}

type RowProps = {
  title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; icon?: LucideIcon; chevron?: boolean; last?: boolean;
  tone?: Tone; accessibilityLabel?: string; children?: React.ReactNode; titleLines?: number; hint?: string;
};
/** Ledger row: title + subtitle left, value right, hairline between rows. */
export function Row({ title, subtitle, right, onPress, icon: Icon, chevron, last, tone = 'ink', accessibilityLabel, children, titleLines, hint }: RowProps) {
  const { colors } = useTheme();
  const inner = (
    <View style={{ paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: onPress ? 56 : undefined }}>
      {Icon ? <Icon size={22} color={colors.inkSoft} strokeWidth={2} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text v="body" weight="medium" tone={tone} numberOfLines={titleLines}>{title}</Text>
        {subtitle ? <Text v="small" tone="soft">{subtitle}</Text> : null}
        {children}
      </View>
      {right ? <View style={{ alignItems: 'flex-end', flexShrink: 0, maxWidth: '45%' }}>{right}</View> : null}
      {chevron && onPress ? <ChevronRight size={20} color={colors.inkSoft} strokeWidth={2} /> : null}
    </View>
  );
  const border = last ? undefined : { borderBottomWidth: 1, borderBottomColor: colors.line };
  if (!onPress) return <View style={border} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>{inner}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')} accessibilityHint={hint}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [border as ViewStyle, { backgroundColor: pressed ? colors.surfaceAlt : hovered ? colors.surfaceAlt : 'transparent' }]}>
      {inner}
    </Pressable>
  );
}

export function Stack({ children, gap = space.md, style }: { children: React.ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}
export function Cluster({ children, gap = space.sm, style }: { children: React.ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap }, style]}>{children}</View>;
}
