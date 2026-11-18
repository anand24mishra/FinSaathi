// Core market data service: quotes, series, stock list/detail, fundamentals, analysis, daily ideas.
import type { Quote, Series, Range, Indicators, Fundamentals, StockDetail, StockListItem, Analysis, DailyIdeas, IdeaItem, Lang } from '../../../shared/contract';
import { DISCLAIMER } from '../../../shared/contract';
import { getChart, YAHOO_SOURCE } from './providers/yahoo';
import { getFundamentalsRaw } from './providers/yahooFundamentals';
import type { ChartData } from './providers/types';
import { NIFTY50, refStock, displayName, isWhitelisted, isEquity, normaliseSymbol, NIFTY50_ASOF } from './reference/nifty50';
import { ensureUniverse, searchUniverse, universeItem } from './universe';
import { getBulk } from './bulkSource';
import { getBulkQuote } from './movers';
import { dhanConfigured, dhanRowToQuote, getDhanQuote } from './providers/dhan';
import { computeIndicators, performanceFrom, buildRulesAnalysis, buildFacts, scoreStock } from './analysis/engine';
import { METHODOLOGY, ideaOneLiner, evidenceText } from './analysis/text';
import { TtlCache, TTL, iso } from './http';
import { narrate } from '../ai/narrator';

export class DataError extends Error {
  constructor(public code: 'unknown_symbol' | 'upstream_unavailable' | 'bad_request', message: string, public retryable = false) { super(message); }
}

export const FUND_SOURCE = YAHOO_SOURCE + ' quoteSummary';
const CCY = new Set(['INR', 'USD', 'JPY', 'HKD']);

export function quoteFromChart(ch: ChartData): Quote {
  const m = ch.meta;
  const r4 = (n: number | null) => (n == null ? null : Math.round(n * 10000) / 10000);
  const prev = r4(m.prevClose);
  const change = prev != null ? m.price - prev : 0;
  const stock = refStock(m.symbol);
  return {
    symbol: m.symbol, name: stock?.name ?? (isWhitelisted(m.symbol) ? displayName(m.symbol) : m.name),
    price: r4(m.price)!, change: +change.toFixed(4), changePct: prev ? +((change / prev) * 100).toFixed(3) : 0,
    currency: (CCY.has(m.currency) ? m.currency : 'USD') as Quote['currency'], prevClose: prev, dayHigh: r4(m.dayHigh), dayLow: r4(m.dayLow),
    fiftyTwoWeekHigh: r4(m.fiftyTwoWeekHigh), fiftyTwoWeekLow: r4(m.fiftyTwoWeekLow), marketState: m.marketState,
    asOf: iso(m.marketTime), source: YAHOO_SOURCE, delayMinutes: null,
  };
}

export async function getQuote(symbol: string): Promise<Quote> {
  const bulk = getBulkQuote(symbol);   // fresh whole-market snapshot first (Dhan when configured, else NSE website; any listed stock, no Yahoo call)
  if (bulk) return bulk;
  if (symbol.startsWith('^') && dhanConfigured()) {   // indices are never in the bulk snapshot (it is equities only); try Dhan directly
    const row = await getDhanQuote(symbol).catch(() => null);
    if (row) return dhanRowToQuote(symbol, row.name, row);
  }
  try {
    const { data } = await getChart(symbol, '5d');
    return quoteFromChart(data);
  } catch (e) {
    // fall back to a cached 1y chart (clearly dated by its own asOf)
    try { const { data } = await getChart(symbol, '1y'); return quoteFromChart(data); } catch { throw e; }
  }
}

/** Failed symbols are simply absent from the result (callers show "unavailable"). */
export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const uniq = [...new Set(symbols.filter(Boolean))];
  if (uniq.length >= 5) await Promise.race([getBulk().catch(() => null), new Promise((r) => setTimeout(r, 3000))]);   // one NSE call (cached 25s) covers the whole list; null when NSE is blocked
  const res = await Promise.allSettled(uniq.map((s) => getQuote(s)));
  const out: Record<string, Quote> = {};
  res.forEach((r, i) => { if (r.status === 'fulfilled') out[uniq[i]] = r.value; });
  return out;
}

