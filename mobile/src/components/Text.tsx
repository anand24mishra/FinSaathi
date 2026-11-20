import React from 'react';
import { Platform, Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { useType, type Variant, type Weight } from '@/theme/type';
import type { Palette } from '@/theme/tokens';

export type Tone = 'ink' | 'soft' | 'primary' | 'onPrimary' | 'gain' | 'loss' | 'caution' | 'accent';
const toneKey: Record<Tone, keyof Palette> = { ink: 'ink', soft: 'inkSoft', primary: 'primary', onPrimary: 'onPrimary', gain: 'gain', loss: 'loss', caution: 'caution', accent: 'accent' };

type Props = TextProps & { v?: Variant; weight?: Weight; tone?: Tone; num?: boolean; center?: boolean; style?: TextStyle | TextStyle[] | (TextStyle | false | undefined)[] };

const defaultWeight: Record<Variant, Weight> = { display: 'bold', h1: 'bold', h2: 'semibold', h3: 'semibold', bodyLg: 'regular', body: 'regular', label: 'medium', small: 'regular', money: 'semibold' };

/** The only text primitive. Size comes from the global type scale; money uses tabular numerals. */
export function Text({ v = 'body', weight, tone = 'ink', num, center, style, children, ...rest }: Props) {
  const { colors } = useTheme();
  const t = useType();
  const size = t.size(v);
  const w = weight ?? defaultWeight[v];
  const s: TextStyle = {
    color: colors[toneKey[tone]] as string,
    fontFamily: t.family[w],
    fontSize: size,
    lineHeight: t.lineHeight(size),
    ...(Platform.OS === 'web' ? ({ fontWeight: 'normal' } as TextStyle) : null),
    ...(num || v === 'money' ? { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] } : null),
    ...(center ? { textAlign: 'center' } : null),
  };
  const heading = v === 'display' || v === 'h1' || v === 'h2' || v === 'h3';
  return (
    <RNText accessibilityRole={heading ? 'header' : undefined} {...(heading ? ({ 'aria-level': v === 'h2' ? 2 : v === 'h3' ? 3 : 1 } as object) : null)} {...rest} style={[s, ...(Array.isArray(style) ? style : [style])] as TextStyle[]}>
      {children}
    </RNText>
  );
}
