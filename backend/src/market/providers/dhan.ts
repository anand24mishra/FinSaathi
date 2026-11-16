// Dhan (dhan.co) live market data — a real broker account's licensed feed, used ONLY for this account's own data plan.
// REST, not the binary WebSocket: /marketfeed/{ltp,ohlc,quote} take up to 1000 instrument ids per call, keyed by exchange
// segment ("NSE_EQ" for equities, "IDX_I" for ANY exchange's index — both confirmed live). The whole account shares a
// 1 request/second budget across every Dhan endpoint (confirmed live: a second call ~1s after the first got HTTP 429),
// so every call in this module goes through one serialised, paced queue — never call Dhan from anywhere else.
//
// Auth: DHAN_CLIENT_ID + DHAN_ACCESS_TOKEN (backend/.env, gitignored). The access token is a personal "Dhan Web" token,
// good for about 24 hours (confirmed live via GET /v2/profile -> tokenValidity). Renewal (GET /v2/RenewToken) is coded
// below but is NOT invoked automatically by this module; see renewTokenNow() for why.
//
// Never log, print or return the token or client id. Everything here fails soft: on any error, config gap, or rate
// limit, callers get null/empty and fall back to the existing NSE/Yahoo chain (bulkSource.ts, liveFeed.ts).
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BulkRow, BulkSnapshot } from './nseLive';
import { isNseOpen } from './nseLive';
import { reportService } from '../../core/health';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, '../../../data');
const SCRIP_CACHE = path.join(DATA_DIR, 'dhan-scrip-master.csv');
const RENEW_DEBUG = path.join(DATA_DIR, 'dhan-renew-debug.json');
let envFile = path.join(HERE, '../../../.env');
/** Test only: redirect .env rewrites to a throwaway file, so tests can never touch the real backend/.env (which holds the live token). */
export const __setDhanEnvFile = (p: string) => { envFile = p; };
const BASE = 'https://api.dhan.co/v2';

// ---------- config (mutable: renewal updates these in memory + rewrites .env) ----------
let clientId: string | null = process.env.DHAN_CLIENT_ID?.trim() || null;
let accessToken: string | null = process.env.DHAN_ACCESS_TOKEN?.trim() || null;
let tokenValidUntilMs: number | null = null;   // parsed from /v2/profile's tokenValidity; refreshed periodically, not on every call
export function dhanConfigured(): boolean { return !!(clientId && accessToken); }
/** Test/dev only: inject credentials without touching process.env or .env. */
export function __setDhanCreds(c: { clientId: string | null; accessToken: string | null } | null) {
  clientId = c?.clientId ?? null; accessToken = c?.accessToken ?? null; tokenValidUntilMs = null;
  bulkCache = null; instrumentMap = null; indexMap = null;
}

// ---------- rate limiter: 1 request/second, shared across every Dhan call ----------
class PacedQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private lastAt = 0;
  constructor(private minGapMs: number) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(async () => {
      const wait = this.minGapMs - (Date.now() - this.lastAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastAt = Date.now();
      return fn();
    });
    this.chain = p.catch(() => {});   // one failure must not jam the queue for later callers
    return p;
  }
}
let minGapMs = 1050; // a little over 1s of margin on top of Dhan's documented 1 req/s
let queue = new PacedQueue(minGapMs);
/** Test only: shrink the pacing gap so tests are not slowed by the real 1 req/s budget. */
export const __setDhanMinGapMs = (ms: number) => { minGapMs = ms; queue = new PacedQueue(ms); };

type FetchFn = typeof fetch;
let fetchImpl: FetchFn = fetch;
/** Test only: swap the underlying fetch. */
export const __setDhanFetch = (f: FetchFn | null) => { fetchImpl = f ?? fetch; };

