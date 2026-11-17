// Deterministic analysis engine: indicators -> 0-100 score -> stance/confidence/levels/evidence/risks (rules text, en + hi).
import type { Analysis, Evidence, Fundamentals, Indicators, Lang, Quote, Stance } from '../../../../shared/contract';
import { DISCLAIMER } from '../../../../shared/contract';
import type { Candle } from '../providers/types';
import { sma, ema, rsi, macd, atr, annualisedVolatilityPct, maxDrawdownPct, supportResistance, classifyTrend, pctChange } from '../analytics/indicators';
import { evidenceText, thesisText, risksText, uncertaintyText, horizonLabel, levelsBasis, STANCE_LABEL, type Facts } from './text';
import { iso } from '../http';

export const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const FINANCIAL = new Set(['Banking', 'Financial Services', 'Insurance']);

export function computeIndicators(candles: Candle[]): Indicators {
  const c = candles.map((x) => x.c), h = candles.map((x) => x.h), l = candles.map((x) => x.l);
  const price = c[c.length - 1];
  const s50 = sma(c, 50), s200 = sma(c, 200);
  const sr = supportResistance(h, l, c);
  const q = (n: number | null) => (n == null ? null : r2(n));
  const m = macd(c);
  return {
    rsi14: q(rsi(c, 14)), sma50: q(s50), sma200: q(s200), ema20: q(ema(c, 20)),
    macd: m ? { macd: +m.macd.toFixed(3), signal: +m.signal.toFixed(3), hist: +m.hist.toFixed(3) } : null,
    atr14: q(atr(h, l, c, 14)), volatilityAnnualPct: q(annualisedVolatilityPct(c)), maxDrawdown1yPct: q(maxDrawdownPct(c.slice(-252))),
    support: q(sr.support), resistance: q(sr.resistance), trend: price == null ? 'sideways' : classifyTrend(price, s50, s200),
  };
}

export function performanceFrom(candles: Candle[]): { '1m': number | null; '3m': number | null; '6m': number | null; '1y': number | null } {
  const last = candles[candles.length - 1];
  const at = (days: number): number | null => {
    if (!last) return null;
    const target = last.t - days * 86400_000;
    // need history that actually reaches back far enough (allow 5 days slack)
    if (candles[0].t > target + 5 * 86400_000) return null;
    const c = candles.find((x) => x.t >= target);
    return c ? r2(pctChange(c.c, last.c)!) : null;
  };
  return { '1m': at(30), '3m': at(91), '6m': at(182), '1y': at(365) };
}

export interface ScoreInput { price: number; ind: Indicators; low52: number | null; high52: number | null; fundamentals: Fundamentals | null; sector: string | null; bars: number }
export interface ScoreResult {
  score: number; stance: Stance; confidence: 'low' | 'medium' | 'high';
  parts: { trend: number | null; momentum: number | null; position: number | null; quality: number | null }; penalty: number;
}

