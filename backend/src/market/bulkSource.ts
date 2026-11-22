// Whole-market "bulk snapshot" source selector. Priority: Angel One SmartAPI (broker-grade, exact, 5s cache) for the tracked
// set (Nifty 50 + Next 50 + watched symbols), overlaid on the broad NSE-website/Yahoo snapshot (providers/nseLive.ts) which
// supplies every other listed stock. Everything downstream (movers.ts, data.ts) consumes the same BulkSnapshot/BulkRow shape.
import type { BulkSnapshot } from './providers/nseLive';
import { bulkIsFresh as nseBulkIsFresh, getBulk as getNseBulk, peekBulk as peekNseBulk } from './providers/nseLive';
import { angelConfigured, angelPeek, getAngelBulk } from './providers/angel';

const ANGEL_STALE_MS = 2 * 60_000;   // a live Angel copy older than this is no longer trusted over NSE

function overlay(nse: BulkSnapshot | null, angel: BulkSnapshot): BulkSnapshot {
  const rows = new Map(nse?.rows.map((r) => [r.symbol, r]) ?? []);
  for (const r of angel.rows) rows.set(r.symbol, r);   // Angel's exact figures win
  const list = [...rows.values()];
  return { index: 'ANGEL', rows: list, bySymbol: rows, asOfMs: angel.asOfMs, fetchedAt: angel.fetchedAt };
}

/** Full snapshot, refreshing as needed. Angel rows (5s cache) overlay the NSE snapshot; NSE alone if Angel is unavailable. */
export async function getBulk(): Promise<BulkSnapshot | null> {
  const [angel, nse] = await Promise.all([angelConfigured() ? getAngelBulk().catch(() => null) : null, getNseBulk().catch(() => null)]);
  if (angel && Date.now() - angel.fetchedAt < ANGEL_STALE_MS) return overlay(nse, angel);
  return nse;
}
/** Synchronous peek (no network): the active source's last snapshot. */
export function peekBulk(): BulkSnapshot | null {
  const nse = peekNseBulk();
  const a = angelConfigured() ? angelPeek() : null;
  if (a && Date.now() - a.snap.fetchedAt < ANGEL_STALE_MS) return overlay(nse, a.snap);
  return nse;
}
export function bulkIsFresh(s: BulkSnapshot | null, now = Date.now()): s is BulkSnapshot {
  if (s && s.index === 'ANGEL') return now - s.fetchedAt < ANGEL_STALE_MS;
  return nseBulkIsFresh(s, now);
}
export const bulkSourceLabel = (s: BulkSnapshot) => (s.index === 'ANGEL' ? 'angel' : 'nse');
