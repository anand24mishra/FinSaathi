export type Palette = {
  bg: string; surface: string; surfaceAlt: string; ink: string; inkSoft: string; line: string;
  primary: string; onPrimary: string; primarySoft: string; accent: string;
  gain: string; gainBg: string; loss: string; lossBg: string; caution: string; cautionBg: string;
  overlay: string; focus: string;
};

// Calm Clarity: emerald on soft green-white, big numbers, lots of air. (Chosen from the Design Lab, direction C.)
export const light: Palette = {
  bg: '#F6FAF8', surface: '#FFFFFF', surfaceAlt: '#EAF3EF', ink: '#0F2A22', inkSoft: '#47635A', line: '#D6E5DE',
  primary: '#0B7A5B', onPrimary: '#FFFFFF', primarySoft: '#DDF4EA', accent: '#A16207',
  gain: '#0B7A5B', gainBg: '#DDF4EA', loss: '#B91C1C', lossBg: '#FDE8E6', caution: '#8A5A00', cautionBg: '#FFF1D6',
  overlay: 'rgba(15,42,34,0.5)', focus: '#0B7A5B',
};

export const dark: Palette = {
  bg: '#0A1512', surface: '#0F1D19', surfaceAlt: '#162722', ink: '#E6F4EE', inkSoft: '#9DB8AD', line: '#223630',
  primary: '#34D3A0', onPrimary: '#04130E', primarySoft: '#11302A', accent: '#F0C255',
  gain: '#4ADE9A', gainBg: '#11302A', loss: '#FB8F8F', lossBg: '#351A1A', caution: '#F0C255', cautionBg: '#3A2C0E',
  overlay: 'rgba(0,0,0,0.65)', focus: '#34D3A0',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
export const TOUCH = 56;
export const MAX_WIDTH = 1100;
export const DESKTOP_BP = 1024;

export function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
