// NSE whole-market bulk data: ONE call to /api/equity-stockIndices?index=<INDEX> returns every constituent with last price,
// change %, volume, 52-week range and 30d/365d change. Reuses the cookie session of providers/nse.ts (nseGet).
//
// Freshness: cached 25s during NSE hours (09:15-15:30 IST Mon-Fri), 10 minutes otherwise, stale-while-revalidate (the stale copy
// is served instantly while one background refresh runs), and the last good copy is kept up to 15 min (open) / 4 days (closed,
// covers weekends) if NSE fails. After a failure we back off (20s open / 2 min closed) instead of hammering NSE.
// This is NSE WEBSITE data (unofficial endpoint): typically seconds to a minute behind the exchange, NOT a licensed real-time feed.
import type { Quote } from '../../../../shared/contract';
import { iso } from '../http';
import { nseGet } from './nse';

export const NSE_BULK_SOURCE = 'NSE India website data (unofficial, not a licensed real-time feed)';
/** Broadest first; the first index that answers with usable rows wins and is remembered. */
export const BULK_INDEXES = ['NIFTY TOTAL MARKET', 'NIFTY 500', 'SECURITIES IN F&O', 'NIFTY 200', 'NIFTY 100', 'NIFTY 50'];

export interface BulkRow {
  symbol: string; name: string; series: string | null; price: number; prevClose: number | null; change: number; changePct: number;
  open: number | null; dayHigh: number | null; dayLow: number | null; volume: number | null; tradedValue: number | null;
  yearHigh: number | null; yearLow: number | null; change30dPct: number | null; change365dPct: number | null; updatedAt: number | null;
}
export interface BulkSnapshot { index: string; rows: BulkRow[]; bySymbol: Map<string, BulkRow>; asOfMs: number; fetchedAt: number }

// ---------- time ----------
const IST_OFFSET_MS = 5.5 * 3600_000;
/** NSE equity cash session: Mon-Fri 09:15-15:30 IST (does not know exchange holidays). */
export function isNseOpen(now = Date.now()): boolean {
  const d = new Date(now + IST_OFFSET_MS);
  const dow = d.getUTCDay(); if (dow === 0 || dow === 6) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** "20-Nov-2026 15:59:58" (IST) -> epoch ms, or null. */
export function parseNseTime(s: unknown): number | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const mon = MON.indexOf(m[2]!.toUpperCase()); if (mon < 0) return null;
  return Date.UTC(+m[3]!, mon, +m[1]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) - IST_OFFSET_MS;
}

// ---------- parsing ----------
const n = (v: unknown): number | null => {
  if (typeof v === 'string') v = v.replace(/,/g, '');
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && v !== '-' ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
};
/** Rows of an equity-stockIndices response. The index row itself (priority 1 / symbol with a space) is dropped. */
export function parseBulk(json: any, index: string, fetchedAt = Date.now()): BulkSnapshot {
  const data: any[] = Array.isArray(json?.data) ? json.data : [];
  const rows: BulkRow[] = [];
  let asOfMs = parseNseTime(json?.timestamp) ?? parseNseTime(json?.metadata?.timeVal) ?? 0;
  for (const r of data) {
    const sym = String(r?.symbol ?? '').trim().toUpperCase();
    if (!sym || /\s/.test(sym) || r?.priority === 1) continue;
    const price = n(r.lastPrice), prev = n(r.previousClose);
    if (price == null || price <= 0) continue;
    const change = n(r.change) ?? (prev != null ? price - prev : 0);
    const changePct = n(r.pChange) ?? (prev ? (change / prev) * 100 : 0);
    const upd = parseNseTime(r.lastUpdateTime);
    if (upd && upd > asOfMs) asOfMs = upd;
    rows.push({
      symbol: `${sym}.NS`, name: String(r?.meta?.companyName ?? r?.companyName ?? sym), series: r?.series ? String(r.series) : (r?.meta?.activeSeries?.[0] ?? null),
      price, prevClose: prev, change, changePct, open: n(r.open), dayHigh: n(r.dayHigh), dayLow: n(r.dayLow),
      volume: n(r.totalTradedVolume), tradedValue: n(r.totalTradedValue), yearHigh: n(r.yearHigh), yearLow: n(r.yearLow),
      change30dPct: n(r.perChange30d), change365dPct: n(r.perChange365d), updatedAt: upd,
    });
  }
  if (!asOfMs) asOfMs = fetchedAt;
  return { index, rows, bySymbol: new Map(rows.map((r) => [r.symbol, r])), asOfMs, fetchedAt };
}

