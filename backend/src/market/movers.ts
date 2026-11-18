// Whole-market screen built from NSE bulk data (providers/nseLive.ts): top gainers/losers, volume leaders, near 52-week high/low.
// Also getBulkQuote(): a Quote for ANY symbol in the bulk snapshot, served without touching Yahoo.
import type { Lang, MarketMover, MoversFeed, Quote } from '../../../shared/contract';
import { iso } from './http';
import { isNseOpen, quoteFromBulkRow, type BulkRow, type BulkSnapshot } from './providers/nseLive';
import { bulkIsFresh, bulkSourceLabel, getBulk, peekBulk } from './bulkSource';
import { refStock } from './reference/nifty50';
import { tidyName, universeItem } from './universe';

export const MOVERS_LIMIT = 15;
/** Liquidity/sanity filters for the gainer/loser/near-high lists (documented, deliberately simple). */
export const MOVER_RULES = { minPrice: 5, minVolume: 20_000, minTradedValue: 2_500_000 /* Rs 25 lakh */, maxAbsChangePct: 40, nearPct: 2, series: ['EQ'] as string[] };

const displayNameFor = (r: BulkRow) => refStock(r.symbol)?.name ?? universeItem(r.symbol)?.name ?? tidyName(r.name);
const r2 = (x: number) => Math.round(x * 100) / 100;

export function toMover(r: BulkRow): MarketMover {
  const nearHighPct = r.yearHigh && r.yearHigh > 0 ? Math.max(0, r2(((r.yearHigh - r.price) / r.yearHigh) * 100)) : null;
  const nearLowPct = r.yearLow && r.yearLow > 0 ? Math.max(0, r2(((r.price - r.yearLow) / r.yearLow) * 100)) : null;
  return { symbol: r.symbol, name: displayNameFor(r), price: r.price, changePct: r2(r.changePct), volume: r.volume, yearHigh: r.yearHigh, yearLow: r.yearLow, nearHighPct, nearLowPct, change30dPct: r.change30dPct, change365dPct: r.change365dPct };
}

/** Liquid, normal-looking rows only: EQ series, price >= Rs 5, volume and traded value floors, |change| below 40% (new listings, corporate actions). */
export function isLiquid(r: BulkRow, hasVolume = true): boolean {
  const R = MOVER_RULES;
  if (r.series && !R.series.includes(r.series.toUpperCase())) return false;
  if (r.price < R.minPrice || Math.abs(r.changePct) > R.maxAbsChangePct) return false;
  if (!hasVolume) return true;
  return (r.volume ?? 0) >= R.minVolume && (r.tradedValue ?? r.price * (r.volume ?? 0)) >= R.minTradedValue;
}

export function computeMovers(rows: BulkRow[], hasVolume = true): Pick<MoversFeed, 'gainers' | 'losers' | 'volumeSpikes' | 'nearHigh' | 'nearLow'> {
  const liquid = rows.filter((r) => isLiquid(r, hasVolume));
  const top = (xs: BulkRow[]) => xs.slice(0, MOVERS_LIMIT).map(toMover);
  const gainers = liquid.filter((r) => r.changePct > 0).sort((a, b) => b.changePct - a.changePct);
  const losers = liquid.filter((r) => r.changePct < 0).sort((a, b) => a.changePct - b.changePct);
  // No average-volume baseline exists in this feed, so "volume spikes" are the day's traded-value leaders.
  const volume = hasVolume ? [...liquid].sort((a, b) => (b.tradedValue ?? b.price * (b.volume ?? 0)) - (a.tradedValue ?? a.price * (a.volume ?? 0))) : [];
  const nh = (r: BulkRow) => (r.yearHigh && r.yearHigh > 0 ? ((r.yearHigh - r.price) / r.yearHigh) * 100 : Infinity);
  const nl = (r: BulkRow) => (r.yearLow && r.yearLow > 0 ? ((r.price - r.yearLow) / r.yearLow) * 100 : Infinity);
  const nearHigh = liquid.filter((r) => nh(r) <= MOVER_RULES.nearPct).sort((a, b) => nh(a) - nh(b) || (b.change30dPct ?? -999) - (a.change30dPct ?? -999));
  const nearLow = liquid.filter((r) => nl(r) <= MOVER_RULES.nearPct).sort((a, b) => nl(a) - nl(b));
  return { gainers: top(gainers), losers: top(losers), volumeSpikes: top(volume), nearHigh: top(nearHigh), nearLow: top(nearLow) };
}

