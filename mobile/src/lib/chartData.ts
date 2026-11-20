import type { Lang, SeriesPoint } from '@/api/contract';
import { formatDate, formatNumber, formatPct } from './format';

export type SeriesStats = { first: SeriesPoint; last: SeriesPoint; high: SeriesPoint; low: SeriesPoint; changePct: number; direction: 'up' | 'down' | 'flat' };

export function seriesStats(points: SeriesPoint[]): SeriesStats | null {
  if (!points || points.length < 2) return null;
  let high = points[0], low = points[0];
  for (const p of points) { if (p.c > high.c) high = p; if (p.c < low.c) low = p; }
  const first = points[0], last = points[points.length - 1];
  const changePct = first.c ? ((last.c - first.c) / first.c) * 100 : 0;
  return { first, last, high, low, changePct, direction: Math.abs(changePct) < 0.005 ? 'flat' : changePct > 0 ? 'up' : 'down' };
}

/** Plain-language text alternative for a chart, for screen readers and as visible summary. */
export function summarizeSeries(points: SeriesPoint[], lang: Lang, label = '', unit = '₹'): string {
  const s = seriesStats(points);
  if (!s) return lang === 'hi' ? 'चार्ट के लिए पर्याप्त आँकड़े नहीं हैं।' : 'Not enough data to draw a chart.';
  const v = (n: number) => `${unit}${formatNumber(n, 2)}`;
  const d = (t: number) => formatDate(t, lang, { day: 'numeric', month: 'short', year: 'numeric' });
  const dirWord = s.direction === 'up' ? (lang === 'hi' ? 'ऊपर' : 'up') : s.direction === 'down' ? (lang === 'hi' ? 'नीचे' : 'down') : (lang === 'hi' ? 'लगभग स्थिर' : 'flat');
  const pct = formatPct(Math.abs(s.changePct), 1, false);
  if (lang === 'hi') {
    return `${label ? label + ': ' : ''}${d(s.first.t)} से ${d(s.last.t)} तक ${v(s.first.c)} से ${v(s.last.c)}, यानी ${pct} ${dirWord}। सबसे ऊँचा ${v(s.high.c)} (${d(s.high.t)}), सबसे नीचा ${v(s.low.c)} (${d(s.low.t)})।`;
  }
  return `${label ? label + ': ' : ''}From ${d(s.first.t)} to ${d(s.last.t)} it moved from ${v(s.first.c)} to ${v(s.last.c)}, ${dirWord} ${pct}. Highest ${v(s.high.c)} on ${d(s.high.t)}, lowest ${v(s.low.c)} on ${d(s.low.t)}.`;
}

/** Downsample to at most n points, always keeping first and last. */
export function downsample(points: SeriesPoint[], n: number): SeriesPoint[] {
  if (points.length <= n) return points;
  const step = (points.length - 1) / (n - 1);
  const out: SeriesPoint[] = [];
  for (let i = 0; i < n; i++) out.push(points[Math.round(i * step)]);
  return out;
}
