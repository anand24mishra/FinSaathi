// AMFI-sourced mutual fund data via the free community API api.mfapi.in.
import { getJson, TtlCache, TTL, Limiter } from '../http';
import type { FundSummary } from '../../../../shared/contract';

export const MFAPI_SOURCE = 'AMFI via mfapi.in';
const limiter = new Limiter(3);
const H = { 'User-Agent': 'Mozilla/5.0' };

export interface NavPoint { t: number; nav: number; date: string }
export interface MfRaw { schemeCode: number; name: string; house: string | null; category: string | null; navs: NavPoint[] /* ascending */ }

export const parseNavDate = (s: string): number => { const [d, m, y] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };

export function parseScheme(json: any): MfRaw {
  const meta = json?.meta; const data = json?.data;
  if (!meta || !Array.isArray(data) || data.length === 0) throw new Error('mfapi: scheme has no NAV data');
  const navs: NavPoint[] = data
    .map((d: any) => ({ t: parseNavDate(d.date), nav: parseFloat(d.nav), date: d.date }))
    .filter((p: NavPoint) => isFinite(p.t) && isFinite(p.nav) && p.nav > 0)
    .sort((a: NavPoint, b: NavPoint) => a.t - b.t);
  return { schemeCode: Number(meta.scheme_code), name: String(meta.scheme_name), house: meta.fund_house ?? null, category: meta.scheme_category ?? null, navs };
}

const searchCache = new TtlCache<FundSummary[]>(TTL.funds);
const schemeCache = new TtlCache<MfRaw>(TTL.funds);

// Beginners want the plain "Direct plan, Growth option" version of a fund, not payout/dividend variants or closed schemes.
export const fundRank = (name: string): number => {
  const n = name.toLowerCase();
  let s = 0;
  if (/direct/.test(n)) s += 3;
  if (/growth/.test(n)) s += 3;
  if (/idcw|dividend|payout|reinvest|bonus|segregated|fmp|fixed term|interval/.test(n)) s -= 4;
  if (/regular/.test(n)) s -= 1;
  return s;
};
const STALE_NAV_MS = 45 * 24 * 3600 * 1000;

export async function mfSearch(q: string): Promise<FundSummary[]> {
  const r = await searchCache.wrap(q.toLowerCase(), async () => {
    const arr = await getJson<any[]>(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`, { headers: H, limiter });
    const all = (Array.isArray(arr) ? arr : []).map((x) => ({ schemeCode: Number(x.schemeCode), name: String(x.schemeName).replace(/\s+/g, ' ').trim() }));
    const ranked = all.map((f, i) => ({ f, i, s: fundRank(f.name) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.f);
    // Drop closed/inactive schemes: check the latest NAV date of the best candidates (bounded, polite).
    const head = ranked.slice(0, 14);
    const checked = await Promise.all(head.map(async (f) => {
      try {
        const j = await getJson<any>(`https://api.mfapi.in/mf/${f.schemeCode}/latest`, { headers: H, limiter });
        const d = j?.data?.[0]?.date;
        return d && Date.now() - parseNavDate(d) < STALE_NAV_MS ? f : null;
      } catch { return f; } // lookup failed: keep it rather than hide a possibly active fund
    }));
    const active = checked.filter((f): f is FundSummary => !!f);
    return active.length ? active.slice(0, 25) : ranked.slice(0, 25);
  });
  return r.value;
}
export async function mfScheme(code: number): Promise<{ data: MfRaw; at: number; stale: boolean }> {
  const r = await schemeCache.wrap(String(code), async () => parseScheme(await getJson(`https://api.mfapi.in/mf/${code}`, { headers: H, limiter })));
  return { data: r.value, at: r.at, stale: r.stale };
}
export const clearMfCache = () => { searchCache.clear(); schemeCache.clear(); };
