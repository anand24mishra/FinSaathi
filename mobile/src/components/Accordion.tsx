import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Large (56px+) collapsible row with chevron and expanded state for assistive tech. */
export function Accordion({ title, children, open: initial = false, meta, heading = false }: { title: string; children: React.ReactNode; open?: boolean; meta?: React.ReactNode; heading?: boolean }) {
  const [open, setOpen] = useState(initial);
  const { colors } = useTheme();
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title}
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingVertical: space.md }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text v={heading ? 'h3' : 'bodyLg'} weight="semibold" accessibilityRole={undefined}>{title}</Text>
          {meta}
        </View>
        <Icon size={24} color={colors.inkSoft} strokeWidth={2} />
      </Pressable>
      {open ? <View style={{ paddingBottom: space.lg, gap: space.sm }}>{children}</View> : null}
    </View>
  );
}
