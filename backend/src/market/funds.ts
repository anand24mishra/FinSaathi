import type { FundDetail, FundSummary, SipSimulation, SeriesPoint, Lang } from '../../../shared/contract';
import { mfSearch, mfScheme, MFAPI_SOURCE, type NavPoint } from './providers/mfapi';
import { cagrPct, xirr, type CashFlow } from './analytics/indicators';
import { DataError } from './data';
import { iso } from './http';

export const searchFunds = async (q: string): Promise<FundSummary[]> => {
  if (!q || q.trim().length < 2) return [];
  try { return await mfSearch(q.trim()); } catch (e: any) { throw new DataError('upstream_unavailable', 'Fund search is unavailable right now', true); }
};

/** NAV on or before `t` (null if history does not reach back that far, with 10 days slack). */
export function navAtOrBefore(navs: NavPoint[], t: number): NavPoint | null {
  if (!navs.length || navs[0].t > t + 10 * 86400_000) return null;
  let lo = 0, hi = navs.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (navs[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans >= 0 ? navs[ans] : navs[0];
}
const addYears = (t: number, y: number) => { const d = new Date(t); d.setUTCFullYear(d.getUTCFullYear() - y); return d.getTime(); };
const r2 = (n: number) => Math.round(n * 100) / 100;

export function downsample(navs: NavPoint[], max = 400): SeriesPoint[] {
  const step = Math.max(1, Math.ceil(navs.length / max));
  const out: SeriesPoint[] = [];
  for (let i = 0; i < navs.length; i += step) out.push({ t: navs[i].t, c: navs[i].nav });
  const last = navs[navs.length - 1];
  if (out[out.length - 1].t !== last.t) out.push({ t: last.t, c: last.nav });
  return out;
}

export async function getFundDetail(code: number): Promise<FundDetail> {
  if (!Number.isInteger(code) || code <= 0) throw new DataError('bad_request', 'Invalid scheme code');
  let r; try { r = await mfScheme(code); } catch (e: any) { throw new DataError('upstream_unavailable', `Fund ${code} could not be loaded`, true); }
  const d = r.data, last = d.navs[d.navs.length - 1];
  const ret = (y: number) => { const s = navAtOrBefore(d.navs, addYears(last.t, y)); return s && addYears(last.t, y) >= d.navs[0].t - 10 * 86400_000 ? (cagrPct(s.nav, last.nav, (last.t - s.t) / (365.25 * 86400_000)) ?? null) : null; };
  const rr = (n: number | null) => (n == null ? null : r2(n));
  return {
    schemeCode: d.schemeCode, name: d.name, house: d.house, category: d.category, nav: last.nav, navDate: new Date(last.t).toISOString().slice(0, 10),
    returns: { '1y': rr(ret(1)), '3y': rr(ret(3)), '5y': rr(ret(5)) }, series: downsample(d.navs),
    asOf: new Date(last.t).toISOString(), source: MFAPI_SOURCE, delayMinutes: null,
  };
}

/** Pure SIP simulation over a NAV history (monthly instalment on the same day each month, first NAV on/after that day). */
export function simulateSip(navs: NavPoint[], monthly: number, years: number) {
  const last = navs[navs.length - 1];
  const startWanted = addYears(last.t, years);
  const effYears = navs[0].t > startWanted + 10 * 86400_000 ? Math.floor(((last.t - navs[0].t) / (365.25 * 86400_000)) * 12) / 12 : years;
  const start = effYears === years ? startWanted : navs[0].t;
  const flows: CashFlow[] = []; let units = 0, invested = 0, idx = 0;
  const s = new Date(start);
  const n = Math.round(effYears * 12);
  for (let m = 0; m < n; m++) {
    const dt = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + m, Math.min(s.getUTCDate(), 28));
    while (idx < navs.length && navs[idx].t < dt) idx++;
    if (idx >= navs.length) break;
    const p = navs[idx];
    units += monthly / p.nav; invested += monthly; flows.push({ t: p.t, amount: -monthly });
  }
  const currentValue = units * last.nav;
  flows.push({ t: last.t, amount: currentValue });
  const x = invested > 0 ? xirr(flows) : null;
  return { invested: r2(invested), currentValue: r2(currentValue), absoluteReturnPct: invested > 0 ? r2(((currentValue - invested) / invested) * 100) : 0, xirrPct: x == null ? null : r2(x * 100), installments: flows.length - 1, effYears };
}

export async function runSipSim(schemeCode: number, monthly: number, years: number, lang: Lang = 'en'): Promise<SipSimulation> {
  let r; try { r = await mfScheme(schemeCode); } catch { throw new DataError('upstream_unavailable', `Fund ${schemeCode} could not be loaded`, true); }
  const navs = r.data.navs;
  if (navs.length < 30) throw new DataError('bad_request', 'Not enough NAV history to simulate');
  const sim = simulateSip(navs, monthly, years);
  const last = navs[navs.length - 1];
  const short = sim.effYears < years;
  const note = lang === 'hi'
    ? `यह असली बीते NAV पर आधारित ऐतिहासिक गणना है, भविष्य का अनुमान नहीं। मान लिया गया है कि हर महीने ${monthly} रुपये एक ही तारीख़ को लगे, बिना किसी शुल्क या टैक्स के।${short ? ` फ़ंड का इतिहास केवल ${sim.effYears.toFixed(1)} साल का है, इसलिए उतनी अवधि ली गई।` : ''}`
    : `Historical simulation on real past NAVs, not a forecast. Assumes ${monthly} rupees invested on the same day each month, ignoring fees and taxes.${short ? ` The fund has only ${sim.effYears.toFixed(1)} years of history, so that period was used.` : ''}`;
  return { schemeCode, monthly, years: short ? +sim.effYears.toFixed(1) : years, invested: sim.invested, currentValue: sim.currentValue, absoluteReturnPct: sim.absoluteReturnPct, xirrPct: sim.xirrPct, note, asOf: new Date(last.t).toISOString(), source: MFAPI_SOURCE, delayMinutes: null };
}
void iso;