// ---------- fetching + cache (stale-while-revalidate) ----------
export type BulkFetcher = (index: string) => Promise<any>;
const defaultFetcher: BulkFetcher = async (index) => {
  if (process.env.FINSAATHI_NSE_BULK === 'off') throw new Error('NSE bulk data disabled');
  return nseGet(`/api/equity-stockIndices?index=${encodeURIComponent(index)}`);
};
let fetcher: BulkFetcher = defaultFetcher;
let snap: BulkSnapshot | null = null;
let working: string | null = null;           // index name that last worked
let inflight: Promise<BulkSnapshot | null> | null = null;
let nextTryAt = 0;
let lastError: string | null = null;
let lastIndexErrors: Record<string, string> = {};

export const TTL_OPEN_MS = 25_000, TTL_CLOSED_MS = 10 * 60_000, STALE_OPEN_MS = 15 * 60_000, STALE_CLOSED_MS = 4 * 24 * 3600_000;
const ttl = (now: number) => (isNseOpen(now) ? TTL_OPEN_MS : TTL_CLOSED_MS);
const maxStale = (now: number) => (isNseOpen(now) ? STALE_OPEN_MS : STALE_CLOSED_MS);

export function setBulkFetcher(f: BulkFetcher | null) { fetcher = f ?? defaultFetcher; clearBulkCache(); }
export function clearBulkCache() { snap = null; working = null; inflight = null; nextTryAt = 0; lastError = null; lastIndexErrors = {}; }
export const bulkStatus = () => ({ index: snap?.index ?? null, rows: snap?.rows.length ?? 0, asOf: snap ? iso(snap.asOfMs) : null, fetchedAt: snap ? iso(snap.fetchedAt) : null, lastError, indexErrors: lastIndexErrors });

async function fetchOnce(): Promise<BulkSnapshot> {
  const order = working ? [working, ...BULK_INDEXES.filter((i) => i !== working)] : BULK_INDEXES;
  lastIndexErrors = {};
  let httpFails = 0;
  for (const index of order) {
    if (httpFails >= 2) break;   // NSE is refusing us (blocked / endpoint moved): do not fan out over every index

    try {
      const s = parseBulk(await fetcher(index), index);
      if (s.rows.length >= 20 || (index === 'NIFTY 50' && s.rows.length >= 10)) { working = index; return s; }
      lastIndexErrors[index] = `only ${s.rows.length} usable rows`;
    } catch (e) { httpFails++; lastIndexErrors[index] = String((e as Error)?.message ?? e).slice(0, 100); }
  }
  throw new Error('NSE bulk data unavailable: ' + Object.entries(lastIndexErrors).map(([k, v]) => `${k}: ${v}`).join('; '));
}
function refresh(): Promise<BulkSnapshot | null> {
  if (inflight) return inflight;
  inflight = fetchOnce().then((s) => {
    // never replace a newer-by-NSE-clock copy with an older one
    if (!snap || s.asOfMs >= snap.asOfMs || s.rows.length >= snap.rows.length / 2) snap = s;
    lastError = null; nextTryAt = 0; return snap;
  }).catch((e) => {
    lastError = String(e?.message ?? e); nextTryAt = Date.now() + (isNseOpen() ? 20_000 : 120_000); return null;
  }).finally(() => { inflight = null; });
  return inflight;
}

/** Current snapshot, refreshing as needed. Null when NSE has never answered (or the last good copy is too old). Never throws. */
export async function getBulk(opts: { waitForFresh?: boolean } = {}): Promise<BulkSnapshot | null> {
  const now = Date.now();
  const usable = snap && now - snap.fetchedAt < maxStale(now) ? snap : null;
  const fresh = usable && now - usable.fetchedAt < ttl(now);
  if (fresh) return usable;
  if (now < nextTryAt && !inflight) return usable;            // backing off after a failure: serve the last good copy
  if (usable && !opts.waitForFresh) { void refresh(); return usable; }   // stale-while-revalidate
  const got = await refresh();
  return got ?? usable;
}
/** Synchronous peek (no network). */
export function peekBulk(): BulkSnapshot | null { return snap; }
/** A row is "fresh enough" to serve as a quote: <= 60s old in market hours, <= 30 min otherwise (closing data does not change). */
export function bulkIsFresh(s: BulkSnapshot | null, now = Date.now()): s is BulkSnapshot {
  return !!s && now - s.fetchedAt <= (isNseOpen(now) ? 60_000 : 30 * 60_000);
}

export function quoteFromBulkRow(r: BulkRow, snapshot: BulkSnapshot): Quote {
  const open = isNseOpen() && Date.now() - (r.updatedAt ?? snapshot.asOfMs) < 20 * 60_000;
  return {
    symbol: r.symbol, name: r.name, price: r.price, change: +r.change.toFixed(4), changePct: +r.changePct.toFixed(3), currency: 'INR',
    prevClose: r.prevClose, dayHigh: r.dayHigh, dayLow: r.dayLow, fiftyTwoWeekHigh: r.yearHigh, fiftyTwoWeekLow: r.yearLow,
    marketState: open ? 'open' : 'closed', asOf: iso(r.updatedAt ?? snapshot.asOfMs), source: NSE_BULK_SOURCE, delayMinutes: null,
  };
}
