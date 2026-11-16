// Yahoo quoteSummary fundamentals (UNOFFICIAL; needs cookie + crumb). Best effort; local prototype only.
import { getJson, httpFetch, TtlCache, TTL, Limiter } from '../http';
import type { FundamentalsRaw } from './types';
import { YAHOO_UA } from './yahoo';

const limiter = new Limiter(3);
let session: { cookie: string; crumb: string; at: number } | null = null;

async function getSession(force = false): Promise<{ cookie: string; crumb: string }> {
  if (session && !force && Date.now() - session.at < 3600_000) return session;
  // fc.yahoo.com answers 404 but sets the consent cookie we need.
  let cookie = '';
  try {
    const r = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': YAHOO_UA }, redirect: 'manual' });
    cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  } catch { /* fall through; crumb call will fail */ }
  const res = await httpFetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': YAHOO_UA, Cookie: cookie }, limiter, retries: 1 });
  const crumb = (await res.text()).trim();
  if (!crumb || crumb.includes('<') || crumb.length > 40) throw new Error('Yahoo crumb unavailable');
  session = { cookie, crumb, at: Date.now() };
  return session;
}
const raw = (o: any): number | null => (o && typeof o.raw === 'number' && isFinite(o.raw) ? o.raw : null);

export function parseSummary(json: any): FundamentalsRaw {
  const r = json?.quoteSummary?.result?.[0];
  if (!r) throw new Error('Yahoo quoteSummary: empty');
  const fd = r.financialData ?? {}, ks = r.defaultKeyStatistics ?? {}, sd = r.summaryDetail ?? {}, ap = r.assetProfile ?? {};
  const pct = (v: number | null) => (v == null ? null : +(v * 100).toFixed(2));
  const de = raw(fd.debtToEquity); // Yahoo reports this in percent (e.g. 36.5 = 0.365x)
  const cap = raw(sd.marketCap) ?? raw(ks.marketCap);
  return {
    marketCapCr: cap == null ? null : Math.round(cap / 1e7),
    pe: raw(sd.trailingPE), pb: raw(ks.priceToBook), roePct: pct(raw(fd.returnOnEquity)),
    debtToEquity: de == null ? null : +(de / 100).toFixed(2),
    dividendYieldPct: pct(raw(sd.dividendYield)), epsTtm: raw(ks.trailingEps),
    revenueGrowthPct: pct(raw(fd.revenueGrowth)), profitMarginPct: pct(raw(fd.profitMargins)),
    sector: ap.sector ?? null, industry: ap.industry ?? null,
  };
}

async function fetchSummary(symbol: string, retry = true): Promise<FundamentalsRaw> {
  const s = await getSession();
  try {
    const json = await getJson(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=financialData,defaultKeyStatistics,summaryDetail,assetProfile&crumb=${encodeURIComponent(s.crumb)}`, { headers: { 'User-Agent': YAHOO_UA, Cookie: s.cookie }, limiter, retries: 1 });
    return parseSummary(json);
  } catch (e: any) {
    if (retry && (e?.status === 401 || e?.status === 403)) { session = null; await getSession(true); return fetchSummary(symbol, false); }
    throw e;
  }
}

let impl: (symbol: string) => Promise<FundamentalsRaw> = (s) => fetchSummary(s);
export const setFundamentalsImpl = (f: (symbol: string) => Promise<FundamentalsRaw>) => { impl = f; cache.clear(); };
const cache = new TtlCache<FundamentalsRaw>(TTL.fundamentals, 48 * 3600_000);
export async function getFundamentalsRaw(symbol: string): Promise<{ data: FundamentalsRaw; at: number; stale: boolean }> {
  const r = await cache.wrap(symbol, () => impl(symbol));
  return { data: r.value, at: r.at, stale: r.stale };
}
