// TIERING (how far each part of the market is covered, so we never hammer Yahoo):
//   1. On demand, ALL ~2,000+ NSE-listed stocks: GET /calls/:symbol (getStockCall) builds one full call from a 1y chart + fundamentals, cached 15 min.
//   2. Background feed (getCallsFeed): full calls for the Nifty 50, a cheap candle screen over the ~57-name large/mid-cap list (niftyNext.ts),
//      and (optional) up to MOVER_SEED_CAP extra rising-star candidates seeded from the NSE whole-market near-52-week-high list.
//   3. Whole-market screen (market/movers.ts): top gainers/losers, volume leaders, near 52w high/low from ONE NSE bulk call, no Yahoo at all.
// Calls engine: explicit research calls (BUY/ACCUMULATE/HOLD/REDUCE/SELL) from transparent rules. NO LLM here (generatedBy: 'rules').
// A call blends "lenses": Buffett (quality+value), Jhunjhunwala (India growth), technical (existing engine), sentiment (headlines).
// Labels are structured research output for study, never a promise; levels are illustrative. Educational, not advice.
import type { CallAction, CallMode, CallsFeed, Evidence, Fundamentals, Indicators, Lang, PersonaScore, Quote, StockCall } from '../../../../shared/contract';
import { DISCLAIMER } from '../../../../shared/contract';
import { DataError, quoteFromChart, getFundamentals, stockMeta } from '../data';
import { getChart } from '../providers/yahoo';
import type { Candle, ChartData } from '../providers/types';
import { NIFTY50, normaliseSymbol, isEquity } from '../reference/nifty50';
import { ensureUniverse } from '../universe';
import { getMoversFeedSoft } from '../movers';
import { NIFTY_NEXT, NIFTY_NEXT_ASOF } from '../reference/niftyNext';
import { computeIndicators, performanceFrom, scoreStock, illustrativeLevels, type ScoreResult } from './engine';
import { buffettLens, BUFFETT_LABEL, RISK_FREE_PCT } from './personas/buffett';
import { jhunjhunwalaLens, JHUN_LABEL } from './personas/jhunjhunwala';
import { sentimentLens, SENTIMENT_LABEL, type SentimentResult } from './personas/sentiment';
import type { L2 } from './personas/common';
import { num } from './personas/common';
import { Limiter, TtlCache, TTL, iso } from '../http';
import { inr } from '../format';

// ---------- documented parameters ----------
/** Invest weights (renormalised over the lenses that have data). */
export const INVEST_WEIGHTS = { buffett: 0.4, jhunjhunwala: 0.3, technical: 0.3 } as const;
/** Trade weights (renormalised). */
export const TRADE_WEIGHTS = { technical: 0.75, sentiment: 0.25 } as const;
/** Invest action thresholds on the 0-100 composite: >=78 BUY, >=64 ACCUMULATE, >=45 HOLD, >=32 REDUCE, else SELL. */
export const INVEST_CUTS = { buy: 78, accumulate: 64, hold: 45, reduce: 32 } as const;
/** Trade uses only BUY / HOLD / SELL: >=66 BUY, <=38 SELL, else HOLD (a swing trade has no "accumulate"). */
export const TRADE_CUTS = { buy: 66, sell: 38 } as const;

export function actionFor(score: number, mode: CallMode): CallAction {
  if (mode === 'trade') return score >= TRADE_CUTS.buy ? 'BUY' : score <= TRADE_CUTS.sell ? 'SELL' : 'HOLD';
  return score >= INVEST_CUTS.buy ? 'BUY' : score >= INVEST_CUTS.accumulate ? 'ACCUMULATE' : score >= INVEST_CUTS.hold ? 'HOLD' : score >= INVEST_CUTS.reduce ? 'REDUCE' : 'SELL';
}
const ACTION_RANK: Record<CallAction, number> = { SELL: 0, REDUCE: 1, HOLD: 2, ACCUMULATE: 3, BUY: 4 };
export const capAtHold = (a: CallAction): CallAction => (ACTION_RANK[a] > ACTION_RANK.HOLD ? 'HOLD' : a);

