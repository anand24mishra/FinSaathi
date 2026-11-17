// Shared building blocks for the investor "lenses". Every lens is a PURE function: numbers in -> explainable score out.
// A lens is a list of criteria; each criterion earns points out of a max, only criteria whose data exists are counted
// (never invent a number), and the lens returns null when too little data is available.

export interface L2 { en: string; hi: string }
export interface LensEvidence { label: L2; value: string; direction: 'positive' | 'negative' | 'neutral'; detail: L2 }
export interface LensResult {
  score: number | null;            // 0-100 or null when required data is missing
  summary: L2;                     // one-liner with the numeric inputs, e.g. "ROE 16.5% (>15% good)"
  mixed: L2[];                     // middling checks with numbers (fallback caveats when too few clear bull/bear points)
  bull: L2[]; bear: L2[];          // short points, each contains a number from the inputs
  evidence: LensEvidence[];
  criteriaUsed: number; criteriaTotal: number;
}
export interface LensFundamentals {
  pe: number | null; pb: number | null; roePct: number | null; debtToEquity: number | null; dividendYieldPct: number | null;
  revenueGrowthPct: number | null; profitMarginPct: number | null; marketCapCr?: number | null; epsTtm?: number | null;
}
export interface LensContext { sector: string | null; trend?: 'up' | 'down' | 'sideways' | null }

/** Our sector labels + Yahoo sector labels for which Debt/Equity is not meaningful (lenders carry deposits/borrowings as raw material). */
export const FINANCIAL_SECTORS = new Set(['Banking', 'Financial Services', 'Insurance']);
export const isFinancial = (sector: string | null): boolean => !!sector && FINANCIAL_SECTORS.has(sector);

export interface Crit {
  key: string; label: L2; value: string; rule: L2; pts: number; max: number; tone: 'good' | 'fair' | 'weak'; line: L2; detail: L2;
}

export const num = (n: number, d = 1): string => (Number.isInteger(n) ? String(n) : n.toFixed(d));

/** Build a banded criterion: higher-is-better thresholds good/fair (or lower-is-better when `lowerBetter`). */
export function band(opts: {
  key: string; label: L2; v: number; unit: string; good: number; fair: number; lowerBetter?: boolean; max: number;
  goodLine: L2; weakLine: L2; detail: L2; decimals?: number;
}): Crit {
  const { v, unit, good, fair, lowerBetter, max } = opts;
  const d = opts.decimals ?? 1;
  const isGood = lowerBetter ? v < good : v >= good;
  const isFair = !isGood && (lowerBetter ? v < fair : v >= fair);
  const value = `${num(v, d)}${unit}`;
  const g = `${lowerBetter ? '<' : '>'}${good}${unit}`, f = `${lowerBetter ? `${good}-${fair}` : `${fair}-${good}`}${unit}`, w = `${lowerBetter ? '>' : '<'}${isFair || isGood ? fair : fair}${unit}`;
  const rule: L2 = isGood ? { en: `${g} good`, hi: `${g} अच्छा` } : isFair ? { en: `${f} fair`, hi: `${f} ठीक-ठाक` } : { en: `${w} weak`, hi: `${w} कमज़ोर` };
  return {
    key: opts.key, label: opts.label, value, rule, pts: isGood ? max : isFair ? max / 2 : 0, max, tone: isGood ? 'good' : isFair ? 'fair' : 'weak',
    line: isGood ? opts.goodLine : opts.weakLine, detail: opts.detail,
  };
}

export function assemble(crits: Crit[], total: number, minCriteria: number, head: L2, missing: L2): LensResult {
  if (crits.length < minCriteria) {
    return { score: null, summary: missing, mixed: [], bull: [], bear: [], evidence: [], criteriaUsed: crits.length, criteriaTotal: total };
  }
  const earned = crits.reduce((a, c) => a + c.pts, 0), max = crits.reduce((a, c) => a + c.max, 0);
  const score = Math.round((earned / max) * 100);
  const parts = crits.map((c) => ({ en: `${c.label.en} ${c.value} (${c.rule.en})`, hi: `${c.label.hi} ${c.value} (${c.rule.hi})` }));
  return {
    score,
    summary: { en: `${head.en} ${score}/100 from ${crits.length} of ${total} checks: ${parts.map((p) => p.en).join('; ')}.`, hi: `${head.hi} ${score}/100, ${total} में से ${crits.length} जाँचों से: ${parts.map((p) => p.hi).join('; ')}।` },
    mixed: crits.filter((c) => c.tone === 'fair' && /\d/.test(c.value)).map((c) => ({ en: `${c.label.en} ${c.value} is only middling (${c.rule.en})`, hi: `${c.label.hi} ${c.value} बस ठीक-ठाक है (${c.rule.hi})` })),
    bull: crits.filter((c) => c.tone === 'good').map((c) => c.line),
    bear: crits.filter((c) => c.tone === 'weak').map((c) => c.line),
    evidence: crits.map((c) => ({ label: c.label, value: c.value, direction: c.tone === 'good' ? 'positive' : c.tone === 'weak' ? 'negative' : 'neutral', detail: c.detail })),
    criteriaUsed: crits.length, criteriaTotal: total,
  };
}
