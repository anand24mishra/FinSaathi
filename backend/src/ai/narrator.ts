// Optional LLM narrator for the analysis thesis. Only runs with ANTHROPIC_API_KEY. The model is given the evidence pack and
// must return JSON; guardrails reject any number not in the pack or any banned phrase, falling back to the rules text.
import type { Analysis, Lang } from '../../../shared/contract';
import { llmConfigured, llmCall, textOf } from './llm';
import { AllowedNumbers, validateNarrative } from './guardrails';
import { STANCE_LABEL } from '../market/analysis/text';

export function evidencePack(a: Analysis) {
  return {
    name: a.name, symbol: a.symbol, score_out_of_100: a.score, stance: a.stance, confidence: a.confidence, as_of: a.asOf,
    evidence: a.evidence.map((e) => ({ label: e.label, value: e.value, direction: e.direction })),
    risks: a.risks, illustrative_levels: a.levels ? { entryLow: a.levels.entryLow, entryHigh: a.levels.entryHigh, targetLow: a.levels.targetLow, targetHigh: a.levels.targetHigh, stopLoss: a.levels.stopLoss } : null,
  };
}
export function allowedFor(a: Analysis): AllowedNumbers {
  const al = new AllowedNumbers().add(a.score, a.horizon.months);
  a.evidence.forEach((e) => al.add(e.value, e.detail));
  if (a.levels) al.add(a.levels.entryLow, a.levels.entryHigh, a.levels.targetLow, a.levels.targetHigh, a.levels.stopLoss);
  return al;
}
export function parseJsonLoose(t: string): any | null {
  const m = t.match(/\{[\s\S]*\}/); if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export async function narrate(base: Analysis, lang: Lang): Promise<Analysis> {
  if (!llmConfigured()) return base;
  const pack = evidencePack(base);
  const system = `You explain a stock's rule-based analysis to a retired, first-time Indian investor in ${lang === 'hi' ? 'simple natural Hindi (Devanagari)' : 'plain English'}.
Rules: use ONLY the facts and numbers in the JSON evidence pack; never introduce any other number, price, percentage or forecast. Never say buy, sell, guaranteed, sure-shot or similar. Use the stance wording "${STANCE_LABEL[lang][base.stance]}". Explain any jargon in brackets. Be calm and balanced; mention the main risk. Max 90 words for thesis and 45 for uncertainty.
Return ONLY JSON: {"thesis": string, "uncertainty": string}`;
  const msg = await llmCall({ max_tokens: 600, system, messages: [{ role: 'user', content: JSON.stringify(pack) }] });
  if (!msg) return base;
  const j = parseJsonLoose(textOf(msg));
  if (!j || typeof j.thesis !== 'string' || typeof j.uncertainty !== 'string') return base;
  const allowed = allowedFor(base);
  const v1 = validateNarrative(j.thesis, allowed), v2 = validateNarrative(j.uncertainty, allowed);
  if (!v1.ok || !v2.ok) return base;
  return { ...base, thesis: j.thesis.trim(), uncertainty: j.uncertainty.trim(), generatedBy: 'llm' };
}
