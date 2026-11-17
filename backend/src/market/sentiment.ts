// Transparent bilingual keyword sentiment for headlines. Deliberately simple and explainable; it can be wrong
// (sarcasm, negation, context), which the sentimentMethod string says out loud.
import type { Lang } from '../../../shared/contract';

const POS_EN = ['rally', 'rallies', 'surge', 'surges', 'soar', 'soars', 'gain', 'gains', 'jump', 'jumps', 'rise', 'rises', 'climb', 'climbs', 'rebound', 'rebounds', 'record high', 'all-time high', 'upgrade', 'upgrades', 'beat', 'beats', 'strong', 'bullish', 'boost', 'boosts', 'growth', 'profit rises', 'higher', 'recover', 'recovers', 'optimism', 'relief', 'outperform'];
const NEG_EN = ['fall', 'falls', 'slump', 'slumps', 'crash', 'crashes', 'plunge', 'plunges', 'drop', 'drops', 'loss', 'losses', 'downgrade', 'downgrades', 'weak', 'miss', 'misses', 'selloff', 'sell-off', 'tumble', 'tumbles', 'bearish', 'concern', 'concerns', 'fraud', 'probe', 'default', 'slide', 'slides', 'cut', 'cuts', 'lower', 'decline', 'declines', 'fear', 'fears', 'worry', 'volatile', 'pressure', 'war', 'tension', 'penalty', 'ban'];
const POS_HI = ['तेज़ी', 'तेजी', 'उछाल', 'उछला', 'बढ़त', 'चढ़ा', 'चढ़ गया', 'चढ़े', 'रिकॉर्ड', 'मुनाफा', 'मुनाफ़ा', 'मज़बूत', 'मजबूत', 'बढ़ा', 'बढ़े', 'राहत', 'सुधार', 'ऊपर', 'फायदा', 'बेहतर', 'हरे निशान'];
const NEG_HI = ['गिरावट', 'टूटा', 'टूटे', 'फिसला', 'फिसले', 'गिरा', 'गिरे', 'नुकसान', 'घाटा', 'कमज़ोर', 'कमजोर', 'बिकवाली', 'मंदी', 'दबाव', 'धड़ाम', 'लुढ़का', 'लुढ़के', 'चिंता', 'डर', 'जुर्माना', 'पाबंदी', 'तनाव', 'लाल निशान'];

const strip = (s: string) => s.replace(/़/g, '').toLowerCase();
const wordRe = (w: string) => new RegExp(`(^|[^a-z])${w.replace(/[-\s]/g, '[-\\s]')}($|[^a-z])`, 'i');
const RE_POS_EN = POS_EN.map(wordRe), RE_NEG_EN = NEG_EN.map(wordRe);
const POS_HI_N = POS_HI.map(strip), NEG_HI_N = NEG_HI.map(strip);

export type Sentiment = 'positive' | 'neutral' | 'negative';
export function headlineSentiment(title: string, lang: Lang): { sentiment: Sentiment; pos: number; neg: number } {
  let pos = 0, neg = 0;
  if (lang === 'hi') {
    const t = strip(title);
    pos = POS_HI_N.filter((w) => t.includes(w)).length; neg = NEG_HI_N.filter((w) => t.includes(w)).length;
  } else {
    pos = RE_POS_EN.filter((r) => r.test(title)).length; neg = RE_NEG_EN.filter((r) => r.test(title)).length;
  }
  return { sentiment: pos > neg ? 'positive' : neg > pos ? 'negative' : 'neutral', pos, neg };
}
export const sentimentMethod = (lang: Lang): string =>
  lang === 'hi'
    ? `सिर्फ़ शीर्षक में तेज़ी/गिरावट जैसे शब्द गिनकर तय किया गया (${POS_HI.length} सकारात्मक और ${NEG_HI.length} नकारात्मक शब्दों की सूची)। यह AI नहीं है और ग़लत हो सकता है; पूरी ख़बर ज़रूर पढ़ें।`
    : `Counted positive vs negative keywords in the headline only (word lists of ${POS_EN.length} positive and ${NEG_EN.length} negative terms). Not AI, and it can be wrong; read the full story.`;