export const RANGES: Range[] = ['1mo', '3mo', '6mo', '1y', '5y'];
export function seriesFromChart(ch: ChartData, range: Range): Series {
  return { symbol: ch.meta.symbol, range, points: ch.candles.map((c) => ({ t: c.t, c: +c.c.toFixed(4) })), asOf: iso(ch.meta.marketTime), source: YAHOO_SOURCE, delayMinutes: null };
}
export async function getSeries(symbol: string, range: Range): Promise<Series> {
  await ensureUniverse();
  if (!isWhitelisted(symbol)) throw new DataError('unknown_symbol', `Symbol ${symbol} is not supported`);
  try {
    const { data } = await getChart(symbol, range);
    return seriesFromChart(data, range);
  } catch (e: any) { throw new DataError('upstream_unavailable', `Price history for ${symbol} is unavailable right now (${e?.message ?? 'error'})`, true); }
}

export const stockMeta = (symbol: string): { name: string; sector: string | null } | null => {
  const s = refStock(symbol) ?? (normaliseSymbol(symbol) ? refStock(normaliseSymbol(symbol)!) : undefined);
  if (s) return { name: s.name, sector: s.sector };
  const ns = normaliseSymbol(symbol);
  const u = ns ? universeItem(ns) : undefined;
  if (u) return { name: u.name, sector: null };   // sector for non-curated names comes lazily from Yahoo assetProfile (fundamentals)
  return isWhitelisted(symbol) ? { name: displayName(symbol), sector: null } : null;
};

// ---------- fundamentals ----------
export interface FundResult { fundamentals: Fundamentals | null; note: string | null }
export async function getFundamentals(symbol: string, lang: Lang = 'en'): Promise<FundResult> {
  if (!isEquity(symbol)) return { fundamentals: null, note: lang === 'hi' ? 'इस शेयर के कंपनी आँकड़े उपलब्ध नहीं हैं।' : 'Company numbers are not available for this symbol.' };
  try {
    const r = await getFundamentalsRaw(symbol);
    const d = r.data;
    const none = Object.values({ ...d, sector: null, industry: null }).every((v) => v == null);
    if (none) throw new Error('empty');
    return { fundamentals: { ...d, asOf: iso(r.at), source: FUND_SOURCE, delayMinutes: null }, note: r.stale ? (lang === 'hi' ? 'ताज़ा आँकड़े नहीं मिले; पुराने आँकड़े दिखाए गए हैं (asOf देखें)।' : 'Fresh numbers could not be loaded; showing older numbers (see asOf).') : null };
  } catch {
    return { fundamentals: null, note: lang === 'hi' ? 'कंपनी के आँकड़े (P/E, ROE, कर्ज़) अभी नहीं मिल पाए, इसलिए सिर्फ़ भाव की चाल दिखाई गई है।' : 'Company numbers (P/E, ROE, debt) could not be loaded right now, so only price behaviour is shown.' };
  }
}

