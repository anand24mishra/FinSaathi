// Guardrail validator for any LLM-written text: (1) banned promotional/advice phrases, (2) every number must be
// traceable to the evidence pack (nothing invented). Failing text is rejected and the rules-based text is used instead.
import { asciiDigits } from '../market/format';

// NOTE: the call LABELS BUY/ACCUMULATE/HOLD/REDUCE/SELL are allowed as structured fields of StockCall. Only promotional/imperative phrasing stays banned.
export const BANNED: RegExp[] = [
  /assured returns?/i, /sure[\s-]?fire/i,
  /guarantee(d|s)?\b/i, /sure[\s-]?shot/i, /multi[\s-]?bagger/i, /\bbuy now\b/i, /\bsell now\b/i, /\b(must|should) buy\b/i, /\bstrong buy\b/i,
  /risk[\s-]?free/i, /\bcan'?t lose\b/i, /\bdouble your money\b/i, /\bno risk\b/i, /\bjackpot\b/i, /\bsure profit\b/i, /\b100% (safe|return|profit)/i,
  /पक्का मुनाफ़ा|पक्का मुनाफा|गारंटी|गारंटीड|ज़रूर खरीद|जरूर खरीद|अभी खरीद|अभी बेच|सौ प्रतिशत सुरक्षित|बिना जोखिम|जोखिम[\s-]?मुक्त|पैसा दोगुना/,
];
export const bannedHit = (text: string): string | null => {
  for (const re of BANNED) { const m = text.match(re); if (m) return m[0]; }
  return null;
};

const NUM = /\d[\d,]*(?:\.\d+)?/g;
export function numbersIn(text: string): { raw: string; value: number; decimals: number }[] {
  const out: { raw: string; value: number; decimals: number }[] = [];
  for (const m of asciiDigits(text).matchAll(NUM)) {
    const raw = m[0].replace(/,+$/, '');
    const clean = raw.replace(/,/g, '');
    const v = parseFloat(clean);
    if (isFinite(v)) out.push({ raw, value: v, decimals: (clean.split('.')[1] ?? '').length });
  }
  return out;
}

// Structural constants that appear in method descriptions (50-day average, RSI 14, 52 weeks, "out of 100" ...)
const CONSTANTS = [0, 1, 2, 3, 6, 9, 12, 14, 20, 26, 50, 52, 100, 200];

export class AllowedNumbers {
  private vals: number[] = [];
  add(...texts: (string | number | null | undefined)[]) {
    for (const t of texts) {
      if (t == null) continue;
      if (typeof t === 'number') { if (isFinite(t)) this.vals.push(Math.abs(t)); continue; }
      for (const n of numbersIn(t)) this.vals.push(Math.abs(n.value));
    }
    return this;
  }
  has(x: number, decimals: number): boolean {
    const v = Math.abs(x);
    if (CONSTANTS.includes(v)) return true;
    const tol = decimals === 0 ? 0.5 + 1e-9 : 0.5 * Math.pow(10, -decimals) + 1e-9;
    return this.vals.some((a) => Math.abs(a - v) <= tol || (a !== 0 && Math.abs(a - v) / a <= 0.002));
  }
}

export interface Verdict { ok: boolean; reason?: string }
export function validateNarrative(text: string, allowed: AllowedNumbers): Verdict {
  if (!text || !text.trim()) return { ok: false, reason: 'empty' };
  const b = bannedHit(text);
  if (b) return { ok: false, reason: `banned phrase: ${b}` };
  for (const n of numbersIn(text)) if (!allowed.has(n.value, n.decimals)) return { ok: false, reason: `number not in evidence: ${n.raw}` };
  return { ok: true };
}