/** Weighted average over the lenses that have a score; weights renormalised. Null when no lens has data. */
export function composite(parts: { score: number | null; w: number }[]): { score: number; used: number } | null {
  const avail = parts.filter((p): p is { score: number; w: number } => p.score != null);
  const den = avail.reduce((a, p) => a + p.w, 0);
  if (!avail.length || den === 0) return null;
  return { score: Math.round(avail.reduce((a, p) => a + p.score * p.w, 0) / den), used: avail.length };
}
/** high: all lenses present, spread <= 15 points, >= 200 bars. medium: >= 2 lenses and spread <= 30. else low. */
export function convictionFor(scores: (number | null)[], expected: number, bars: number): 'low' | 'medium' | 'high' {
  const s = scores.filter((x): x is number => x != null);
  if (s.length < 2) return 'low';
  const spread = Math.max(...s) - Math.min(...s);
  if (s.length === expected && spread <= 15 && bars >= 200) return 'high';
  return spread <= 30 ? 'medium' : 'low';
}

// ---------- inputs (language independent, cached per symbol) ----------
interface Inputs {
  symbol: string; name: string; sector: string | null; year: ChartData; quote: Quote; fundamentals: Fundamentals | null;
  ind: Indicators; perf: ReturnType<typeof performanceFrom>; tech: ScoreResult; sentiment: SentimentResult | null;
}
const inputsCache = new TtlCache<Inputs>(TTL.analysis, 6 * 3600_000);
async function loadInputs(symbol: string): Promise<Inputs> {
  return (await inputsCache.wrap(symbol, async () => {
    let year: ChartData;
    try { year = (await getChart(symbol, '1y')).data; } catch { throw new DataError('upstream_unavailable', `Price data for ${symbol} is unavailable right now`, true); }
    if (year.candles.length < 60) throw new DataError('upstream_unavailable', `Not enough price history for ${symbol}`, true);
    const quote = quoteFromChart(year);
    const [fund, sentiment] = await Promise.all([getFundamentals(symbol, 'en'), sentimentLens(symbol).catch(() => null)]);
    const meta = stockMeta(symbol)!;
    const ind = computeIndicators(year.candles);
    // Technical lens deliberately EXCLUDES fundamentals (they have their own lenses), so nothing is double counted.
    const tech = scoreStock({ price: quote.price, ind, low52: quote.fiftyTwoWeekLow, high52: quote.fiftyTwoWeekHigh, fundamentals: null, sector: meta.sector, bars: year.candles.length });
    return { symbol, name: meta.name, sector: meta.sector ?? fund.fundamentals?.sector ?? null, year, quote, fundamentals: fund.fundamentals, ind, perf: performanceFrom(year.candles), tech, sentiment };
  })).value;
}

const pick = (l: L2, lang: Lang) => l[lang];
const T = (lang: Lang, en: string, hi: string) => (lang === 'hi' ? hi : en);