// ---------- stocks ----------
export function matchStocks(q?: string) {
  const s = (q ?? '').trim().toLowerCase();
  if (!s) return NIFTY50;
  return NIFTY50.filter((x) => x.symbol.toLowerCase().includes(s) || x.name.toLowerCase().includes(s) || x.sector.toLowerCase().includes(s) || x.alias.some((a) => a.includes(s)) || x.hi.some((h) => h.includes(s)));
}
export const SEARCH_LIMIT = 25;
/** Max Yahoo lookups for search results that are not in the NSE bulk snapshot (keeps a search from fanning out to Yahoo). */
const SEARCH_YAHOO_CAP = 8;
/** No query: the Nifty 50 list (unchanged). With a query: curated matches first, then the WHOLE NSE universe (symbol/name search). */
export async function listStocks(q?: string): Promise<StockListItem[]> {
  const query = (q ?? '').trim();
  if (!query) {
    const quotes = await getQuotes(NIFTY50.map((x) => x.symbol));
    return NIFTY50.map((x) => ({ symbol: x.symbol, name: x.name, sector: x.sector, quote: quotes[x.symbol] ?? null }));
  }
  await ensureUniverse();
  const seen = new Set<string>();
  const list: { symbol: string; name: string; sector: string | null }[] = [];
  for (const x of matchStocks(query)) { if (!seen.has(x.symbol)) { seen.add(x.symbol); list.push({ symbol: x.symbol, name: x.name, sector: x.sector }); } }
  for (const u of searchUniverse(query, SEARCH_LIMIT)) { if (!seen.has(u.symbol)) { seen.add(u.symbol); list.push({ symbol: u.symbol, name: u.name, sector: null }); } }
  const shown = list.slice(0, SEARCH_LIMIT);
  await Promise.race([getBulk().catch(() => null), new Promise((r) => setTimeout(r, 3000))]);
  const have = shown.filter((x) => getBulkQuote(x.symbol));
  const need = shown.filter((x) => !getBulkQuote(x.symbol)).slice(0, SEARCH_YAHOO_CAP);
  const quotes = await getQuotes([...have, ...need].map((x) => x.symbol));
  return shown.map((x) => ({ ...x, quote: quotes[x.symbol] ?? null }));
}

export async function getStockDetail(symbolIn: string, lang: Lang = 'en'): Promise<StockDetail> {
  await ensureUniverse();
  const symbol = normaliseSymbol(symbolIn);
  if (!symbol) throw new DataError('unknown_symbol', `Unknown symbol ${symbolIn}`);
  let year: ChartData;
  try { year = (await getChart(symbol, '1y')).data; }
  catch (e: any) { throw new DataError('upstream_unavailable', `Price data for ${symbol} is unavailable right now`, true); }
  let quote: Quote;
  try { quote = await getQuote(symbol); } catch { quote = quoteFromChart(year); }
  const [fund] = await Promise.all([getFundamentals(symbol, lang)]);
  const meta = stockMeta(symbol);
  return {
    quote, series: seriesFromChart(year, '1y'), indicators: computeIndicators(year.candles), fundamentals: fund.fundamentals, fundamentalsNote: fund.note,
    performance: performanceFrom(year.candles), sector: fund.fundamentals?.sector ?? meta?.sector ?? null,
  };
}

// ---------- analysis ----------
const analysisCache = new TtlCache<Analysis>(TTL.analysis, 6 * 3600_000);
export async function getAnalysis(symbolIn: string, lang: Lang, opts: { skipLlm?: boolean } = {}): Promise<Analysis> {
  await ensureUniverse();
  const symbol = normaliseSymbol(symbolIn);
  if (!symbol || !isEquity(symbol)) throw new DataError('unknown_symbol', `Unknown or unsupported symbol ${symbolIn}`);
  const r = await analysisCache.wrap(`${symbol}:${lang}:${opts.skipLlm ? 0 : 1}`, async () => {
    let year: ChartData;
    try { year = (await getChart(symbol, '1y')).data; } catch { throw new DataError('upstream_unavailable', `Price data for ${symbol} is unavailable right now`, true); }
    let quote: Quote; try { quote = await getQuote(symbol); } catch { quote = quoteFromChart(year); }
    const fund = await getFundamentals(symbol, lang);
    const meta = stockMeta(symbol)!;
    const base = buildRulesAnalysis({ symbol, name: meta.name, sector: fund.fundamentals?.sector ?? meta.sector, quote, candles: year.candles, seriesAsOf: iso(year.meta.marketTime), fundamentals: fund.fundamentals, lang });
    if (opts.skipLlm) return base;
    return await narrate(base, lang);
  });
  return r.value;
}

