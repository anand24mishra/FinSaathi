// Yahoo Finance chart adapter (UNOFFICIAL, no key). Local prototype only; replace with a licensed feed in production.
// Quirk: Yahoo answers 429 to long browser-style User-Agent strings from some networks but accepts a short one.
import { getJson, Limiter, TtlCache, TTL } from '../http';
import type { ChartData, ChartMeta, Candle, ChartProvider } from './types';
import type { Range } from '../../../../shared/contract';

export const YAHOO_SOURCE = 'Yahoo Finance (unofficial)';
export const YAHOO_UA = 'Mozilla/5.0';
const limiter = new Limiter(4);
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

export function parseChart(json: any, symbol: string): ChartData {
  const r = json?.chart?.result?.[0];
  if (!r || !r.meta) throw new Error(`Yahoo: no chart result for ${symbol}${json?.chart?.error?.description ? ' (' + json.chart.error.description + ')' : ''}`);
  const ts: number[] = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c == null || !isFinite(c)) continue;
    candles.push({ t: ts[i] * 1000, o: q.open?.[i] ?? c, h: q.high?.[i] ?? c, l: q.low?.[i] ?? c, c, v: q.volume?.[i] ?? 0 });
  }
  const m = r.meta;
  const price: number = m.regularMarketPrice ?? candles[candles.length - 1]?.c;
  if (price == null || !isFinite(price)) throw new Error(`Yahoo: no price for ${symbol}`);
  const marketTime = (m.regularMarketTime ?? ts[ts.length - 1] ?? 0) * 1000;
  // previous close = close of the candle before the latest trading day's candle (chartPreviousClose is range-start for multi-day ranges)
  let prevClose: number | null = null;
  const n = candles.length;
  if (n >= 2) {
    const lastDay = dayKey(candles[n - 1].t, m.gmtoffset ?? 0);
    const mktDay = dayKey(marketTime, m.gmtoffset ?? 0);
    prevClose = lastDay === mktDay ? candles[n - 2].c : candles[n - 1].c;
  }
  if (prevClose == null && typeof m.previousClose === 'number') prevClose = m.previousClose;
  const reg = m.currentTradingPeriod?.regular;
  const nowS = Date.now() / 1000;
  let marketState: ChartMeta['marketState'] = 'unknown';
  if (reg && typeof reg.start === 'number' && !String(symbol).includes('=')) {
    marketState = nowS >= reg.start && nowS <= reg.end && Date.now() - marketTime < 20 * 60_000 ? 'open' : 'closed';
  }
  return {
    meta: {
      symbol: m.symbol ?? symbol, name: m.longName ?? m.shortName ?? symbol, currency: m.currency ?? 'INR', exchange: m.fullExchangeName ?? null,
      price, prevClose, dayHigh: m.regularMarketDayHigh ?? null, dayLow: m.regularMarketDayLow ?? null,
      fiftyTwoWeekHigh: m.fiftyTwoWeekHigh ?? null, fiftyTwoWeekLow: m.fiftyTwoWeekLow ?? null, marketTime, marketState,
    },
    candles, fetchedAt: Date.now(),
  };
}
const dayKey = (ms: number, off: number) => Math.floor((ms / 1000 + off) / 86400);

function params(range: Range | '5d' | '1d') {
  const interval = range === '5y' ? '1wk' : '1d';
  return `range=${range}&interval=${interval}`;
}

export const yahooChart: ChartProvider = {
  async chart(symbol, range) {
    let lastErr: unknown;
    for (const host of HOSTS) {
      try {
        const json = await getJson(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${params(range)}`, { headers: { 'User-Agent': YAHOO_UA }, limiter });
        return parseChart(json, symbol);
      } catch (e) { lastErr = e; }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Yahoo chart failed');
  },
};

// Provider is swappable (tests / licensed feed).
let provider: ChartProvider = yahooChart;
export const setChartProvider = (p: ChartProvider) => { provider = p; chartCaches.forEach((c) => c.clear()); };
const chartCaches = new Map<string, TtlCache<ChartData>>();
function cacheFor(range: string, ttl: number) {
  let c = chartCaches.get(range);
  if (!c) { c = new TtlCache<ChartData>(ttl); chartCaches.set(range, c); }
  return c;
}
/** Cached chart. '5d' → quote TTL (60s); long ranges → series TTL (15min). Stale served on failure (caller sees stale flag). */
export async function getChart(symbol: string, range: Range | '5d'): Promise<{ data: ChartData; stale: boolean }> {
  const ttl = range === '5d' ? TTL.quote : TTL.series;
  const r = await cacheFor(range, ttl).wrap(symbol, () => provider.chart(symbol, range));
  return { data: r.value, stale: r.stale };
}
export const clearChartCache = () => chartCaches.forEach((c) => c.clear());