const trendScore = (p: number, s50: number | null, s200: number | null): number | null => {
  if (s50 == null) return null;
  const a = clamp(0.5 + (p / s50 - 1) / 0.2);
  if (s200 == null) return a;
  const b = clamp(0.5 + (p / s200 - 1) / 0.4);
  const cross = clamp(0.5 + (s50 / s200 - 1) / 0.2);
  return 0.4 * a + 0.4 * b + 0.2 * cross;
};
const rsiScore = (r: number): number => {
  if (r < 30) return 0.15 + (r / 30) * 0.15;                 // 0.15..0.30 (oversold: weak, bounce unproven)
  if (r < 50) return 0.3 + ((r - 30) / 20) * 0.2;            // ..0.50
  if (r < 65) return 0.5 + ((r - 50) / 15) * 0.35;           // ..0.85
  if (r < 75) return 0.85 - ((r - 65) / 10) * 0.2;           // ..0.65 (getting stretched)
  return 0.65 - clamp((r - 75) / 25) * 0.1;                  // 0.55 floor
};
const momentumScore = (ind: Indicators, price: number): number | null => {
  const parts: number[] = [];
  if (ind.rsi14 != null) parts.push(rsiScore(ind.rsi14));
  if (ind.macd) parts.push(clamp(0.5 + (ind.macd.hist / price) / 0.02));
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
};
const positionScore = (p: number, lo: number | null, hi: number | null): number | null => {
  if (lo == null || hi == null || hi <= lo) return null;
  const pos = clamp((p - lo) / (hi - lo));
  return pos > 0.95 ? 0.85 : pos;
};
export function qualityScore(f: Fundamentals | null, sector: string | null): number | null {
  if (!f) return null;
  const s: number[] = [];
  if (f.pe != null && f.pe > 0) s.push(f.pe <= 15 ? 0.8 : f.pe <= 25 ? 0.7 : f.pe <= 40 ? 0.5 : f.pe <= 60 ? 0.3 : 0.15);
  if (f.roePct != null) s.push(f.roePct >= 18 ? 0.9 : f.roePct >= 12 ? 0.7 : f.roePct >= 8 ? 0.5 : 0.25);
  if (f.debtToEquity != null && !(sector && FINANCIAL.has(sector))) s.push(f.debtToEquity < 0.5 ? 0.8 : f.debtToEquity < 1 ? 0.6 : f.debtToEquity < 2 ? 0.4 : 0.25);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

export function scoreStock(inp: ScoreInput): ScoreResult {
  const { price, ind } = inp;
  const parts = {
    trend: trendScore(price, ind.sma50, ind.sma200), momentum: momentumScore(ind, price),
    position: positionScore(price, inp.low52, inp.high52), quality: qualityScore(inp.fundamentals, inp.sector),
  };
  const W = { trend: 35, momentum: 25, position: 15, quality: 25 } as const;
  let num = 0, den = 0;
  (Object.keys(W) as (keyof typeof W)[]).forEach((k) => { const v = parts[k]; if (v != null) { num += v * W[k]; den += W[k]; } });
  let raw = den > 0 ? (num / den) * 100 : 50;
  let penalty = 0;
  if (ind.volatilityAnnualPct != null) penalty += clamp((ind.volatilityAnnualPct - 25) / 25) * 12;
  if (ind.maxDrawdown1yPct != null) penalty += clamp((ind.maxDrawdown1yPct - 15) / 20) * 8;
  raw -= penalty;
  if (den === 0) raw = 50;
  const score = Math.round(clamp(raw, 0, 100) / 1) ;
  const stance: Stance = score >= 65 ? 'favourable' : score <= 40 ? 'cautious' : 'neutral';
  const hasQ = parts.quality != null;
  const confidence = inp.bars >= 200 && hasQ ? 'high' : inp.bars >= 200 || (inp.bars >= 60 && hasQ) ? 'medium' : 'low';
  return { score: Math.round(clamp(raw, 0, 100)), stance, confidence, parts, penalty: r2(penalty) };
}

export function illustrativeLevels(lang: Lang, price: number, ind: Indicators, stance: Stance): Analysis['levels'] {
  if (stance === 'cautious' || ind.atr14 == null || price <= 0) return null;
  const a = ind.atr14;
  const usedSupport = ind.support != null && ind.support > price - 4 * a;
  let entryLow: number, entryHigh: number;
  if (usedSupport) { entryLow = ind.support!; entryHigh = Math.min(price, ind.support! + 0.75 * a); }
  else { entryLow = price - 1.5 * a; entryHigh = price - 0.25 * a; }
  if (entryHigh <= entryLow) entryHigh = entryLow + 0.5 * a;
  const usedResistance = ind.resistance != null;
  const targetLow = Math.max(ind.resistance ?? 0, price + 1.5 * a);
  const targetHigh = targetLow + 1.5 * a;
  const stopLoss = entryLow - a;
  return { entryLow: r2(entryLow), entryHigh: r2(entryHigh), targetLow: r2(targetLow), targetHigh: r2(targetHigh), stopLoss: r2(stopLoss), basis: levelsBasis(lang, { support: ind.support, resistance: ind.resistance, atr: a, usedSupport, usedResistance }) };
}

export interface AnalysisInput {
  symbol: string; name: string; sector: string | null; quote: Quote; candles: Candle[]; seriesAsOf: ISOString;
  fundamentals: Fundamentals | null; lang: Lang; marketStressNote?: string | null;
}
type ISOString = string;

export function buildFacts(inp: AnalysisInput, ind: Indicators, sc: ScoreResult): Facts {
  const q = inp.quote;
  const hi = q.fiftyTwoWeekHigh, lo = q.fiftyTwoWeekLow;
  const perf = performanceFrom(inp.candles);
  const f = inp.fundamentals;
  return {
    name: inp.name, price: q.price, sma50: ind.sma50, sma200: ind.sma200, rsi: ind.rsi14, macdHist: ind.macd?.hist ?? null,
    pos52: hi != null && lo != null && hi > lo ? clamp((q.price - lo) / (hi - lo)) : null, low52: lo, high52: hi,
    vol: ind.volatilityAnnualPct, dd: ind.maxDrawdown1yPct, perf1y: perf['1y'], atr: ind.atr14,
    pe: f?.pe ?? null, roe: f?.roePct ?? null, de: f?.debtToEquity ?? null, deApplicable: !(inp.sector && FINANCIAL.has(inp.sector)),
    trend: ind.trend, bars: inp.candles.length, hasFundamentals: sc.parts.quality != null, score: sc.score, stance: sc.stance,
  };
}

export function buildRulesAnalysis(inp: AnalysisInput): Analysis {
  const ind = computeIndicators(inp.candles);
  const sc = scoreStock({ price: inp.quote.price, ind, low52: inp.quote.fiftyTwoWeekLow, high52: inp.quote.fiftyTwoWeekHigh, fundamentals: inp.fundamentals, sector: inp.sector, bars: inp.candles.length });
  const facts = buildFacts(inp, ind, sc);
  const src = (inp.quote.source ?? 'Yahoo Finance (unofficial)') + ' prices; computed by FinSaathi rules';
  const evidence: Evidence[] = evidenceText(inp.lang, facts).map((e) => {
    const fundamental = ['pe', 'roe', 'de'].includes(e.key);
    return { label: e.label, value: e.value, direction: e.direction, detail: e.detail, source: fundamental && inp.fundamentals ? inp.fundamentals.source : src, asOf: fundamental && inp.fundamentals ? inp.fundamentals.asOf : inp.seriesAsOf };
  });
  const sources: Analysis['sources'] = [{ name: inp.quote.source, url: 'https://finance.yahoo.com', asOf: inp.quote.asOf }];
  if (inp.fundamentals) sources.push({ name: inp.fundamentals.source, url: 'https://finance.yahoo.com', asOf: inp.fundamentals.asOf });
  return {
    symbol: inp.symbol, name: inp.name, asOf: inp.quote.asOf, stance: sc.stance, score: sc.score, confidence: sc.confidence,
    horizon: { label: horizonLabel(inp.lang), months: 6 },
    thesis: thesisText(inp.lang, facts),
    levels: illustrativeLevels(inp.lang, inp.quote.price, ind, sc.stance),
    evidence, risks: risksText(inp.lang, facts, { fundamentalsMissing: !facts.hasFundamentals }),
    uncertainty: uncertaintyText(inp.lang, facts), sources, generatedBy: 'rules', disclaimer: DISCLAIMER[inp.lang],
  };
}
export { STANCE_LABEL };
export const _iso = iso;
