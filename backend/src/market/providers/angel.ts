// Angel One SmartAPI (free for account holders, live market data included).
//
// Auth: the server logs itself in (client code + PIN + a TOTP it generates from ANGEL_TOTP_SECRET), so there is no token to
// paste and no redeploy when one expires. The session is kept in memory only; it is re-created at boot, every
// RELOGIN_EVERY_MS, and immediately (once, single-flight) when any call comes back 401/403.
//
// Env (never logged): ANGEL_API_KEY, ANGEL_CLIENT_CODE, ANGEL_PIN, ANGEL_TOTP_SECRET.
//
// Quotes: POST /market/v1/quote/ mode FULL, <=50 tokens per call, ~1 request/second -> one paced queue. We therefore poll a
// bounded TRACKED set (Nifty 50 + Next 50 + indices + symbols users are watching, capped) rather than the whole market, and
// buildBulk() in bulkSource.ts overlays these exact rows on top of the broader NSE-website snapshot.
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { totp } from '../../core/totp';
import { reportService } from '../../core/health';
import type { BulkRow, BulkSnapshot } from './nseLive';
import { isNseOpen, parseNseTime } from './nseLive';
import { NIFTY50 } from '../reference/nifty50';
import { NIFTY_NEXT } from '../reference/niftyNext';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, '../../../data');
const SCRIP_CACHE = path.join(DATA_DIR, 'angel-scrip-master.json');
const SCRIP_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
const BASE = 'https://apiconnect.angelone.in';
export const ANGEL_SOURCE = 'NSE exchange data via Angel One SmartAPI (broker market feed)';

const RELOGIN_EVERY_MS = 6 * 3600_000;
const MAX_TRACKED = 200;
const BULK_TTL_OPEN_MS = 5_000, BULK_TTL_CLOSED_MS = 5 * 60_000;

type FetchFn = typeof fetch;
let fetchImpl: FetchFn = fetch;
export const __setAngelFetch = (f: FetchFn | null) => { fetchImpl = f ?? fetch; };

const env = () => ({
  apiKey: process.env.ANGEL_API_KEY?.trim(), clientCode: process.env.ANGEL_CLIENT_CODE?.trim(),
  pin: process.env.ANGEL_PIN?.trim(), totpSecret: process.env.ANGEL_TOTP_SECRET?.trim(),
});
export function angelConfigured(): boolean { const e = env(); return !!(e.apiKey && e.clientCode && e.pin && e.totpSecret); }

// ---------- session ----------
let jwt: string | null = null;
let loginInFlight: Promise<boolean> | null = null;
let reloginTimer: ReturnType<typeof setInterval> | null = null;
let lastLoginAt = 0;

function headers(withAuth: boolean): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json', Accept: 'application/json', 'X-UserType': 'USER', 'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1', 'X-ClientPublicIP': '127.0.0.1', 'X-MACAddress': '00:00:00:00:00:00',
    'X-PrivateKey': env().apiKey ?? '',
  };
  if (withAuth && jwt) h.Authorization = `Bearer ${jwt}`;
  return h;
}
const scrub = (s: string) => { let out = s; for (const v of [env().apiKey, env().pin, env().totpSecret, jwt]) if (v) out = out.split(v).join('[redacted]'); return out; };

async function postJson(url: string, body: unknown, withAuth: boolean): Promise<{ status: number; json: any }> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: headers(withAuth), body: JSON.stringify(body), signal: ctl.signal });
    const text = await res.text();
    let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
    return { status: res.status, json };
  } finally { clearTimeout(timer); }
}

