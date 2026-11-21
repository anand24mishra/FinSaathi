export type Dir = 'A' | 'B' | 'C' | 'D';
export type Mode = 'light' | 'dark';
type Vars = Record<string, string>;
export interface DirTheme {
  key: Dir; name: string; tagline: string; radius: number; font: { display: string; body: string; num: string };
  light: Vars; dark: Vars;
}
const v = (bg: string, surface: string, surface2: string, ink: string, soft: string, line: string, brand: string, onbrand: string, brand2: string, gain: string, gainbg: string, loss: string, lossbg: string, warn: string): Vars =>
  ({ '--bg': bg, '--surface': surface, '--surface2': surface2, '--ink': ink, '--soft': soft, '--line': line, '--brand': brand, '--onbrand': onbrand, '--brand2': brand2, '--gain': gain, '--gainbg': gainbg, '--loss': loss, '--lossbg': lossbg, '--warn': warn });
const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SERIF = 'Georgia, "Times New Roman", "Noto Serif", serif';

export const THEMES: Record<Dir, DirTheme> = {
  A: { key: 'A', name: 'Terminal Noir', tagline: 'Dense, fast, pro. Amber on black.', radius: 4, font: { display: SANS, body: SANS, num: MONO },
    dark: v('#07090C', '#0E1217', '#151B22', '#E8EDF2', '#8A96A3', '#1F2730', '#F5B83D', '#0B0D10', '#2DD4BF', '#34D399', '#0F2A22', '#F87171', '#2E1517', '#F5B83D'),
    light: v('#F3F1EC', '#FFFFFF', '#ECE9E2', '#14171A', '#565F69', '#D9D5CB', '#8A5B00', '#FFFFFF', '#0F766E', '#0B7A4B', '#DDF3E8', '#B42318', '#FBE4E1', '#8A5B00') },
  B: { key: 'B', name: 'Saffron Editorial', tagline: 'A daily newspaper for your money. Indian, warm, trusted.', radius: 2, font: { display: SERIF, body: SANS, num: SANS },
    light: v('#FBF6EC', '#FFFDF8', '#F3EBDA', '#1D1A16', '#615849', '#DDD2BD', '#C2410C', '#FFFFFF', '#7C2D12', '#166534', '#E3F1DF', '#9F1D1D', '#F8E1DC', '#92400E'),
    dark: v('#17130F', '#1F1A14', '#2A231B', '#F4EBDD', '#B3A793', '#3A3126', '#FB923C', '#1A0F05', '#FDBA74', '#6EE7A0', '#14291B', '#FCA5A5', '#351817', '#FBBF24') },
  C: { key: 'C', name: 'Calm Clarity', tagline: 'Big numbers, plain words, lots of air. Made for first-timers.', radius: 20, font: { display: SANS, body: SANS, num: SANS },
    light: v('#F6FAF8', '#FFFFFF', '#EAF3EF', '#0F2A22', '#47635A', '#D6E5DE', '#0B7A5B', '#FFFFFF', '#0E9F78', '#0B7A5B', '#DDF4EA', '#B91C1C', '#FDE8E6', '#A16207'),
    dark: v('#0A1512', '#0F1D19', '#162722', '#E6F4EE', '#9DB8AD', '#223630', '#34D3A0', '#04130E', '#6EE7C0', '#4ADE9A', '#11302A', '#FB8F8F', '#351A1A', '#F0C255') },
  D: { key: 'D', name: 'Midnight Gradient', tagline: 'Glass, glow and momentum. Built for the Gen-Z trader.', radius: 22, font: { display: SANS, body: SANS, num: SANS },
    dark: v('#0B0A1F', '#17163F', '#201F55', '#EEF0FF', '#A3A6D6', '#2E2D6B', '#7C6CFF', '#FFFFFF', '#22D3EE', '#3BE8A0', '#0E3A33', '#FF7B9C', '#3A1230', '#FFC857'),
    light: v('#F2F1FF', '#FFFFFF', '#E8E6FF', '#17153A', '#55588C', '#D5D2F5', '#5B45F5', '#FFFFFF', '#0891B2', '#087F5B', '#D9F7EC', '#C21F4D', '#FDE3EA', '#A16207') },
};