// ---------- technical facts ----------
interface Fact { l: L2; dir: 'positive' | 'negative' | 'neutral'; label: L2; value: string }
function techFacts(i: Inputs): Fact[] {
  const { quote: q, ind, perf } = i;
  const out: Fact[] = [];
  if (ind.sma200 != null) {
    const d = ((q.price / ind.sma200) - 1) * 100, up = d >= 0;
    out.push({ dir: up ? 'positive' : 'negative', label: { en: 'Price vs 200-day average', hi: 'भाव बनाम 200 दिन की औसत' }, value: `${d >= 0 ? '+' : ''}${num(d)}%`,
      l: up ? { en: `Price ${inr(q.price)} is ${num(d)}% above its 200-day average`, hi: `भाव ${inr(q.price)} अपनी 200 दिन की औसत से ${num(d)}% ऊपर है` } : { en: `Price ${inr(q.price)} is ${num(-d)}% below its 200-day average`, hi: `भाव ${inr(q.price)} अपनी 200 दिन की औसत से ${num(-d)}% नीचे है` } });
  }
  if (ind.rsi14 != null) {
    const r = ind.rsi14;
    const dir = r >= 50 && r < 70 ? 'positive' : r >= 70 || r < 35 ? 'negative' : 'neutral';
    out.push({ dir, label: { en: 'RSI (14)', hi: 'RSI (14)' }, value: num(r),
      l: r >= 70 ? { en: `RSI ${num(r)} is stretched (70 and above)`, hi: `RSI ${num(r)} खिंचा हुआ है (70 या ऊपर)` } : r < 35 ? { en: `RSI ${num(r)} shows weak momentum (below 35)`, hi: `RSI ${num(r)} कमज़ोर चाल दिखाता है (35 से नीचे)` } : { en: `RSI ${num(r)} shows ${r >= 50 ? 'healthy' : 'soft'} momentum`, hi: `RSI ${num(r)} ${r >= 50 ? 'स्वस्थ' : 'नरम'} चाल दिखाता है` } });
  }
  if (ind.macd) out.push({ dir: ind.macd.hist > 0 ? 'positive' : 'negative', label: { en: 'MACD histogram', hi: 'MACD हिस्टोग्राम' }, value: num(ind.macd.hist, 2),
    l: ind.macd.hist > 0 ? { en: `MACD histogram +${num(ind.macd.hist, 2)}: momentum is rising`, hi: `MACD हिस्टोग्राम +${num(ind.macd.hist, 2)}: चाल बढ़ रही है` } : { en: `MACD histogram ${num(ind.macd.hist, 2)}: momentum is fading`, hi: `MACD हिस्टोग्राम ${num(ind.macd.hist, 2)}: चाल कमज़ोर पड़ रही है` } });
  const hi = q.fiftyTwoWeekHigh, lo = q.fiftyTwoWeekLow;
  if (hi != null && lo != null && hi > lo) {
    const pos = Math.round(((q.price - lo) / (hi - lo)) * 100);
    out.push({ dir: pos >= 75 ? 'positive' : pos <= 25 ? 'negative' : 'neutral', label: { en: 'Position in 52-week range', hi: '52 हफ़्ते की रेंज में स्थिति' }, value: `${pos}%`,
      l: { en: `Price sits at ${pos}% of its 52-week range (${inr(lo)} to ${inr(hi)})`, hi: `भाव 52 हफ़्ते की रेंज (${inr(lo)} से ${inr(hi)}) के ${pos}% पर है` } });
  }
  if (perf['3m'] != null) out.push({ dir: perf['3m'] > 5 ? 'positive' : perf['3m'] < -5 ? 'negative' : 'neutral', label: { en: '3-month change', hi: '3 महीने की चाल' }, value: `${perf['3m'] >= 0 ? '+' : ''}${num(perf['3m'])}%`,
    l: perf['3m'] >= 0 ? { en: `Up ${num(perf['3m'])}% over 3 months`, hi: `3 महीने में ${num(perf['3m'])}% ऊपर` } : { en: `Down ${num(-perf['3m'])}% over 3 months`, hi: `3 महीने में ${num(-perf['3m'])}% नीचे` } });
  if (ind.volatilityAnnualPct != null && ind.volatilityAnnualPct > 35) out.push({ dir: 'negative', label: { en: 'Volatility', hi: 'उतार-चढ़ाव' }, value: `${num(ind.volatilityAnnualPct)}%`,
    l: { en: `Annualised volatility ${num(ind.volatilityAnnualPct)}% means big swings`, hi: `सालाना उतार-चढ़ाव ${num(ind.volatilityAnnualPct)}% यानी बड़े झटके` } });
  if (ind.maxDrawdown1yPct != null && ind.maxDrawdown1yPct > 25) out.push({ dir: 'negative', label: { en: 'Worst fall in 1 year', hi: '1 साल में सबसे बड़ी गिरावट' }, value: `${num(ind.maxDrawdown1yPct)}%`,
    l: { en: `Fell as much as ${num(ind.maxDrawdown1yPct)}% from a peak within the year`, hi: `साल के भीतर शिखर से ${num(ind.maxDrawdown1yPct)}% तक गिरा` } });
  return out;
}

function techSummary(i: Inputs): L2 {
  const { ind, tech, quote: q } = i;
  const bits: string[] = [], bitsHi: string[] = [];
  bits.push(`trend ${ind.trend}`); bitsHi.push(`रुझान ${ind.trend === 'up' ? 'ऊपर' : ind.trend === 'down' ? 'नीचे' : 'सपाट'}`);
  if (ind.rsi14 != null) { bits.push(`RSI ${num(ind.rsi14)}`); bitsHi.push(`RSI ${num(ind.rsi14)}`); }
  if (ind.sma50 != null) { bits.push(`price ${inr(q.price)} vs 50-day ${inr(ind.sma50)}`); bitsHi.push(`भाव ${inr(q.price)} बनाम 50 दिन ${inr(ind.sma50)}`); }
  if (ind.sma200 != null) { bits.push(`200-day ${inr(ind.sma200)}`); bitsHi.push(`200 दिन ${inr(ind.sma200)}`); }
  return { en: `Technical score ${tech.score}/100 (price trend, momentum, 52-week position, volatility): ${bits.join(', ')}.`, hi: `तकनीकी स्कोर ${tech.score}/100 (भाव का रुझान, चाल, 52 हफ़्ते की स्थिति, उतार-चढ़ाव): ${bitsHi.join(', ')}।` };
}