/** Log in with a fresh TOTP. Single-flight: concurrent callers share one attempt. */
export function angelLogin(): Promise<boolean> {
  if (!angelConfigured()) return Promise.resolve(false);
  if (loginInFlight) return loginInFlight;
  loginInFlight = (async () => {
    const e = env();
    // A TOTP code is valid for its 30s window; if a retry lands in the same window Angel may reject a reused code, so retry across a window.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { json } = await postJson(`${BASE}/rest/auth/angelbroking/user/v1/loginByPassword`, { clientcode: e.clientCode, password: e.pin, totp: totp(e.totpSecret!) }, false);
        const tok = json?.data?.jwtToken;
        if (json?.status && typeof tok === 'string') {
          jwt = tok.replace(/^Bearer\s+/i, ''); lastLoginAt = Date.now();
          reportService('angel', true, 'logged in (auto-refreshing session)');
          return true;
        }
        reportService('angel', false, scrub(`login failed: ${json?.message ?? 'unknown'} (${json?.errorcode ?? '-'})`));
      } catch (err) { reportService('angel', false, scrub(`login error: ${(err as Error)?.message ?? err}`)); }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 31_000));
    }
    return false;
  })().finally(() => { loginInFlight = null; });
  return loginInFlight;
}

/** Call at server start. Logs in now and keeps the session fresh for the life of the process. */
export function startAngelSession(): void {
  if (reloginTimer || !angelConfigured()) return;
  void angelLogin();
  reloginTimer = setInterval(() => void angelLogin(), RELOGIN_EVERY_MS);
  reloginTimer.unref();
}
export function stopAngelSession(): void { if (reloginTimer) clearInterval(reloginTimer); reloginTimer = null; }

// ---------- paced queue: ~1 request/second ----------
class PacedQueue {
  private chain: Promise<unknown> = Promise.resolve(); private lastAt = 0;
  constructor(private minGapMs: number) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(async () => {
      const wait = this.minGapMs - (Date.now() - this.lastAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastAt = Date.now();
      return fn();
    });
    this.chain = p.catch(() => {});
    return p;
  }
}
let queue = new PacedQueue(1100);
export const __setAngelMinGapMs = (ms: number) => { queue = new PacedQueue(ms); };

/** Authenticated POST with one automatic re-login + retry on an expired session. */
async function secureCall(pathSuffix: string, body: unknown): Promise<any> {
  if (!angelConfigured()) throw new Error('Angel One is not configured');
  if (!jwt && !(await angelLogin())) throw new Error('Angel One login failed');
  const go = () => queue.run(() => postJson(`${BASE}${pathSuffix}`, body, true));
  let r = await go();
  const expired = r.status === 401 || r.json?.errorCode === 'AG8003' || r.status === 403 || r.json?.errorCode === 'AG8001' || r.json?.errorCode === 'AG8002' || r.json?.errorcode === 'AB8050';
  if (expired) { jwt = null; if (await angelLogin()) r = await go(); }
  if (r.status >= 400 || r.json?.status === false || r.json?.success === false) throw new Error(scrub(`Angel ${pathSuffix} -> HTTP ${r.status}: ${JSON.stringify(r.json).slice(0, 160)}`));
  return r.json;
}

