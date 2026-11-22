// Company fundamentals from Screener.in public company pages (free, no key). Unofficial HTML scraping: kept polite
// (2 concurrent, results cached 6h by the caller) and best effort. Used first because Yahoo's fundamentals endpoint blocks
// cloud hosts such as Render. Fields map onto the same FundamentalsRaw shape the rest of the app already consumes.
import { HttpError, Limiter, getText } from '../http';
import type { FundamentalsRaw } from './types';

const limiter = new Limiter(2);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const num = (s: string | undefined | null): number | null => {
  if (!s) return null;
  const x = Number(s.replace(/[₹,%\s]|Cr\.?/g, '').replace(/^\+/, ''));
  return Number.isFinite(x) && s.trim() !== '' ? x : null;
};

function sectionRows(html: string, id: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const i = html.indexOf(`id="${id}"`); if (i < 0) return out;
  const rest = html.slice(i); const end = rest.indexOf('</section>');
  const sec = end > 0 ? rest.slice(0, end) : rest;
  for (const tr of sec.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []).map(strip);
    if (cells.length > 1) out.set(cells[0]!.replace(/[+\s]+$/, ''), cells.slice(1));
  }
  return out;
}
const last = (cells: string[] | undefined): number | null => {
  if (!cells) return null;
  for (let i = cells.length - 1; i >= 0; i--) { const v = num(cells[i]); if (v != null) return v; }
  return null;
};

export function parseScreener(html: string): FundamentalsRaw {
  const tr = html.match(/id="top-ratios">([\s\S]*?)<\/ul>/);
  if (!tr) throw new Error('Screener: no ratios block');
  const top = new Map<string, number | null>();
  for (const li of tr[1]!.match(/<li[\s\S]*?<\/li>/g) ?? []) {
    const name = li.match(/class="name">([\s\S]*?)<\/span>/)?.[1];
    const val = li.match(/class="number">([^<]*)</)?.[1];
    if (name) top.set(strip(name), num(val));
  }
  const price = top.get('Current Price') ?? null, bv = top.get('Book Value') ?? null;
  const bs = sectionRows(html, 'balance-sheet'), pl = sectionRows(html, 'profit-loss');
  const equity = (last(bs.get('Equity Capital')) ?? 0) + (last(bs.get('Reserves')) ?? 0);
  const borrowings = last(bs.get('Borrowings'));
  const sales = last(pl.get('Sales')), profit = last(pl.get('Net Profit'));
  const broad = html.match(/title="Broad Sector">([^<]*)</)?.[1]?.trim() ?? null;
  const industry = html.match(/title="Industry">([^<]*)</)?.[1]?.trim() ?? null;
  const r2 = (v: number | null) => (v == null ? null : +v.toFixed(2));
  const out: FundamentalsRaw = {
    marketCapCr: top.get('Market Cap') ?? null, pe: top.get('Stock P/E') ?? null,
    pb: price && bv ? r2(price / bv) : null, roePct: top.get('ROE') ?? null,
    // Debt/equity is not meaningful for banks and lenders (deposits are not debt), so it is left empty there.
    debtToEquity: borrowings != null && equity > 0 && broad !== 'Financial Services' ? r2(borrowings / equity) : null,
    dividendYieldPct: top.get('Dividend Yield') ?? null, epsTtm: last(pl.get('EPS in Rs')),
    revenueGrowthPct: last(pl.get('Sales growth')), profitMarginPct: sales && profit != null ? r2((profit / sales) * 100) : null,
    sector: broad ? broad.replace(/&amp;/g, '&') : null, industry: industry ? industry.replace(/&amp;/g, '&') : null,
  };
  if (Object.entries(out).every(([k, v]) => k === 'sector' || k === 'industry' || v == null)) throw new Error('Screener: no usable numbers');
  return out;
}

/** symbol like "TCS.NS" -> fundamentals. Tries the consolidated page, then standalone. */
export async function fetchScreener(symbol: string): Promise<FundamentalsRaw> {
  const code = encodeURIComponent(symbol.replace(/\.NS$/i, ''));
  let lastErr: unknown;
  for (const path of [`/company/${code}/consolidated/`, `/company/${code}/`]) {
    try {
      const html = await getText(`https://www.screener.in${path}`, { headers: { 'User-Agent': UA, Accept: 'text/html' }, limiter, retries: 1, timeoutMs: 12_000 });
      return parseScreener(html);
    } catch (e) { lastErr = e; if (!(e instanceof HttpError) || (e.status !== 404 && e.status !== 302)) { /* try the next page anyway */ } }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Screener: unavailable');
}
