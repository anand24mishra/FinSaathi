// Sentiment lens: keyword sentiment of recent headlines that mention the symbol (news.ts matchSymbols + sentiment.ts headlineSentiment).
// Needs at least 2 matching headlines, otherwise the score is null (never invent). Only Nifty 50 names are matched by matchSymbols.
import type { Lang, NewsItem } from '../../../../../shared/contract';
import { getNews, matchSymbols } from '../../news';
import { headlineSentiment } from '../../sentiment';
import { type L2, type LensEvidence } from './common';

export const SENTIMENT_LABEL: L2 = { en: 'Sentiment lens: recent headlines', hi: 'भावना नज़रिया: हाल की ख़बरें' };
export const MIN_HEADLINES = 2;
export interface SentimentResult { score: number | null; summary: L2; bull: L2[]; bear: L2[]; evidence: LensEvidence[]; n: number; asOf: string | null }

/** Pure: score from headline titles. 50 + 50 * (positive - negative) / n, clamped to 0..100. */
export function scoreHeadlines(titles: string[], symbol: string): SentimentResult {
  const hits = titles.filter((t) => matchSymbols(t, 'en').some((s) => s.symbol === symbol));
  const n = hits.length;
  if (n < MIN_HEADLINES) {
    return { score: null, n, asOf: null, bull: [], bear: [], evidence: [], summary: { en: `Only ${n} recent headline${n === 1 ? '' : 's'} mention this stock (need ${MIN_HEADLINES}), so no sentiment score.`, hi: `इस शेयर का ज़िक्र सिर्फ़ ${n} हाल की ख़बर में है (कम से कम ${MIN_HEADLINES} चाहिए), इसलिए भावना स्कोर नहीं।` } };
  }
  let pos = 0, neg = 0;
  for (const t of hits) { const s = headlineSentiment(t, 'en').sentiment; if (s === 'positive') pos++; else if (s === 'negative') neg++; }
  const score = Math.round(Math.min(100, Math.max(0, 50 + (50 * (pos - neg)) / n)));
  const neu = n - pos - neg;
  const bull: L2[] = pos > neg ? [{ en: `${pos} of ${n} recent headlines read positive`, hi: `हाल की ${n} में से ${pos} ख़बरें सकारात्मक लगती हैं` }] : [];
  const bear: L2[] = neg > pos ? [{ en: `${neg} of ${n} recent headlines read negative`, hi: `हाल की ${n} में से ${neg} ख़बरें नकारात्मक लगती हैं` }] : [];
  return {
    score, n, asOf: null, bull, bear,
    summary: { en: `Headline sentiment ${score}/100: ${pos} positive, ${neg} negative, ${neu} neutral of ${n} recent headlines (keyword counting, can be wrong).`, hi: `ख़बरों की भावना ${score}/100: हाल की ${n} ख़बरों में ${pos} सकारात्मक, ${neg} नकारात्मक, ${neu} तटस्थ (शब्द गिनकर, ग़लत हो सकता है)।` },
    evidence: [{ label: { en: 'Headline sentiment', hi: 'ख़बरों की भावना' }, value: `${pos}+ / ${neg}- of ${n}`, direction: pos > neg ? 'positive' : neg > pos ? 'negative' : 'neutral', detail: { en: 'Positive vs negative keyword counts across recent headlines naming the company.', hi: 'कंपनी का नाम लेने वाली हाल की ख़बरों में सकारात्मक बनाम नकारात्मक शब्दों की गिनती।' } }],
  };
}

export async function sentimentLens(symbol: string): Promise<SentimentResult> {
  const items: NewsItem[] = [];
  for (const topic of ['stocks', 'market']) {
    try { items.push(...(await getNews('en' as Lang, topic)).items); } catch { /* feed down: fewer headlines */ }
  }
  const seen = new Set<string>();
  const titles = items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true))).map((i) => i.title);
  const r = scoreHeadlines(titles, symbol);
  const newest = items.filter((i) => i.affectedSymbols.includes(symbol)).map((i) => i.publishedAt).sort().pop() ?? null;
  return { ...r, asOf: newest };
}