// ---------- call builder ----------
const HORIZON: Record<CallMode, { label: L2; months: number }> = {
  invest: { label: { en: 'Long term (3 years or more)', hi: 'लंबी अवधि (3 साल या ज़्यादा)' }, months: 36 },
  trade: { label: { en: 'Days to weeks (about 1 to 6 weeks)', hi: 'कुछ दिन से कुछ हफ़्ते (लगभग 1 से 6 हफ़्ते)' }, months: 1 },
};
const NO_FUND_NOTE: L2 = { en: 'Company numbers were unavailable, so only price behaviour was scored; the call is capped at HOLD.', hi: 'कंपनी के आँकड़े नहीं मिले, इसलिए सिर्फ़ भाव की चाल जाँची गई; कॉल HOLD पर सीमित है।' };

function roundRobin(pools: string[][], max: number): string[] {
  const out: string[] = []; let k = 0;
  while (out.length < max && pools.some((p) => k < p.length)) { for (const p of pools) if (k < p.length && out.length < max) out.push(p[k]); k++; }
  return [...new Set(out)];
}

export function buildCall(i: Inputs, mode: CallMode, lang: Lang): StockCall {
  const f = i.fundamentals;
  const ctx = { sector: i.sector, trend: i.ind.trend };
  const buff = mode === 'invest' ? buffettLens(f, ctx) : null;
  const jh = mode === 'invest' ? jhunjhunwalaLens(f, ctx) : null;
  const sent = mode === 'trade' ? i.sentiment : null;
  const techScore = i.tech.score;
  const parts = mode === 'invest'
    ? [{ score: buff!.score, w: INVEST_WEIGHTS.buffett }, { score: jh!.score, w: INVEST_WEIGHTS.jhunjhunwala }, { score: techScore, w: INVEST_WEIGHTS.technical }]
    : [{ score: techScore, w: TRADE_WEIGHTS.technical }, { score: sent?.score ?? null, w: TRADE_WEIGHTS.sentiment }];
  const comp = composite(parts)!;                       // technical always has a score
  let action = actionFor(comp.score, mode);
  const noFund = mode === 'invest' && buff!.score == null && jh!.score == null;
  if (noFund) action = capAtHold(action);
  const conviction = noFund ? 'low' as const : convictionFor(parts.map((p) => p.score), parts.length, i.year.candles.length);

  const personas: PersonaScore[] = [];
  const addLens = (key: PersonaScore['key'], label: L2, r: { score: number | null; summary: L2 }) => personas.push({ key, label: pick(label, lang), score: r.score, summary: pick(r.summary, lang) });
  if (mode === 'invest') { addLens('buffett', BUFFETT_LABEL, buff!); addLens('jhunjhunwala', JHUN_LABEL, jh!); }
  addLens('technical', { en: 'Technical lens: price trend & momentum', hi: 'तकनीकी नज़रिया: भाव का रुझान और चाल' }, { score: techScore, summary: techSummary(i) });
  if (mode === 'trade') addLens('sentiment', SENTIMENT_LABEL, i.sentiment ?? { score: null, summary: { en: 'Headlines could not be loaded, so no sentiment score.', hi: 'ख़बरें नहीं मिल पाईं, इसलिए भावना स्कोर नहीं।' } });

  // bull / bear: 2-4 short points each, every one carries a number
  const tf = techFacts(i);
  const lensBull = [buff?.bull ?? [], jh?.bull ?? [], sent?.bull ?? []].map((l) => l.map((x) => pick(x, lang)));
  const lensBear = [buff?.bear ?? [], jh?.bear ?? [], sent?.bear ?? []].map((l) => l.map((x) => pick(x, lang)));
  const techBull = tf.filter((x) => x.dir === 'positive').map((x) => pick(x.l, lang));
  const techBear = tf.filter((x) => x.dir === 'negative').map((x) => pick(x.l, lang));
  const neutral = tf.filter((x) => x.dir === 'neutral').map((x) => pick(x.l, lang));
  let bull = roundRobin([...lensBull, techBull], 4), bear = roundRobin([...lensBear, techBear], 4);
  const mixed = [buff?.mixed ?? [], jh?.mixed ?? []].flat().map((x) => pick(x, lang));
  const fillers = [...mixed, ...neutral];
  for (const n of fillers) { if (bear.length >= 2) break; if (!bear.includes(n)) bear.push(n); }
  for (const n of fillers) { if (bull.length >= 2) break; if (!bull.includes(n) && !bear.includes(n)) bull.push(n); }
  const withNum = (xs: string[]) => xs.filter((x) => /\d/.test(x));
  bull = withNum(bull); bear = withNum(bear);

  // evidence with source + asOf
  const priceSrc = `${i.quote.source} prices; computed by FinSaathi rules`;
  const ev: Evidence[] = tf.map((x) => ({ label: pick(x.label, lang), value: x.value, direction: x.dir, detail: pick(x.l, lang), source: priceSrc, asOf: iso(i.year.meta.marketTime) }));
  for (const lens of [buff, jh]) if (lens && f) for (const e of lens.evidence) ev.push({ label: pick(e.label, lang), value: e.value, direction: e.direction, detail: pick(e.detail, lang), source: f.source, asOf: f.asOf });
  if (sent) for (const e of sent.evidence) ev.push({ label: pick(e.label, lang), value: e.value, direction: e.direction, detail: pick(e.detail, lang), source: 'Google News RSS (keyword sentiment)', asOf: sent.asOf ?? iso() });

  // levels: engine ATR-based; none for REDUCE/SELL
  const bearish = action === 'SELL' || action === 'REDUCE';
  const lv = illustrativeLevels(lang, i.quote.price, i.ind, bearish ? 'cautious' : 'neutral');
  const levels = lv ? { ...lv, basis: lv.basis + (mode === 'trade' ? T(lang, ' Swing-trade horizon: days to weeks; these are study levels only.', ' स्विंग-ट्रेड की अवधि: कुछ दिन से हफ़्ते; ये सिर्फ़ अध्ययन-स्तर हैं।') : T(lang, ' These are illustrative study levels for a long-term view.', ' ये लंबी अवधि के नज़रिये के लिए उदाहरण अध्ययन-स्तर हैं।')) } : null;

  const risks: string[] = [];
  if (i.ind.volatilityAnnualPct != null) risks.push(T(lang, `Price volatility is ${num(i.ind.volatilityAnnualPct)}% a year, so large swings in either direction are normal for this stock.`, `भाव का उतार-चढ़ाव सालाना ${num(i.ind.volatilityAnnualPct)}% है, इसलिए इस शेयर में दोनों तरफ़ बड़ी चाल सामान्य है।`));
  if (noFund) risks.push(pick(NO_FUND_NOTE, lang));
  else if (mode === 'invest' && (buff!.score == null || jh!.score == null)) risks.push(T(lang, 'One fundamental lens had too little data and was left out; the score uses the remaining lenses.', 'एक बुनियादी नज़रिये के लिए आँकड़े कम थे, इसलिए उसे छोड़ा गया; स्कोर बाकी नज़रियों से बना है।'));
  if (mode === 'trade' && sent?.score == null) risks.push(T(lang, 'Too few recent headlines mention this stock, so the call rests on price behaviour alone.', 'इस शेयर का ज़िक्र करने वाली हाल की ख़बरें कम हैं, इसलिए कॉल सिर्फ़ भाव की चाल पर टिका है।'));
  if (mode === 'invest') risks.push(T(lang, `The earnings-yield check assumes a ${RISK_FREE_PCT}% bond-yield rate (approximate, not live). Ratios are single-period Yahoo figures and can be stale.`, `कमाई-प्रतिफल की जाँच ${RISK_FREE_PCT}% बॉन्ड-प्रतिफल दर मानकर है (अनुमान, लाइव नहीं)। अनुपात एक-अवधि के Yahoo आँकड़े हैं और पुराने हो सकते हैं।`));
  risks.push(T(lang, 'Rules read past data; they cannot see future results, regulation or global shocks. You can lose money.', 'नियम पुराने आँकड़े पढ़ते हैं; आने वाले नतीजे, नियम-क़ानून या वैश्विक झटके नहीं देख सकते। आपका पैसा डूब सकता है।'));

  const sources: StockCall['sources'] = [{ name: i.quote.source, url: 'https://finance.yahoo.com', asOf: i.quote.asOf }];
  if (f) sources.push({ name: f.source, url: 'https://finance.yahoo.com', asOf: f.asOf });
  if (sent?.score != null) sources.push({ name: 'Google News RSS', url: 'https://news.google.com', asOf: sent.asOf ?? iso() });
  return {
    symbol: i.symbol, name: i.name, sector: i.sector, mode, action, conviction, score: comp.score, price: i.quote.price, changePct: i.quote.changePct ?? null,
    horizon: { label: pick(HORIZON[mode].label, lang), months: HORIZON[mode].months }, levels, personas, bull, bear, evidence: ev, risks,
    asOf: i.quote.asOf, sources, generatedBy: 'rules', disclaimer: DISCLAIMER[lang],
  };
}

