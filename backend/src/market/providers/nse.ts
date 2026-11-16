// NSE India public JSON (UNOFFICIAL; needs a cookie session; endpoints move — NSE now redirects to nseindia.in).
// Best effort, local prototype only. Failure => callers return available:false with an honest note.
import { getJson, Limiter, TtlCache, TTL } from '../http';

export const NSE_SOURCE = 'NSE India (unofficial public endpoints)';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HOSTS = ['https://www.nseindia.in', 'https://www.nseindia.com'];
const limiter = new Limiter(2);
let jar: { host: string; cookie: string; at: number } | null = null;

async function warm(host: string): Promise<string> {
  // The landing page may answer 403 yet still sets the Akamai cookies the API wants.
  const r = await fetch(host, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

export async function nseGet<T = any>(path: string): Promise<T> {
  let lastErr: unknown;
  for (const host of HOSTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!jar || jar.host !== host || attempt > 0 || Date.now() - jar.at > 10 * 60_000) jar = { host, cookie: await warm(host).catch(() => ''), at: Date.now() };
        const j = await getJson<T>(`${host}${path}`, { headers: { 'User-Agent': UA, Accept: '*/*', Referer: host + '/', Cookie: jar.cookie }, limiter, retries: 0 });
        return j;
      } catch (e) { lastErr = e; }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('NSE unavailable');
}

export interface NseIpoRow {
  name: string; symbol: string | null; series: string | null; status: 'open' | 'upcoming' | 'closed' | 'listed';
  openDate: string | null; closeDate: string | null; listingDate: string | null; priceBand: string | null;
  issueSizeShares: number | null; subscriptionTimes: number | null;
}
const MON: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** "18-Nov-2026" -> "2026-11-18" */
export function nseDate(s: any): string | null {
  const m = String(s ?? '').trim().match(/^(\d{1,2})-([A-Za-z]{3})[A-Za-z]*-(\d{4})$/);
  if (!m) return null;
  const mo = MON[m[2].toLowerCase()]; if (mo == null) return null;
  return `${m[3]}-${String(mo + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
const num = (v: any) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : null; };

export function mapCurrent(rows: any[]): NseIpoRow[] {
  return rows.map((r) => ({
    name: String(r.companyName), symbol: r.symbol ?? null, series: r.series ?? null, status: 'open' as const,
    openDate: nseDate(r.issueStartDate), closeDate: nseDate(r.issueEndDate), listingDate: null, priceBand: r.issuePrice ? String(r.issuePrice).trim() : null,
    issueSizeShares: num(r.issueSize), subscriptionTimes: num(r.noOfTime),
  }));
}
export function mapUpcoming(rows: any[]): NseIpoRow[] {
  return rows.map((r) => ({
    name: String(r.companyName), symbol: r.symbol ?? null, series: r.series ?? null, status: 'upcoming' as const,
    openDate: nseDate(r.issueStartDate), closeDate: nseDate(r.issueEndDate), listingDate: null, priceBand: r.issuePrice ? String(r.issuePrice).trim() : null,
    issueSizeShares: num(r.issueSize), subscriptionTimes: null,
  }));
}
export function mapPast(rows: any[]): NseIpoRow[] {
  return rows.map((r) => ({
    name: String(r.companyName ?? r.company), symbol: r.symbol ?? null, series: r.securityType ?? null, status: 'listed' as const,
    openDate: nseDate(r.ipoStartDate), closeDate: nseDate(r.ipoEndDate), listingDate: nseDate(r.listingDate), priceBand: r.priceRange ? String(r.priceRange).trim() : null,
    issueSizeShares: null, subscriptionTimes: null,
  }));
}

export interface IpoRaw { rows: NseIpoRow[]; fetchedAt: number; currentCount: number | null }
const ipoCache = new TtlCache<IpoRaw>(TTL.ipo);
export async function fetchIpos(): Promise<{ data: IpoRaw; stale: boolean }> {
  const r = await ipoCache.wrap('ipo', async () => {
    const [cur, up, past] = await Promise.allSettled([nseGet<any[]>('/api/ipo-current-issue'), nseGet<any[]>('/api/all-upcoming-issues?category=ipo'), nseGet<any[]>('/api/public-past-issues')]);
    if (cur.status === 'rejected' && up.status === 'rejected' && past.status === 'rejected') throw cur.reason;
    const rows = [
      ...(cur.status === 'fulfilled' && Array.isArray(cur.value) ? mapCurrent(cur.value) : []),
      ...(up.status === 'fulfilled' && Array.isArray(up.value) ? mapUpcoming(up.value) : []),
      ...(past.status === 'fulfilled' && Array.isArray(past.value) ? mapPast(past.value).slice(0, 8) : []),
    ];
    return { rows, fetchedAt: Date.now(), currentCount: cur.status === 'fulfilled' && Array.isArray(cur.value) ? cur.value.length : null };
  });
  return { data: r.value, stale: r.stale };
}

export interface FlowsRaw { fiiNetCr: number | null; diiNetCr: number | null; date: string | null; fetchedAt: number }
const flowCache = new TtlCache<FlowsRaw>(TTL.flows);
export function parseFlows(rows: any[]): FlowsRaw {
  if (!Array.isArray(rows)) throw new Error('NSE flows: unexpected shape');
  const fii = rows.find((r) => /FII|FPI/i.test(String(r.category)));
  const dii = rows.find((r) => /DII/i.test(String(r.category)) && !/FII/i.test(String(r.category)));
  if (!fii && !dii) throw new Error('NSE flows: no rows');
  return { fiiNetCr: fii ? num(fii.netValue) : null, diiNetCr: dii ? num(dii.netValue) : null, date: nseDate(fii?.date ?? dii?.date), fetchedAt: Date.now() };
}
export async function fetchFlows(): Promise<{ data: FlowsRaw; stale: boolean }> {
  const r = await flowCache.wrap('flows', async () => parseFlows(await nseGet<any[]>('/api/fiidiiTradeReact')));
  return { data: r.value, stale: r.stale };
}
export const clearNseCache = () => { ipoCache.clear(); flowCache.clear(); jar = null; };
