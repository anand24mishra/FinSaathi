// Indian-style number formatting helpers (exported for reuse by other modules / the app layer).
import type { Lang } from '../../../shared/contract';

/** 1234567.8 -> "12,34,567.80" (Indian digit grouping) */
export function groupIndian(n: number, decimals = 0): string {
  const neg = n < 0; const s = Math.abs(n).toFixed(decimals);
  const [ip, fp] = s.split('.');
  let out: string;
  if (ip.length <= 3) out = ip;
  else out = ip.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + ip.slice(-3);
  return (neg ? '-' : '') + out + (fp ? '.' + fp : '');
}
export const inr = (n: number, decimals = 2): string => '₹' + groupIndian(n, decimals);
export const inrRound = (n: number): string => '₹' + groupIndian(n, Math.abs(n) >= 1000 ? 0 : 2);

/** Plain-language amount: 2500000 -> "25 lakh", 12e7 -> "12 crore" (en) / "25 लाख", "12 करोड़" (hi). Rounded to 2 decimals max. */
export function lakhCrore(n: number, lang: Lang): string {
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  const f = (x: number) => String(+x.toFixed(2));
  if (a >= 1e7) return `${sign}${f(a / 1e7)} ${lang === 'hi' ? 'करोड़' : 'crore'}`;
  if (a >= 1e5) return `${sign}${f(a / 1e5)} ${lang === 'hi' ? 'लाख' : 'lakh'}`;
  if (a >= 1e3 && lang === 'hi') return `${sign}${f(a / 1e3)} हज़ार`;
  return sign + groupIndian(a, a % 1 ? 2 : 0);
}
export const inrWords = (n: number, lang: Lang): string => '₹' + lakhCrore(n, lang);
export const signed = (n: number, d = 2): string => (n > 0 ? '+' : '') + n.toFixed(d);
export const pct = (n: number | null | undefined, d = 1): string => (n == null ? '—' : `${n.toFixed(d)}%`);
export const spct = (n: number | null | undefined, d = 2): string => (n == null ? '—' : `${signed(n, d)}%`);

/** Convert Devanagari digits to ASCII. */
export const asciiDigits = (s: string): string => s.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)));

/** Clean text for text-to-speech: drop symbols/URLs/emoji, expand ₹ and %, speak Indian magnitude. */
export function toSpeech(text: string, lang: Lang): string {
  let s = text;
  s = s.replace(/https?:\/\/\S+/g, ' ');
  s = s.replace(/₹\s?([\d,]+(?:\.\d+)?)\s*(crore|lakh|करोड़|लाख)/gi, (_m, num, unit) => `${num.replace(/,/g, '')} ${unit} ${lang === 'hi' ? 'रुपये' : 'rupees'}`);
  s = s.replace(/₹\s?([\d,]+(?:\.\d+)?)/g, (_m, num) => `${num.replace(/,/g, '')} ${lang === 'hi' ? 'रुपये' : 'rupees'}`);
  s = s.replace(/(-?[\d.]+)\s?%/g, (_m, n) => `${n.startsWith('-') ? (lang === 'hi' ? 'ऋण ' : 'minus ') + n.slice(1) : n} ${lang === 'hi' ? 'प्रतिशत' : 'percent'}`);
  s = s.replace(/\+(\d)/g, (_m, d) => (lang === 'hi' ? 'धन ' : 'plus ') + d);
  s = s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}•·▲▼↑↓→←*_#`~^|]/gu, ' ');
  s = s.replace(/\s*[()[\]{}]\s*/g, ', ');
  s = s.replace(/\s+[-–—]\s+/g, ', ');
  s = s.replace(/([।.!?])\s*\./g, '$1').replace(/\s+/g, ' ').replace(/\s+([,.;:!?।])/g, '$1').replace(/,\s*,/g, ',').trim();
  return s;
}