// ---------- daily ideas ----------
const ideasCache = new Map<string, { at: number; ttl: number; value: DailyIdeas }>();
export async function getDailyIdeas(lang: Lang): Promise<DailyIdeas> {
  const hit = ideasCache.get(lang);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;
  const deadline = Date.now() + 40_000;
  let missingFund = 0, failed = 0;
  const results = await Promise.all(NIFTY50.map(async (st): Promise<{ item: IdeaItem } | null> => {
    try {
      const year = (await getChart(st.symbol, '1y')).data;
      if (year.candles.length < 60) throw new Error('short history');
      const quote = quoteFromChart(year);
      let fundamentals: Fundamentals | null = null;
      const left = deadline - Date.now();
      if (left > 0) {
        const f = await Promise.race([getFundamentals(st.symbol, lang), new Promise<null>((res) => setTimeout(() => res(null), left))]);
        fundamentals = f?.fundamentals ?? null;
      }
      if (!fundamentals) missingFund++;
      const a = buildRulesAnalysis({ symbol: st.symbol, name: st.name, sector: st.sector, quote, candles: year.candles, seriesAsOf: iso(year.meta.marketTime), fundamentals, lang });
      const want = a.stance === 'favourable' ? 'positive' : 'negative';
      const reasons = a.evidence.filter((e) => e.direction === want).slice(0, 3).map((e) => `${e.label}: ${e.value}`);
      const ind = computeIndicators(year.candles);
      const sc = scoreStock({ price: quote.price, ind, low52: quote.fiftyTwoWeekLow, high52: quote.fiftyTwoWeekHigh, fundamentals, sector: st.sector, bars: year.candles.length });
      const facts = buildFacts({ symbol: st.symbol, name: st.name, sector: st.sector, quote, candles: year.candles, seriesAsOf: '', fundamentals, lang }, ind, sc);
      return { item: { symbol: st.symbol, name: st.name, stance: a.stance, score: a.score, oneLiner: ideaOneLiner(lang, facts), price: quote.price, changePct: quote.changePct, reasons } };
    } catch { failed++; return null; }
  }));
  const items = results.filter((x): x is { item: IdeaItem } => !!x).map((x) => x.item);
  const favourable = items.filter((i) => i.stance === 'favourable').sort((a, b) => b.score - a.score).slice(0, 5);
  const cautious = items.filter((i) => i.stance === 'cautious').sort((a, b) => a.score - b.score).slice(0, 5);
  const note = lang === 'hi'
    ? ` ${items.length}/${NIFTY50.length} शेयरों का आकलन हो पाया${failed ? ` (${failed} का भाव नहीं मिला)` : ''}${missingFund ? `; ${missingFund} शेयरों में कंपनी आँकड़े नहीं जुड़ पाए` : ''}। सूची हर 15 मिनट में नए सिरे से बनती है।`
    : ` ${items.length} of ${NIFTY50.length} stocks could be scored${failed ? ` (${failed} had no price data)` : ''}${missingFund ? `; company numbers were not available for ${missingFund}` : ''}. The list refreshes about every 15 minutes. Universe snapshot: ${NIFTY50_ASOF}.`;
  const value: DailyIdeas = {
    asOf: iso(), universe: lang === 'hi' ? 'बड़ी कंपनियाँ (निफ़्टी 50 के आसपास के शेयर)' : 'Large-cap universe (Nifty 50 names)',
    favourable, cautious, methodology: METHODOLOGY[lang] + note, disclaimer: DISCLAIMER[lang],
  };
  if (items.length > 0) ideasCache.set(lang, { at: Date.now(), ttl: missingFund > 5 ? 2 * 60_000 : TTL.analysis, value });
  return value;
}
export const clearIdeasCache = () => { ideasCache.clear(); analysisCache.clear(); };
void evidenceText;