const callCache = new TtlCache<StockCall>(TTL.analysis, 6 * 3600_000);
export async function getStockCall(symbolIn: string, mode: CallMode, lang: Lang): Promise<StockCall> {
  await ensureUniverse();
  const symbol = normaliseSymbol(symbolIn);
  if (!symbol || !isEquity(symbol)) throw new DataError('unknown_symbol', `Unknown or unsupported symbol ${symbolIn}`);
  return (await callCache.wrap(`${symbol}:${mode}:${lang}`, async () => buildCall(await loadInputs(symbol), mode, lang))).value;
}

// ---------- rising stars screen ----------
export interface StarScreen { pass: boolean; score: number; r1m: number | null; r3m: number | null; distHighPct: number | null; rsi: number | null; volRatio: number | null; failed: string[] }
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Volume ratio = average of the last 5 sessions / average of the last 20 sessions (5-day avg avoids a partial current bar). Null when volume is missing. */
export function volumeRatio(candles: Candle[]): number | null {
  if (candles.length < 20) return null;
  const avg = (xs: Candle[]) => xs.reduce((a, c) => a + c.v, 0) / xs.length;
  const a20 = avg(candles.slice(-20));
  return a20 > 0 ? avg(candles.slice(-5)) / a20 : null;
}
/**
 * Pass when: 1m > 0, 3m > 0, within 5% of the 52-week high, RSI <= 80, and (when volume exists) 5-day volume above the 20-day average.
 * Momentum score 0-100 = 35% 3m return (40% = full marks) + 25% 1m return (15% = full) + 25% closeness to 52w high (5% away = 0, at high = full) + 15% volume surge (2x = full; weight dropped when no volume).
 */
