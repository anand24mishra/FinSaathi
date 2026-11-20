import React from 'react';
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, TOUCH } from '@/theme/tokens';

/** Large radio/checkbox style choice. Selection is shown by a check mark and a heavier border, not colour alone. */
export function Option({ title, body, selected, onPress, multi }: { title: string; body?: string; selected: boolean; onPress: () => void; multi?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected, selected }} accessibilityLabel={body ? `${title}. ${body}` : title}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({
        minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: selected ? 2.5 : 1.5,
        borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? colors.primarySoft : hovered ? colors.surfaceAlt : colors.surface,
      })}>
      <View style={{ width: 28, height: 28, borderRadius: multi ? 6 : 14, borderWidth: 2, borderColor: selected ? colors.primary : colors.inkSoft, backgroundColor: selected ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {selected ? <Check size={18} color={colors.onPrimary} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text v="bodyLg" weight="semibold">{title}</Text>
        {body ? <Text v="label" tone="soft">{body}</Text> : null}
      </View>
    </Pressable>
  );
}
