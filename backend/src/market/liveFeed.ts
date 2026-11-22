// Pluggable live-quote source for the WebSocket hub (market/liveWs.ts).
//
// A LiveFeed is polled ONCE per tick for the union of every subscribed symbol (never per connection).
// Default: NseYahooFeed = NSE whole-market bulk snapshot first (one call covers ~750+ stocks), Yahoo only for the few symbols
// the snapshot does not contain, strictly throttled. Honest labelling: NSE website data is seconds-to-a-minute behind the exchange
// and Yahoo (unofficial) is typically ~15 minutes delayed for NSE; neither is a licensed real-time tick feed.
import type { Quote } from '../../../shared/contract';
import { getQuote } from './data';
import { isNseOpen, quoteFromBulkRow } from './providers/nseLive';
import { bulkIsFresh, getBulk } from './bulkSource';
import { universeItem } from './universe';
import { refStock } from './reference/nifty50';
import { angelConfigured, angelHas, angelRowToQuote, angelTrack } from './providers/angel';

export interface LiveFeed {
  /** Short source label sent in the WS hello. */
  name: string;
  /** Honest freshness statement sent in the WS hello. */
  delayNote: string;
  /** Latest quotes for the given symbols (SYMBOL.NS). Symbols that cannot be served are simply absent. Must not throw. */
  poll(symbols: string[]): Promise<Quote[]>;
  /** Optional cleanup (close a broker socket, etc). */
  close?(): Promise<void> | void;
}

export interface NseYahooOptions { yahooCapPerPoll?: number; yahooMinGapOpenMs?: number; yahooMinGapClosedMs?: number; getQuoteFn?: (s: string) => Promise<Quote> }

export class NseYahooFeed implements LiveFeed {
  /** Honest labels: dynamic because Dhan can become configured/unconfigured without restarting (renewal, a key going stale). */
  get name() { return angelConfigured() ? 'Angel One broker feed (NSE website for other stocks)' : 'NSE India website data (Yahoo Finance fallback for a few symbols)'; }
  get delayNote() { return angelConfigured() ? 'Broker market feed refreshed about every 5 seconds for Nifty 100 and watched stocks; other symbols come from the NSE website or Yahoo Finance (unofficial, can lag).' : 'Not a licensed real-time feed. NSE website data is typically a few seconds to a minute behind the exchange; symbols outside the NSE snapshot come from Yahoo Finance (unofficial), often ~15 minutes delayed.'; }
  private yahoo = new Map<string, { at: number; quote: Quote }>();
  private opts: Required<NseYahooOptions>;
  constructor(o: NseYahooOptions = {}) {
    this.opts = { yahooCapPerPoll: 6, yahooMinGapOpenMs: 30_000, yahooMinGapClosedMs: 5 * 60_000, getQuoteFn: getQuote, ...o };
  }
  async poll(symbols: string[]): Promise<Quote[]> {
    const out: Quote[] = [];
    if (angelConfigured()) angelTrack(symbols);
    const snap = await getBulk().catch(() => null);
    const missing: string[] = [];
    for (const s of symbols) {
      const r = bulkIsFresh(snap) ? snap!.bySymbol.get(s) : undefined;
      if (r && snap) {
        const name = refStock(s)?.name ?? universeItem(s)?.name ?? r.name;
        out.push(snap.index === 'ANGEL' && angelHas(s) ? angelRowToQuote(s, name, r) : { ...quoteFromBulkRow(r, snap), name });
      }
      else missing.push(s);
    }
    // Yahoo is rate-limited and unofficial: at most a handful of symbols per poll, each no more often than the min gap.
    const gap = isNseOpen() ? this.opts.yahooMinGapOpenMs : this.opts.yahooMinGapClosedMs;
    const now = Date.now();
    const due = missing.filter((s) => now - (this.yahoo.get(s)?.at ?? 0) >= gap).slice(0, this.opts.yahooCapPerPoll);
    await Promise.all(due.map(async (s) => {
      this.yahoo.set(s, { at: now, quote: this.yahoo.get(s)?.quote as Quote });   // mark attempt first (also on failure)
      try { const q = await this.opts.getQuoteFn(s); this.yahoo.set(s, { at: now, quote: q }); } catch { /* unavailable: keep older cached quote if any */ }
    }));
    for (const s of missing) { const c = this.yahoo.get(s)?.quote; if (c) out.push(c); }
    return out;
  }
}

/**
 * WHERE A BROKER ADAPTER PLUGS IN (not implemented on purpose).
 * Account holders get real tick data over a WebSocket from Upstox (Market Data Feed v3), Angel One SmartAPI (SmartWebSocketV2),
 * Fyers (Data WebSocket) or Zerodha Kite (KiteTicker). To add one: implement LiveFeed so that
 *   - the constructor reads credentials from env (e.g. UPSTOX_ACCESS_TOKEN, or ANGEL_API_KEY + ANGEL_CLIENT_CODE + ANGEL_TOTP_SECRET,
 *     FYERS_APP_ID + FYERS_ACCESS_TOKEN, KITE_API_KEY + KITE_ACCESS_TOKEN) and never logs them;
 *   - poll(symbols) calls broker.subscribe(newSymbols) / unsubscribe(removed) to match the union, and returns the latest tick per symbol
 *     as a Quote (source: 'Upstox live', delayMinutes: 0), taken from an in-memory last-tick map filled by the broker socket;
 *   - you may lower the hub interval (LIVE_INTERVAL_OPEN_MS) to ~1000 since poll() is then a cheap memory read.
 * Then select it in createLiveFeed() below via LIVE_FEED=upstox|angel|fyers|kite. Broker terms usually forbid redistributing ticks to
 * third parties; check your licence before exposing it to other users.
 */
export class BrokerFeedStub implements LiveFeed {
  name = 'broker (not implemented)'; delayNote = 'Broker feed adapter is a stub.';
  async poll(): Promise<Quote[]> { throw new Error('BrokerFeedStub is a placeholder; see liveFeed.ts'); }
}

export function createLiveFeed(env: NodeJS.ProcessEnv = process.env): LiveFeed {
  const want = (env.LIVE_FEED ?? '').toLowerCase();
  if (want && want !== 'nse') console.warn(`[live] LIVE_FEED=${want} has no adapter yet; using the NSE/Yahoo feed`);
  return new NseYahooFeed();
}