export function risingStarScreen(candles: Candle[], quote: Quote, ind: Indicators): StarScreen {
  const perf = performanceFrom(candles);
  const hi = quote.fiftyTwoWeekHigh ?? Math.max(...candles.map((c) => c.h));
  const dist = hi > 0 ? Math.max(0, ((hi - quote.price) / hi) * 100) : null;
  const vr = volumeRatio(candles);
  const failed: string[] = [];
  if (perf['1m'] == null || perf['1m'] <= 0) failed.push('1m');
  if (perf['3m'] == null || perf['3m'] <= 0) failed.push('3m');
  if (dist == null || dist > 5) failed.push('52w-high');
  if (ind.rsi14 == null || ind.rsi14 > 80) failed.push('rsi');
  if (vr != null && vr <= 1) failed.push('volume');
  const parts: [number, number][] = [[0.35, clamp01((perf['3m'] ?? 0) / 40)], [0.25, clamp01((perf['1m'] ?? 0) / 15)], [0.25, dist == null ? 0 : clamp01(1 - dist / 5)]];
  if (vr != null) parts.push([0.15, clamp01(vr - 1)]);
  const w = parts.reduce((a, p) => a + p[0], 0);
  return { pass: failed.length === 0, score: Math.round((parts.reduce((a, p) => a + p[0] * p[1], 0) / w) * 100), r1m: perf['1m'], r3m: perf['3m'], distHighPct: dist == null ? null : +dist.toFixed(1), rsi: ind.rsi14, volRatio: vr == null ? null : +vr.toFixed(2), failed };
}

function starBullet(s: StarScreen, lang: Lang): string {
  const vol = s.volRatio != null ? T(lang, `, volume ${num(s.volRatio, 2)}x its 20-day average`, `, वॉल्यूम 20 दिन की औसत का ${num(s.volRatio, 2)} गुना`) : '';
  return T(lang, `Momentum screen: +${num(s.r1m ?? 0)}% in 1 month, +${num(s.r3m ?? 0)}% in 3 months, ${num(s.distHighPct ?? 0)}% below its 52-week high${vol}`, `मोमेंटम स्क्रीन: 1 महीने में +${num(s.r1m ?? 0)}%, 3 महीने में +${num(s.r3m ?? 0)}%, 52 हफ़्ते के शिखर से ${num(s.distHighPct ?? 0)}% नीचे${vol}`);
}

// ---------- feed ----------
const feedCache = new TtlCache<CallsFeed>(15 * 60_000, 6 * 3600_000);
export const clearCallsCache = () => { feedCache.clear(); callCache.clear(); inputsCache.clear(); };
const STAR_CAP = 30;