async function dhanCall(pathSuffix: string, opts: { method?: string; body?: unknown; clientIdHeader?: 'client-id' | 'dhanClientId' } = {}): Promise<any> {
  if (!dhanConfigured()) throw new Error('Dhan is not configured');
  return queue.run(async () => {
    const headers: Record<string, string> = { 'access-token': accessToken! };
    headers[opts.clientIdHeader ?? 'client-id'] = clientId!;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    try {
      const res = await fetchImpl(`${BASE}${pathSuffix}`, {
        method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: ctl.signal,
      });
      const text = await res.text();
      let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
      if (!res.ok) throw new Error(`Dhan ${pathSuffix} -> HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
      return json;
    } finally { clearTimeout(timer); }
  });
}

// ---------- market feed (ltp / ohlc / quote) ----------
export type MarketfeedKind = 'ltp' | 'ohlc' | 'quote';
export interface DhanQuoteRow {
  last_price: number;
  ohlc?: { open: number; close: number; high: number; low: number };
  volume?: number; net_change?: number; last_trade_time?: string;
  '52_week_high'?: number; '52_week_low'?: number;
}
/** One segment's ids, chunked to <=1000 and polled sequentially (paced), merged back into one map. */
async function fetchSegment(kind: MarketfeedKind, segment: string, ids: number[]): Promise<Record<string, DhanQuoteRow>> {
  const out: Record<string, DhanQuoteRow> = {};
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    try {
      const json = await dhanCall(`/marketfeed/${kind}`, { body: { [segment]: chunk } });
      const rows = json?.data?.[segment];
      if (rows && typeof rows === 'object') Object.assign(out, rows);
    } catch { /* this chunk failed; keep whatever earlier chunks returned */ }
  }
  return out;
}
export async function fetchMarketfeed(kind: MarketfeedKind, bySegment: Record<string, number[]>): Promise<Record<string, Record<string, DhanQuoteRow>>> {
  const out: Record<string, Record<string, DhanQuoteRow>> = {};
  for (const [segment, ids] of Object.entries(bySegment)) if (ids.length) out[segment] = await fetchSegment(kind, segment, ids);
  return out;
}

// ---------- instrument master: SYMBOL.NS <-> Dhan security id ----------
export interface DhanInstrument { securityId: number; segment: 'NSE_EQ'; isin: string | null }
let instrumentMap: Map<string, DhanInstrument> | null = null;
let indexMap: Map<string, number> | null = null;   // '^NSEI' etc -> security id, segment is always IDX_I
let loadingInstruments: Promise<void> | null = null;

const SCRIP_URL = 'https://images.dhan.co/api-data/api-scrip-master-detailed.csv';
const SCRIP_MAX_AGE_MS = 24 * 3600_000;

function parseCsvLine(line: string): string[] {
  // No quoted commas expected in this file's equity/index rows (symbol names are plain); a tiny splitter is enough here.
  return line.split(',');
}
export function parseInstrumentCsv(text: string): { instruments: Map<string, DhanInstrument>; indices: Map<string, number> } {
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? '');
  const col = (name: string) => header.indexOf(name);
  const iExch = col('EXCH_ID'), iSeg = col('SEGMENT'), iSec = col('SECURITY_ID'), iIsin = col('ISIN'), iSeries = col('SERIES'), iUnderlying = col('UNDERLYING_SYMBOL'), iSymName = col('SYMBOL_NAME');
  const instruments = new Map<string, DhanInstrument>();
  const indices = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]; if (!line) continue;
    const c = parseCsvLine(line); if (c.length < header.length) continue;
    const exch = c[iExch], seg = c[iSeg], secId = Number(c[iSec]);
    if (!Number.isFinite(secId)) continue;
    if (exch === 'NSE' && seg === 'E' && c[iSeries] === 'EQ') {
      const sym = (c[iUnderlying] || c[iSymName] || '').trim().toUpperCase();
      if (sym) instruments.set(`${sym}.NS`, { securityId: secId, segment: 'NSE_EQ', isin: c[iIsin] || null });
    } else if (seg === 'I') {
      const name = (c[iSymName] || c[iUnderlying] || '').trim().toUpperCase();
      if (exch === 'NSE' && name === 'NIFTY') indices.set('^NSEI', secId);
      else if (exch === 'NSE' && name === 'BANKNIFTY') indices.set('^NSEBANK', secId);
      else if (exch === 'BSE' && name === 'SENSEX') indices.set('^BSESN', secId);
    }
  }
  return { instruments, indices };
}
function cacheFresh(): boolean { try { return Date.now() - statSync(SCRIP_CACHE).mtimeMs < SCRIP_MAX_AGE_MS; } catch { return false; } }
async function loadInstruments(): Promise<void> {
  if (instrumentMap && indexMap) return;
  if (loadingInstruments) return loadingInstruments;
  loadingInstruments = (async () => {
    let text: string | null = null;
    if (cacheFresh()) { try { text = readFileSync(SCRIP_CACHE, 'utf8'); } catch { /* fall through to download */ } }
    if (!text) {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 30_000);
      try {
        const res = await fetchImpl(SCRIP_URL, { signal: ctl.signal });
        if (!res.ok) throw new Error(`scrip master HTTP ${res.status}`);
        text = await res.text();
        try { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(SCRIP_CACHE, text); } catch { /* disk cache is best-effort */ }
      } catch (e) {
        try { text = readFileSync(SCRIP_CACHE, 'utf8'); } catch { throw e; }   // stale-but-usable beats nothing
      } finally { clearTimeout(timer); }
    }
    const { instruments, indices } = parseInstrumentCsv(text);
    instrumentMap = instruments; indexMap = indices;
  })().finally(() => { loadingInstruments = null; });
  return loadingInstruments;
}
export async function dhanSecurityFor(symbolNs: string): Promise<DhanInstrument | null> {
  await loadInstruments(); return instrumentMap?.get(symbolNs.toUpperCase()) ?? null;
}
export async function dhanIndexSecurityFor(caretSymbol: string): Promise<number | null> {
  await loadInstruments(); return indexMap?.get(caretSymbol) ?? null;
}
export async function instrumentMapSize(): Promise<number> { await loadInstruments(); return instrumentMap?.size ?? 0; }
/** Test only: install a parsed map directly (skip the CSV download). */
export function __setDhanInstruments(m: { instruments: Map<string, DhanInstrument>; indices: Map<string, number> } | null) {
  instrumentMap = m?.instruments ?? null; indexMap = m?.indices ?? null;
}

// ---------- whole-market bulk snapshot, same shape as NSE's (nseLive.ts), so movers.ts/data.ts can consume either ----------
export const DHAN_BULK_SOURCE = 'NSE exchange data via Dhan (licensed account data feed)';
export function dhanRowToBulkRow(symbol: string, name: string, row: DhanQuoteRow): BulkRow {
  // Live-verified on 2026-11-21 (market CLOSED, a Saturday): ohlc.close came back EQUAL to last_price (looks like
  // "this session's own close", not the PREVIOUS day's close) and net_change was 0, for every symbol tried. Using
  // either as-is would make every quote show a flat/wrong 0% change, which is a visible regression versus the
  // existing Yahoo/NSE data, and would make whole-market movers (gainers/losers are sorted by changePct) come back
  // empty. Dhan's `net_change` is the field semantically meant to carry day-change; the most likely explanation for
  // both signals reading flat together is that Dhan simply does not populate live change fields outside trading
  // hours (a defensible broker UI choice, not a parsing bug) — so prefer it the moment it is ever genuinely nonzero
  // (which should start happening the next live trading session), and only fall back to ohlc.close when it differs
  // from last_price. If NEITHER signal is informative, say so honestly (prevClose: null, change/changePct: 0 — the
  // same convention this codebase already uses elsewhere, e.g. overview.ts's fxQuote, for "previous close unknown"),
  // rather than fabricate a number. Re-check this reasoning against a live trading day before fully trusting it.
  let prevCloseNote: number | null = null;
  if (typeof row.net_change === 'number' && row.net_change !== 0) prevCloseNote = row.last_price - row.net_change;
  else if (row.ohlc?.close != null && row.ohlc.close !== row.last_price) prevCloseNote = row.ohlc.close;
  const change = prevCloseNote != null ? row.last_price - prevCloseNote : 0;
  const changePct = prevCloseNote ? (change / prevCloseNote) * 100 : 0;
  return {
    symbol, name, series: 'EQ', price: row.last_price, prevClose: prevCloseNote, change, changePct,
    open: row.ohlc?.open ?? null, dayHigh: row.ohlc?.high ?? null, dayLow: row.ohlc?.low ?? null,
    volume: row.volume ?? null, tradedValue: row.volume != null ? row.volume * row.last_price : null,
    yearHigh: row['52_week_high'] ?? null, yearLow: row['52_week_low'] ?? null,
    change30dPct: null, change365dPct: null, updatedAt: Date.now(),
  };
}
let bulkCache: { snap: BulkSnapshot; at: number } | null = null;
const BULK_TTL_OPEN_MS = 20_000, BULK_TTL_CLOSED_MS = 5 * 60_000;
/**
 * Whole NSE_EQ universe (every symbol dhanSecurityFor() knows), polled via /marketfeed/quote in batches of <=1000
 * (a full pass over ~2,800 names is ~3 paced calls, a few seconds). null on total failure or when unconfigured.
 *
 * CHANGE% CAVEAT (dated 2026-11-21, unverified on a live trading session — markets were closed when this was built):
 * `ohlc.close` returned equal to `last_price` when I tested, which looks like "this session's own close", not the
 * PREVIOUS day's close that changePct needs. Until someone confirms the real semantics on a trading day, treat the
 * changePct computed here as suspect; callers that need a trustworthy changePct should prefer the Yahoo/NSE-derived
 * prevClose already computed elsewhere in this codebase over this module's own change/changePct fields.
 */
export async function getDhanBulk(symbols: string[]): Promise<BulkSnapshot | null> {
  if (!dhanConfigured()) { reportService('dhan', true, 'not configured: set DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN in backend/.env to use a live Dhan feed'); return null; }
  const now = Date.now();
  const ttl = isNseOpen(now) ? BULK_TTL_OPEN_MS : BULK_TTL_CLOSED_MS;
  if (bulkCache && now - bulkCache.at < ttl) return bulkCache.snap;
  await loadInstruments();
  if (!instrumentMap?.size) return null;
  const idToSymbol = new Map<number, string>();
  for (const [sym, inst] of instrumentMap) idToSymbol.set(inst.securityId, sym);
  const wantSymbols = symbols.length ? symbols.filter((s) => instrumentMap!.has(s.toUpperCase())) : [...instrumentMap.keys()];
  const ids = wantSymbols.map((s) => instrumentMap!.get(s.toUpperCase())!.securityId);
  if (!ids.length) return null;
  let data: Record<string, Record<string, DhanQuoteRow>>;
  try { data = await fetchMarketfeed('quote', { NSE_EQ: ids }); } catch (e) { reportService('dhan', false, String((e as Error)?.message ?? e)); return bulkCache?.snap ?? null; }
  const rows: BulkRow[] = [];
  for (const [idStr, row] of Object.entries(data.NSE_EQ ?? {})) {
    const symbol = idToSymbol.get(Number(idStr)); if (!symbol || row.last_price <= 0) continue;
    rows.push(dhanRowToBulkRow(symbol, symbol.replace('.NS', ''), row));
  }
  if (!rows.length) { reportService('dhan', false, 'Dhan answered with no usable rows'); return bulkCache?.snap ?? null; }
  const snap: BulkSnapshot = { index: 'DHAN', rows, bySymbol: new Map(rows.map((r) => [r.symbol, r])), asOfMs: now, fetchedAt: now };
  bulkCache = { snap, at: now };
  reportService('dhan', true, `${rows.length} stocks`);
  return snap;
}
export const clearDhanBulkCache = () => { bulkCache = null; };

/** A BulkRow (any source) as a Quote, honestly labelled as Dhan. */
export function dhanRowToQuote(symbol: string, name: string, r: BulkRow): import('../../../../shared/contract').Quote {
  return {
    symbol, name, price: r.price, change: r.change, changePct: r.changePct, currency: 'INR', prevClose: r.prevClose,
    dayHigh: r.dayHigh, dayLow: r.dayLow, fiftyTwoWeekHigh: r.yearHigh, fiftyTwoWeekLow: r.yearLow,
    marketState: isNseOpen() ? 'open' : 'closed', asOf: new Date(r.updatedAt ?? Date.now()).toISOString(), source: DHAN_BULK_SOURCE, delayMinutes: null,
  };
}

// ---------- single-symbol / index quote (for data.ts, overview.ts) ----------
export async function getDhanQuote(symbolNsOrIndex: string): Promise<BulkRow | null> {
  if (!dhanConfigured()) return null;
  const idx = await dhanIndexSecurityFor(symbolNsOrIndex);
  const inst = idx == null ? await dhanSecurityFor(symbolNsOrIndex) : null;
  if (idx == null && !inst) return null;
  const segment = idx != null ? 'IDX_I' : 'NSE_EQ';
  const id = idx ?? inst!.securityId;
  let data: Record<string, Record<string, DhanQuoteRow>>;
  try { data = await fetchMarketfeed('quote', { [segment]: [id] }); } catch { return null; }
  const row = data[segment]?.[String(id)];
  if (!row || !(row.last_price > 0)) return null;
  return dhanRowToBulkRow(symbolNsOrIndex, symbolNsOrIndex.replace('.NS', '').replace(/^\^/, ''), row);
}

// ---------- account status (for health / settings, never exposes the token) ----------
export interface DhanProfile { dataPlan: string; tokenValidity: string | null; tokenValidUntilMs: number | null }
function parseDhanTime(s: string | undefined): number | null {
  // "DD/MM/YYYY HH:mm" (IST)
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  return Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!, +m[4]!, +m[5]!) - 5.5 * 3600_000;
}
export async function getDhanProfile(): Promise<DhanProfile | null> {
  if (!dhanConfigured()) return null;
  try {
    const json = await dhanCall('/profile', { clientIdHeader: 'dhanClientId' });
    tokenValidUntilMs = parseDhanTime(json?.tokenValidity);
    const hoursLeft = tokenValidUntilMs == null ? null : (tokenValidUntilMs - Date.now()) / 3600_000;
    reportService('dhan-account', json?.dataPlan === 'Active', `data plan: ${json?.dataPlan ?? 'unknown'}${hoursLeft != null ? `, token valid ~${hoursLeft.toFixed(1)}h more` : ''}`);
    return { dataPlan: json?.dataPlan ?? 'unknown', tokenValidity: json?.tokenValidity ?? null, tokenValidUntilMs };
  } catch (e) { reportService('dhan-account', false, String((e as Error)?.message ?? e)); return null; }
}
export function dhanTokenHoursLeft(): number | null { return tokenValidUntilMs == null ? null : (tokenValidUntilMs - Date.now()) / 3600_000; }

// ---------- token renewal (defensive; NOT called automatically — see server.ts / scripts/smoke-dhan.ts) ----------
export interface RenewOutcome { ok: boolean; keysSeen?: string[]; reason?: string }
/**
 * Calls the documented-but-response-shape-unverified GET /v2/RenewToken. This is a DESTRUCTIVE call against a real
 * account: Dhan's docs say it "expires your current token" when it succeeds, so a bug here can lock the integration
 * out until a human regenerates a token on dhan.co. Intentionally NOT wired into any scheduler or startup path.
 * Call it explicitly (e.g. from scripts/smoke-dhan.ts, with the operator's knowledge) to learn the real response
 * shape once, or once a day in production AFTER that shape is confirmed. On success it rewrites DHAN_ACCESS_TOKEN
 * in backend/.env (preserving every other line) so a restart keeps working; on any failure to find a usable token
 * string, it leaves the in-memory token exactly as it was and returns ok:false.
 */
export async function renewTokenNow(): Promise<RenewOutcome> {
  if (!dhanConfigured()) return { ok: false, reason: 'not configured' };
  let json: any;
  try { json = await dhanCall('/RenewToken', { clientIdHeader: 'dhanClientId' }); }
  catch (e) { return { ok: false, reason: String((e as Error)?.message ?? e).replace(new RegExp(accessToken ?? '___', 'g'), '[redacted]') }; }
  try { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(RENEW_DEBUG, JSON.stringify({ at: new Date().toISOString(), topLevelKeys: Object.keys(json ?? {}) }, null, 2)); } catch { /* best effort */ }
  const candidates = [json?.accessToken, json?.access_token, json?.token, json?.data?.accessToken, json?.data?.access_token].filter((x) => typeof x === 'string' && x.length > 40);
  const newToken = candidates[0];
  if (!newToken) return { ok: false, keysSeen: Object.keys(json ?? {}), reason: 'no recognisable token field in the response (see dhan-renew-debug.json for the raw keys)' };
  accessToken = newToken;
  try {
    const envText = readFileSync(envFile, 'utf8');
    const replaced = /^DHAN_ACCESS_TOKEN=.*$/m.test(envText)
      ? envText.replace(/^DHAN_ACCESS_TOKEN=.*$/m, `DHAN_ACCESS_TOKEN=${newToken}`)
      : envText.replace(/\n?$/, `\nDHAN_ACCESS_TOKEN=${newToken}\n`);
    writeFileSync(envFile, replaced);
  } catch { /* in-memory token still updated; disk persistence is best-effort */ }
  return { ok: true, keysSeen: Object.keys(json ?? {}) };
}

// ---------- read-only status visibility (NOT renewal — see renewTokenNow's doc comment for why that is separate) ----------
let statusTimer: ReturnType<typeof setInterval> | null = null;
/** Periodically calls the read-only /v2/profile so health/Settings can show data-plan status and hours-left-on-token.
 *  Never renews anything; does nothing when Dhan is not configured. */
export function startDhanStatusChecker(intervalMs = 30 * 60_000): void {
  if (statusTimer || !dhanConfigured()) return;
  void getDhanProfile();
  statusTimer = setInterval(() => void getDhanProfile(), intervalMs);
  statusTimer.unref();
}
export function stopDhanStatusChecker(): void { if (statusTimer) clearInterval(statusTimer); statusTimer = null; }

export const __dhanInternals = { parseDhanTime, existsSync };