const VOLUME_NOTE = 'Volume leaders are ranked by traded value (this feed has no average-volume baseline).';
function delayNote(s: BulkSnapshot): string {
  const open = isNseOpen();
  const ageMin = Math.round((Date.now() - s.fetchedAt) / 60_000);
  const dhan = bulkSourceLabel(s) === 'dhan';
  const base = dhan
    ? (open ? 'NSE exchange data via a Dhan trading account, typically a few seconds behind the exchange feed.' : 'Market is closed: figures are the latest session, via a Dhan trading account.')
    : open ? 'NSE website data, typically a few seconds to a minute behind the exchange feed; not a licensed real-time feed.'
    : 'Market is closed: figures are the latest session from the NSE website, not a licensed real-time feed.';
  const stale = open && ageMin >= 3 ? ` This copy was fetched ${ageMin} min ago.` : '';
  return `${base}${stale} ${VOLUME_NOTE}`;
}
export function feedFromSnapshot(s: BulkSnapshot): MoversFeed {
  const dhan = bulkSourceLabel(s) === 'dhan';
  return {
    asOf: iso(s.asOfMs), source: dhan ? 'NSE exchange data via Dhan (licensed account data feed)' : 'NSE India website (unofficial endpoint)',
    delayNote: delayNote(s), universe: `${dhan ? 'NSE (via Dhan)' : s.index} (${s.rows.length} stocks)`, count: s.rows.length, ...computeMovers(s.rows),
  };
}

/** Fallback when NSE bulk data is unavailable: Nifty 50 only, from Yahoo (bounded: 50 symbols, cached 60s, limiter-protected). Clearly flagged. */
async function yahooFallback(): Promise<MoversFeed> {
  const { getQuotes } = await import('./data');
  const { NIFTY50 } = await import('./reference/nifty50');
  const quotes = Object.values(await getQuotes(NIFTY50.map((s) => s.symbol)));
  if (!quotes.length) throw new Error('No market data source is reachable right now');
  const rows: BulkRow[] = quotes.map((q) => ({
    symbol: q.symbol, name: q.name, series: 'EQ', price: q.price, prevClose: q.prevClose, change: q.change, changePct: q.changePct, open: null, dayHigh: q.dayHigh, dayLow: q.dayLow,
    volume: null, tradedValue: null, yearHigh: q.fiftyTwoWeekHigh, yearLow: q.fiftyTwoWeekLow, change30dPct: null, change365dPct: null, updatedAt: Date.parse(q.asOf) || null,
  }));
  const asOf = Math.max(...rows.map((r) => r.updatedAt ?? 0)) || Date.now();
  return {
    asOf: iso(asOf), source: 'Yahoo Finance (unofficial) FALLBACK', count: rows.length, universe: `NIFTY 50 only (${rows.length} stocks): NSE whole-market data is unavailable right now`,
    delayNote: 'FALLBACK: NSE whole-market data could not be fetched, so this shows only the Nifty 50 from Yahoo Finance (unofficial, often delayed ~15 minutes). Volume leaders are unavailable in this mode.',
    ...computeMovers(rows, false),
  };
}

export async function getMoversFeed(_lang: Lang = 'en'): Promise<MoversFeed> {
  const s = await getBulk();
  if (s) return feedFromSnapshot(s);
  return yahooFallback();
}
/** Cached-only variant for background consumers (calls feed): never waits on the network beyond `waitMs`. */
export async function getMoversFeedSoft(waitMs = 4000): Promise<MoversFeed | null> {
  try {
    const s = await Promise.race([getBulk(), new Promise<null>((r) => setTimeout(() => r(null), waitMs))]);
    return s ? feedFromSnapshot(s) : null;
  } catch { return null; }
}

/** A fresh Quote for any symbol in the NSE bulk snapshot, or null (not in the snapshot, or the snapshot is stale). No network. */
export function getBulkQuote(symbol: string): Quote | null {
  const s = peekBulk();
  if (!bulkIsFresh(s)) return null;
  const r = s.bySymbol.get(symbol.toUpperCase());
  if (!r) return null;
  const q = quoteFromBulkRow(r, s);
  const name = refStock(r.symbol)?.name ?? universeItem(r.symbol)?.name ?? q.name;
  return bulkSourceLabel(s) === 'dhan' ? { ...q, name, source: 'NSE exchange data via Dhan (licensed account data feed)' } : { ...q, name };
}
