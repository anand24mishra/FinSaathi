// Pure technical analytics. No I/O. All functions tolerate short inputs by returning null.

export const sma = (v: number[], n: number): number | null => {
  if (v.length < n || n <= 0) return null;
  let s = 0; for (let i = v.length - n; i < v.length; i++) s += v[i];
  return s / n;
};

/** EMA series seeded with the SMA of the first n values (standard). Returns array aligned to input (leading nulls trimmed: length = v.length - n + 1). */
export const emaSeries = (v: number[], n: number): number[] => {
  if (v.length < n) return [];
  const k = 2 / (n + 1);
  let e = v.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const out = [e];
  for (let i = n; i < v.length; i++) { e = v[i] * k + e * (1 - k); out.push(e); }
  return out;
};
export const ema = (v: number[], n: number): number | null => { const s = emaSeries(v, n); return s.length ? s[s.length - 1] : null; };

/** Wilder RSI. */
export const rsi = (v: number[], n = 14): number | null => {
  if (v.length < n + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; if (d >= 0) g += d; else l -= d; }
  let ag = g / n, al = l / n;
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    ag = (ag * (n - 1) + (d > 0 ? d : 0)) / n;
    al = (al * (n - 1) + (d < 0 ? -d : 0)) / n;
  }
  if (al === 0) return ag === 0 ? 50 : 100;
  return 100 - 100 / (1 + ag / al);
};

export const macd = (v: number[], fast = 12, slow = 26, sig = 9): { macd: number; signal: number; hist: number } | null => {
  if (v.length < slow + sig) return null;
  const ef = emaSeries(v, fast), es = emaSeries(v, slow);
  // align: ef index i corresponds to v index i+fast-1 ; es index j to v index j+slow-1
  const offset = slow - fast;
  const line: number[] = es.map((x, j) => ef[j + offset] - x);
  const s = emaSeries(line, sig);
  if (!s.length) return null;
  const m = line[line.length - 1], sg = s[s.length - 1];
  return { macd: m, signal: sg, hist: m - sg };
};

/** Wilder ATR. */
export const atr = (h: number[], l: number[], c: number[], n = 14): number | null => {
  if (c.length < n + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < c.length; i++) tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  let a = tr.slice(0, n).reduce((x, y) => x + y, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
};

/** Annualised volatility in % (sample stdev of daily log returns * sqrt(252)). */
export const annualisedVolatilityPct = (c: number[], periodsPerYear = 252): number | null => {
  if (c.length < 21) return null;
  const r: number[] = [];
  for (let i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const varr = r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(varr) * Math.sqrt(periodsPerYear) * 100;
};

/** Max peak-to-trough fall in %, returned as a positive number. */
export const maxDrawdownPct = (c: number[]): number | null => {
  if (c.length < 2) return null;
  let peak = c[0], mdd = 0;
  for (const x of c) { if (x > peak) peak = x; const d = (peak - x) / peak; if (d > mdd) mdd = d; }
  return mdd * 100;
};

/** Swing-pivot support/resistance: pivots are bars whose low/high is extreme within ±w bars. Nearest below/above current price. */
export const supportResistance = (h: number[], l: number[], c: number[], w = 5, lookback = 180): { support: number | null; resistance: number | null } => {
  const n = c.length; if (n < 2 * w + 3) return { support: null, resistance: null };
  const price = c[n - 1], start = Math.max(w, n - lookback);
  const lows: number[] = [], highs: number[] = [];
  for (let i = start; i < n - w; i++) {
    let isLow = true, isHigh = true;
    for (let j = i - w; j <= i + w; j++) { if (l[j] < l[i]) isLow = false; if (h[j] > h[i]) isHigh = false; }
    if (isLow) lows.push(l[i]);
    if (isHigh) highs.push(h[i]);
  }
  const below = lows.filter((x) => x < price), above = highs.filter((x) => x > price);
  const recent = Math.min(60, n);
  const support = below.length ? Math.max(...below) : Math.min(...l.slice(n - recent));
  const resistance = above.length ? Math.min(...above) : Math.max(...h.slice(n - recent));
  return { support: support < price ? support : null, resistance: resistance > price ? resistance : null };
};

export type Trend = 'up' | 'down' | 'sideways';
export const classifyTrend = (price: number, sma50: number | null, sma200: number | null): Trend => {
  if (sma50 == null) return 'sideways';
  if (sma200 != null) {
    if (price > sma50 && sma50 > sma200) return 'up';
    if (price < sma50 && sma50 < sma200) return 'down';
    return 'sideways';
  }
  return price > sma50 * 1.02 ? 'up' : price < sma50 * 0.98 ? 'down' : 'sideways';
};

export const cagrPct = (start: number, end: number, years: number): number | null =>
  start > 0 && end > 0 && years > 0 ? (Math.pow(end / start, 1 / years) - 1) * 100 : null;

export interface CashFlow { t: number /* epoch ms */; amount: number /* negative = outflow */ }
/** XIRR (annualised, actual/365) by Newton with bisection fallback. Returns a fraction (0.12 = 12%) or null. */
export const xirr = (flows: CashFlow[]): number | null => {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const t0 = Math.min(...flows.map((f) => f.t));
  const yrs = flows.map((f) => (f.t - t0) / (365 * 86400_000));
  const f = (r: number) => flows.reduce((s, cf, i) => s + cf.amount / Math.pow(1 + r, yrs[i]), 0);
  const df = (r: number) => flows.reduce((s, cf, i) => s - (yrs[i] * cf.amount) / Math.pow(1 + r, yrs[i] + 1), 0);
  let r = 0.1;
  for (let i = 0; i < 60; i++) {
    const v = f(r), d = df(r);
    if (!isFinite(v) || !isFinite(d) || d === 0) break;
    const nr = r - v / d;
    if (nr <= -0.9999) { r = (r - 0.9999) / 2; continue; }
    if (Math.abs(nr - r) < 1e-10) return nr;
    r = nr;
  }
  let lo = -0.99, hi = 10;
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
};

export const pctChange = (from: number | null | undefined, to: number | null | undefined): number | null =>
  from != null && to != null && from !== 0 ? ((to - from) / from) * 100 : null;