// ---------- instrument master ----------
interface AngelInstr { token: string; exch: 'NSE' | 'BSE'; name: string }
let equityMap: Map<string, AngelInstr> | null = null;   // 'RELIANCE.NS' -> instrument
let indexMap: Map<string, AngelInstr> | null = null;    // '^NSEI' -> instrument
let loadingMaster: Promise<void> | null = null;
const INDEX_FALLBACK: Record<string, AngelInstr> = {
  '^NSEI': { token: '99926000', exch: 'NSE', name: 'Nifty 50' }, '^NSEBANK': { token: '99926009', exch: 'NSE', name: 'Bank Nifty' },
  '^BSESN': { token: '99919000', exch: 'BSE', name: 'Sensex' },
};
export function parseScripMaster(list: any[]): { equities: Map<string, AngelInstr>; indices: Map<string, AngelInstr> } {
  const equities = new Map<string, AngelInstr>();
  for (const r of list) {
    if (r?.exch_seg === 'NSE' && typeof r.symbol === 'string' && r.symbol.endsWith('-EQ') && r.token) {
      const sym = String(r.name || r.symbol.slice(0, -3)).trim().toUpperCase();
      if (sym) equities.set(`${sym}.NS`, { token: String(r.token), exch: 'NSE', name: sym });
    }
  }
  return { equities, indices: new Map(Object.entries(INDEX_FALLBACK)) };
}
async function loadMaster(): Promise<void> {
  if (equityMap && indexMap) return;
  if (loadingMaster) return loadingMaster;
  loadingMaster = (async () => {
    let list: any[] | null = null;
    try { if (Date.now() - statSync(SCRIP_CACHE).mtimeMs < 24 * 3600_000) list = JSON.parse(readFileSync(SCRIP_CACHE, 'utf8')); } catch { /* download */ }
    if (!list) {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 40_000);
        try {
          const res = await fetchImpl(SCRIP_URL, { signal: ctl.signal });
          if (!res.ok) throw new Error(`scrip master HTTP ${res.status}`);
          const text = await res.text(); list = JSON.parse(text);
          try { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(SCRIP_CACHE, text); } catch { /* best effort */ }
        } finally { clearTimeout(t); }
      } catch (e) { try { list = JSON.parse(readFileSync(SCRIP_CACHE, 'utf8')); } catch { throw e; } }
    }
    const { equities, indices } = parseScripMaster(list!);
    equityMap = equities; indexMap = indices;
  })().finally(() => { loadingMaster = null; });
  return loadingMaster;
}

// ---------- tracked set ----------
const extraTracked = new Map<string, number>();   // symbol -> last requested at
/** Ask the feed to include these symbols (bounded; oldest drop out). Called by the live feed with what users are watching. */
export function angelTrack(symbols: string[]): void {
  const now = Date.now();
  for (const s of symbols) { const u = s.toUpperCase(); if (u.endsWith('.NS')) extraTracked.set(u, now); }
}
function trackedSymbols(): string[] {
  const base = [...NIFTY50, ...NIFTY_NEXT].map((s) => s.symbol.toUpperCase());
  const baseSet = new Set(base);
  const extras = [...extraTracked.entries()].filter(([s]) => !baseSet.has(s)).sort((a, b) => b[1] - a[1]).slice(0, Math.max(0, MAX_TRACKED - base.length)).map(([s]) => s);
  return [...base, ...extras];
}

// ---------- quotes ----------
const num = (v: unknown): number | null => { const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(x) ? x : null; };
export function angelRowToBulkRow(symbol: string, name: string, r: any): BulkRow | null {
  const price = num(r?.ltp); if (price == null || price <= 0) return null;
  const prev = num(r.close);   // in the Angel quote, `close` is the PREVIOUS session's close
  const change = num(r.netChange) ?? (prev != null ? price - prev : 0);
  const changePct = num(r.percentChange) ?? (prev ? (change / prev) * 100 : 0);
  const vol = num(r.tradeVolume);
  const t = parseNseTime(r.exchFeedTime);
  return {
    symbol, name, series: 'EQ', price, prevClose: prev, change, changePct, open: num(r.open), dayHigh: num(r.high), dayLow: num(r.low),
    volume: vol, tradedValue: vol != null ? vol * price : null, yearHigh: num(r['52WeekHighPrice']), yearLow: num(r['52WeekLowPrice']),
    change30dPct: null, change365dPct: null, updatedAt: t ?? Date.now(),
  };
}
async function fetchQuotes(exch: 'NSE' | 'BSE', tokens: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < tokens.length; i += 50) {
    try {
      const json = await secureCall('/rest/secure/angelbroking/market/v1/quote/', { mode: 'FULL', exchangeTokens: { [exch]: tokens.slice(i, i + 50) } });
      if (Array.isArray(json?.data?.fetched)) out.push(...json.data.fetched);
    } catch (e) { reportService('angel', false, String((e as Error)?.message ?? e)); }
  }
  return out;
}

