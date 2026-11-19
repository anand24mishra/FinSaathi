import { useApp } from '@/state/AppState';

export type TextScale = 1 | 1.15 | 1.3;
export const TEXT_SCALES: TextScale[] = [1, 1.15, 1.3];
export const MIN_FONT = 14;

export type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyLg' | 'small' | 'label' | 'money';
export const BASE_SIZE: Record<Variant, number> = { display: 34, h1: 30, h2: 26, h3: 22, bodyLg: 20, body: 18, label: 16, small: 14, money: 18 };

export function nextScale(s: TextScale): TextScale {
  return TEXT_SCALES[(TEXT_SCALES.indexOf(s) + 1) % TEXT_SCALES.length];
}
export function prevScale(s: TextScale): TextScale {
  return TEXT_SCALES[Math.max(0, TEXT_SCALES.indexOf(s) - 1)];
}
export function fontSizeFor(variant: Variant, scale: number): number {
  return Math.max(MIN_FONT, Math.round(BASE_SIZE[variant] * scale));
}
export function lineHeightFor(size: number, lang: 'en' | 'hi'): number {
  return Math.round(size * (lang === 'hi' ? 1.55 : 1.42));
}
export const FONT_FAMILY = { regular: 'Hind_400Regular', medium: 'Hind_500Medium', semibold: 'Hind_600SemiBold', bold: 'Hind_700Bold' } as const;
export type Weight = keyof typeof FONT_FAMILY;

/** Global type scale: every text uses this, driven by the profile's textScale. */
export function useType() {
  const { textScale, lang } = useApp();
  return {
    scale: textScale,
    size: (v: Variant) => fontSizeFor(v, textScale),
    lineHeight: (size: number) => lineHeightFor(size, lang),
    family: FONT_FAMILY,
  };
}
