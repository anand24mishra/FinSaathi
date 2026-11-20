import type { Lang } from '@/api/contract';

const MINUS = '−';

/** Indian digit grouping: 1234567.8 -> 12,34,567.8 */
export function groupIndian(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

export function formatNumber(n: number, decimals = 0): string {
  if (!isFinite(n)) return '—';
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [i, d] = fixed.split('.');
  const out = groupIndian(i) + (d ? `.${d}` : '');
  return neg ? MINUS + out : out;
}

export function formatINR(n: number | null | undefined, decimals = 0): string {
  if (n == null || !isFinite(n)) return '—';
  const neg = n < 0;
  const s = formatNumber(Math.abs(n), decimals);
  return `${neg ? MINUS : ''}₹${s}`;
}

/** Price: 2 decimals under 1000 else up to 2. */
export function formatPrice(n: number | null | undefined): string {
  return formatINR(n, 2);
}

export function formatSigned(n: number, decimals = 2): string {
  const s = formatNumber(Math.abs(n), decimals);
  return n > 0 ? `+${s}` : n < 0 ? `${MINUS}${s}` : s;
}
export function formatSignedINR(n: number, decimals = 0): string {
  const s = formatINR(Math.abs(n), decimals);
  return n > 0 ? `+${s}` : n < 0 ? `${MINUS}${s}` : s;
}
export function formatPct(n: number | null | undefined, decimals = 2, signed = true): string {
  if (n == null || !isFinite(n)) return '—';
  const s = formatNumber(Math.abs(n), decimals) + '%';
  if (!signed) return (n < 0 ? MINUS : '') + s;
  return n > 0 ? `+${s}` : n < 0 ? `${MINUS}${s}` : s;
}

/** "₹1.25 lakh" / "₹1.25 लाख". Returns null when the amount is under 1 lakh (no help needed). */
export function lakhCrore(n: number, lang: Lang): string | null {
  const a = Math.abs(n);
  const sign = n < 0 ? MINUS : '';
  const trim = (v: number) => String(parseFloat(v.toFixed(2)));
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)} ${lang === 'hi' ? 'करोड़' : 'crore'}`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)} ${lang === 'hi' ? 'लाख' : 'lakh'}`;
  return null;
}

export function simpleAmount(n: number, lang: Lang): string | null {
  const w = lakhCrore(n, lang);
  if (!w) return null;
  return `${lang === 'hi' ? 'थोड़ा सरल' : 'In simple words'}: ${w}`;
}

/** Market cap given in crores of rupees. */
export function formatCrore(cr: number | null | undefined, lang: Lang): string {
  if (cr == null) return '—';
  if (cr >= 1e5) return `₹${formatNumber(cr / 1e5, 2)} ${lang === 'hi' ? 'लाख करोड़' : 'lakh crore'}`;
  return `₹${formatNumber(cr, 0)} ${lang === 'hi' ? 'करोड़' : 'crore'}`;
}

const LOCALE: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN' };

export function parseDate(v: string | number | Date): Date {
  return v instanceof Date ? v : new Date(v);
}
export function formatDate(v: string | number | Date, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  try { return new Intl.DateTimeFormat(LOCALE[lang], opts).format(parseDate(v)); } catch { return String(v); }
}
export function formatDay(v: string | number | Date, lang: Lang): string {
  return formatDate(v, lang, { weekday: 'long', day: 'numeric', month: 'long' });
}
export function formatTime(v: string | number | Date, lang: Lang): string {
  return formatDate(v, lang, { hour: 'numeric', minute: '2-digit', hour12: true });
}
export function formatDateTime(v: string | number | Date, lang: Lang): string {
  return formatDate(v, lang, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Relative age: "5 min ago" / "5 मिनट पहले". */
export function timeAgo(v: string | number | Date, lang: Lang, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - parseDate(v).getTime()) / 60000));
  if (mins < 1) return lang === 'hi' ? 'अभी' : 'just now';
  if (mins < 60) return lang === 'hi' ? `${mins} मिनट पहले` : `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return lang === 'hi' ? `${h} घंटे पहले` : `${h} h ago`;
  const d = Math.round(h / 24);
  return lang === 'hi' ? `${d} दिन पहले` : `${d} d ago`;
}

export const MINUS_SIGN = MINUS;