let bulkCache: { snap: BulkSnapshot; at: number } | null = null;
let bulkInFlight: Promise<BulkSnapshot | null> | null = null;
export const clearAngelBulkCache = () => { bulkCache = null; };
export const angelHas = (symbol: string): boolean => !!bulkCache?.snap.bySymbol.has(symbol.toUpperCase());
export const angelPeek = (): { snap: BulkSnapshot; at: number } | null => bulkCache;

/** Tracked-set snapshot, cached 5s while the market is open (5 min when closed). Concurrent callers share one fetch. */
export async function getAngelBulk(): Promise<BulkSnapshot | null> {
  if (!angelConfigured()) return null;
  const now = Date.now();
  const ttl = isNseOpen(now) ? BULK_TTL_OPEN_MS : BULK_TTL_CLOSED_MS;
  if (bulkCache && now - bulkCache.at < ttl) return bulkCache.snap;
  if (bulkInFlight) return bulkInFlight;
  bulkInFlight = (async () => {
    try {
      await loadMaster();
      const wanted = trackedSymbols().map((s) => [s, equityMap!.get(s)] as const).filter((x): x is readonly [string, AngelInstr] => !!x[1]);
      if (!wanted.length) return bulkCache?.snap ?? null;
      const rows = await fetchQuotes('NSE', wanted.map(([, i]) => i.token));
      const byToken = new Map(wanted.map(([s, i]) => [i.token, s]));
      const out: BulkRow[] = [];
      for (const r of rows) { const s = byToken.get(String(r.symbolToken)); if (!s) continue; const row = angelRowToBulkRow(s, s.replace('.NS', ''), r); if (row) out.push(row); }
      if (!out.length) { reportService('angel', false, 'Angel answered with no usable rows'); return bulkCache?.snap ?? null; }
      const asOf = Math.max(...out.map((r) => r.updatedAt ?? 0));
      const snap: BulkSnapshot = { index: 'ANGEL', rows: out, bySymbol: new Map(out.map((r) => [r.symbol, r])), asOfMs: asOf || now, fetchedAt: Date.now() };
      bulkCache = { snap, at: Date.now() };
      reportService('angel', true, `${out.length} stocks live`);
      return snap;
    } catch (e) { reportService('angel', false, scrub(String((e as Error)?.message ?? e))); return bulkCache?.snap ?? null; }
  })().finally(() => { bulkInFlight = null; });
  return bulkInFlight;
}

/** Single index quote ('^NSEI', '^NSEBANK', '^BSESN'), or null. */
export async function getAngelIndexQuote(caret: string): Promise<BulkRow | null> {
  if (!angelConfigured()) return null;
  try { await loadMaster(); } catch { /* fallback map still applies below */ }
  const inst = indexMap?.get(caret) ?? INDEX_FALLBACK[caret]; if (!inst) return null;
  const rows = await fetchQuotes(inst.exch, [inst.token]);
  const r = rows[0]; if (!r) return null;
  const row = angelRowToBulkRow(caret, inst.name, r);
  return row ? { ...row, series: null } : null;
}

/** A BulkRow as a Quote, honestly labelled as the Angel One broker feed. */
export function angelRowToQuote(symbol: string, name: string, r: BulkRow): import('../../../../shared/contract').Quote {
  return {
    symbol, name, price: r.price, change: r.change, changePct: r.changePct, currency: 'INR', prevClose: r.prevClose,
    dayHigh: r.dayHigh, dayLow: r.dayLow, fiftyTwoWeekHigh: r.yearHigh, fiftyTwoWeekLow: r.yearLow,
    marketState: isNseOpen() ? 'open' : 'closed', asOf: new Date(r.updatedAt ?? Date.now()).toISOString(), source: ANGEL_SOURCE, delayMinutes: null,
  };
}