const METHOD: Record<Lang, string> = {
  en: `Rules-only research calls, no AI. Invest: Buffett lens (quality and value) 40%, Jhunjhunwala lens (India growth) 30%, technical lens 30%, renormalised over lenses with data. Trade: technical 75%, headline sentiment 25%. Invest labels: 78+ BUY, 64+ ACCUMULATE, 45+ HOLD, 32+ REDUCE, below that SELL; trade labels: 66+ BUY, 38 or below SELL, else HOLD. Earnings-yield check assumes a ${RISK_FREE_PCT}% bond-yield rate. Levels are illustrative study levels.`,
  hi: `सिर्फ़ नियमों पर आधारित रिसर्च कॉल, कोई AI नहीं। निवेश: बफ़ेट नज़रिया (गुणवत्ता और मूल्य) 40%, झुनझुनवाला नज़रिया (भारत की ग्रोथ) 30%, तकनीकी नज़रिया 30%, जिनके आँकड़े हैं उन पर दोबारा बाँटकर। ट्रेड: तकनीकी 75%, ख़बरों की भावना 25%। निवेश लेबल: 78+ BUY, 64+ ACCUMULATE, 45+ HOLD, 32+ REDUCE, उससे कम SELL; ट्रेड लेबल: 66+ BUY, 38 या कम SELL, बाकी HOLD। कमाई-प्रतिफल की जाँच ${RISK_FREE_PCT}% बॉन्ड-प्रतिफल दर (अनुमान) मानती है। स्तर केवल उदाहरण अध्ययन-स्तर हैं।`,
};

export async function getCallsFeed(lang: Lang): Promise<CallsFeed> {
  return (await feedCache.wrap(lang, () => buildFeed(lang))).value;
}

/** Extra rising-star candidates from the NSE bulk near-52w-high list (names outside our static lists), top MOVER_SEED_CAP by 30-day momentum. Bounded, fails soft. */
export const MOVER_SEED_CAP = 12;
async function seedStarsFromMovers(lim: Limiter, known: Set<string>): Promise<{ symbol: string; s: StarScreen }[]> {
  try {
    const feed = await getMoversFeedSoft(3000);
    if (!feed || !/NSE/.test(feed.source)) return [];
    const seeds = feed.nearHigh.filter((m) => !known.has(m.symbol)).sort((a, b) => (b.change30dPct ?? -999) - (a.change30dPct ?? -999)).slice(0, MOVER_SEED_CAP);
    const out = await Promise.all(seeds.map((m) => lim.run(async () => {
      try {
        const year = (await getChart(m.symbol, '1y')).data;
        if (year.candles.length < 100) return null;
        return { symbol: m.symbol, s: risingStarScreen(year.candles, quoteFromChart(year), computeIndicators(year.candles)) };
      } catch { return null; }
    })));
    return out.filter((x): x is { symbol: string; s: StarScreen } => !!x);
  } catch { return []; }
}

