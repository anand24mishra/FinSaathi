// Whole-market "bulk snapshot" source selector. Dhan (a real, licensed broker account) is preferred when configured;
// otherwise this falls through unchanged to the NSE-website/Yahoo chain in providers/nseLive.ts. Everything downstream
// (movers.ts, data.ts) consumes the same BulkSnapshot/BulkRow shape regardless of which source produced it.
import type { BulkSnapshot } from './providers/nseLive';
import { bulkIsFresh as nseBulkIsFresh, getBulk as getNseBulk, peekBulk as peekNseBulk } from './providers/nseLive';
import { dhanConfigured, getDhanBulk } from './providers/dhan';

let dhanPeek: BulkSnapshot | null = null;
let dhanPeekAt = 0;
const DHAN_PEEK_STALE_MS = 10 * 60_000; // how long a peeked (no-network) Dhan snapshot is still considered usable

/** Full snapshot, refreshing as needed. Prefers Dhan; falls back to the NSE/Yahoo chain on any Dhan gap. */
export async function getBulk(): Promise<BulkSnapshot | null> {
  if (dhanConfigured()) {
    const s = await getDhanBulk([]).catch(() => null); // [] -> getDhanBulk covers every symbol its instrument map knows
    if (s) { dhanPeek = s; dhanPeekAt = Date.now(); return s; }
  }
  return getNseBulk();
}
/** Synchronous peek (no network): the active source's last snapshot. */
export function peekBulk(): BulkSnapshot | null {
  if (dhanConfigured() && dhanPeek && Date.now() - dhanPeekAt < DHAN_PEEK_STALE_MS) return dhanPeek;
  return peekNseBulk();
}
export function bulkIsFresh(s: BulkSnapshot | null, now = Date.now()): s is BulkSnapshot {
  if (s && s.index === 'DHAN') return now - s.fetchedAt < DHAN_PEEK_STALE_MS;
  return nseBulkIsFresh(s, now);
}
export const bulkSourceLabel = (s: BulkSnapshot) => (s.index === 'DHAN' ? 'dhan' : 'nse');