async function buildFeed(lang: Lang): Promise<CallsFeed> {
  const lim = new Limiter(6);
  const notes: string[] = [];
  const failed: string[] = [];
  const base = await Promise.all(NIFTY50.map((st) => lim.run(async () => {
    try { const [inv, tr] = await Promise.all([getStockCall(st.symbol, 'invest', lang), getStockCall(st.symbol, 'trade', lang)]); return { inv, tr }; }
    catch { failed.push(st.symbol.replace('.NS', '')); return null; }
  })));
  const ok = base.filter((x): x is NonNullable<typeof x> => !!x);
  if (!ok.length) throw new DataError('upstream_unavailable', 'Price data is unavailable right now, so no calls could be computed', true);
  if (failed.length) notes.push(T(lang, `${failed.length} of ${NIFTY50.length} Nifty 50 names could not be scored (no price data): ${failed.slice(0, 8).join(', ')}${failed.length > 8 ? ', ...' : ''}.`, `निफ़्टी 50 के ${NIFTY50.length} में से ${failed.length} शेयरों का आकलन नहीं हो पाया (भाव नहीं मिला): ${failed.slice(0, 8).join(', ')}${failed.length > 8 ? ', ...' : ''}।`));
  const noFund = ok.filter((x) => x.inv.personas.every((p) => p.key === 'technical' || p.score == null)).length;
  if (noFund) notes.push(T(lang, `Company numbers were unavailable for ${noFund} names; their calls are capped at HOLD.`, `${noFund} शेयरों के कंपनी आँकड़े नहीं मिले; उनके कॉल HOLD पर सीमित हैं।`));

  const invest = ok.map((x) => x.inv).filter((c) => c.action === 'BUY' || c.action === 'ACCUMULATE').sort((a, b) => b.score - a.score).slice(0, 10);
  const tradeAll = ok.map((x) => x.tr);
  const trade = [...tradeAll.filter((c) => c.action === 'BUY').sort((a, b) => b.score - a.score).slice(0, 8), ...tradeAll.filter((c) => c.action === 'SELL').sort((a, b) => a.score - b.score).slice(0, 2)];
  const avoid = ok.map((x) => x.inv).filter((c) => c.action === 'REDUCE' || c.action === 'SELL').sort((a, b) => a.score - b.score).slice(0, 8);

  // rising stars: cheap candle screen over the whole Next list first, full call only for passers (top STAR_CAP by momentum)
  const screened = (await Promise.all(NIFTY_NEXT.map((st) => lim.run(async () => {
    try {
      const year = (await getChart(st.symbol, '1y')).data;
      if (year.candles.length < 100) return null;
      const quote = quoteFromChart(year);
      return { symbol: st.symbol, s: risingStarScreen(year.candles, quote, computeIndicators(year.candles)) };
    } catch { return null; }
  })))).filter((x): x is { symbol: string; s: StarScreen } => !!x);
  if (screened.length < NIFTY_NEXT.length) notes.push(T(lang, `${NIFTY_NEXT.length - screened.length} of ${NIFTY_NEXT.length} rising-star candidates had no usable price history.`, `उभरते सितारों के ${NIFTY_NEXT.length} उम्मीदवारों में से ${NIFTY_NEXT.length - screened.length} का भाव-इतिहास काम लायक नहीं मिला।`));
  const extra = await seedStarsFromMovers(lim, new Set([...NIFTY50, ...NIFTY_NEXT].map((x) => x.symbol)));
  if (extra.length) notes.push(T(lang, `${extra.length} extra rising-star candidates were seeded from the NSE whole-market near-52-week-high list and passed through the same screen.`, `NSE के पूरे बाज़ार की 52 हफ़्ते के शिखर के पास वाली सूची से ${extra.length} अतिरिक्त उम्मीदवार उसी स्क्रीन से गुज़ारे गए।`));
  const passers = [...screened, ...extra].filter((x) => x.s.pass).sort((a, b) => b.s.score - a.s.score).slice(0, STAR_CAP);
  const stars: { call: StockCall; s: StarScreen }[] = [];
  await Promise.all(passers.map((p) => lim.run(async () => {
    try { const call = await getStockCall(p.symbol, 'invest', lang); if (call.action !== 'SELL') stars.push({ call, s: p.s }); } catch { /* skip */ }
  })));
  stars.sort((a, b) => b.s.score - a.s.score);
  const risingStars = stars.slice(0, 8).map(({ call, s }) => ({ ...call, bull: [starBullet(s, lang), ...call.bull].slice(0, 4) }));
  notes.push(T(lang,
    `Rising stars is a momentum SCREEN, not a prediction: 1-month and 3-month returns positive, within 5% of the 52-week high, RSI at most 80, and volume above its 20-day average. ${screened.filter((x) => x.s.pass).length} of ${screened.length} names in a ${NIFTY_NEXT.length}-name static list (${NIFTY_NEXT_ASOF}) passed. Screens like this can show names that already ran up.`,
    `उभरते सितारे एक मोमेंटम स्क्रीन है, भविष्यवाणी नहीं: 1 और 3 महीने का रिटर्न सकारात्मक, 52 हफ़्ते के शिखर के 5% के भीतर, RSI 80 या कम, और वॉल्यूम 20 दिन की औसत से ऊपर। ${NIFTY_NEXT.length} शेयरों की स्थिर सूची (${NIFTY_NEXT_ASOF}) में से ${screened.length} जाँचे गए और ${screened.filter((x) => x.s.pass).length} पास हुए। ऐसे स्क्रीन उन शेयरों को भी दिखा सकते हैं जो पहले ही काफ़ी चढ़ चुके हैं।`));
  notes.push(T(lang, 'Prices are as of each call\'s asOf time (up to 15 minutes old).', 'भाव हर कॉल के asOf समय के हैं (15 मिनट तक पुराने हो सकते हैं)।'));

  return {
    asOf: iso(), universe: T(lang, `Nifty 50 (${ok.length} scored) plus a ${NIFTY_NEXT.length}-name rising-stars list`, `निफ़्टी 50 (${ok.length} का आकलन) और ${NIFTY_NEXT.length} शेयरों की उभरते-सितारे सूची`),
    invest, trade, risingStars, avoid, methodology: METHOD[lang], disclaimer: DISCLAIMER[lang], notes,
  };
}
