// Detects how the user writes or speaks, so the assistant can answer the same way:
// Devanagari -> Hindi, Roman-script Hindi mixed with English -> Hinglish, anything else -> English.
import type { Lang, ReplyStyle } from '../../../shared/contract';

const HINGLISH_WORDS = new Set([
  'hai', 'hain', 'hoon', 'ho', 'tha', 'thi', 'kya', 'kaise', 'kaisa', 'kaisi', 'kitna', 'kitne', 'kitni', 'kab', 'kyun', 'kyu', 'kahan', 'kaun', 'kon',
  'mujhe', 'mujhko', 'mera', 'meri', 'mere', 'mai', 'humko', 'aap', 'aapka', 'apna', 'tum', 'tumhara',
  'karna', 'karu', 'karun', 'karo', 'kare', 'kar', 'karte', 'chahiye', 'chahta', 'chahti', 'nahi', 'nhi', 'bata', 'batao', 'bataiye', 'batana', 'bataye',
  'lena', 'lun', 'bechna', 'bech', 'kharid', 'kharidna', 'khareed', 'paisa', 'paise', 'rupaye', 'abhi', 'aaj', 'kal', 'wala', 'wali', 'vala',
  'raha', 'rha', 'rahi', 'rahe', 'accha', 'acha', 'theek', 'thik', 'ki', 'ka', 'ke', 'se', 'mein', 'ko', 'pe', 'aur', 'ya', 'toh', 'bhi',
  'sahi', 'galat', 'zyada', 'jyada', 'kam', 'bahut', 'bohot', 'sab', 'kuch', 'koi', 'liye', 'wala', 'upar', 'neeche', 'niche', 'badhega', 'girega',
  'samjhao', 'samjhaiye', 'dikhao', 'dikhaiye', 'btao', 'bolo', 'sunao', 'lagana', 'lagau', 'nivesh', 'bazaar', 'bazar', 'sasta', 'mehnga', 'fayda', 'nuksan',
]);

const DEVANAGARI = /[ऀ-ॿ]/g;
const LATIN = /[A-Za-z]/g;

export function detectStyle(text: string): ReplyStyle {
  const dev = (text.match(DEVANAGARI) ?? []).length;
  const lat = (text.match(LATIN) ?? []).length;
  if (dev + lat === 0) return 'en';
  if (dev / (dev + lat) >= 0.3) return 'hi';
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (!tokens.length) return 'en';
  const hits = tokens.filter((t) => HINGLISH_WORDS.has(t));
  const distinct = new Set(hits);
  // Words like "to", "me", "share", "ka" also occur in plain English, so require real evidence.
  if (distinct.size >= 2 && hits.length / tokens.length >= 0.25) return 'hinglish';
  if (distinct.size >= 3) return 'hinglish';
  return 'en';
}

/** The language used for canned text (rules engine, refusals, disclaimer). Hinglish stays in Latin script. */
export const styleToLang = (s: ReplyStyle): Lang => (s === 'hi' ? 'hi' : 'en');

export const STYLE_INSTRUCTION: Record<ReplyStyle, string> = {
  hi: 'Answer in simple, natural Hindi written in Devanagari script.',
  hinglish: "Answer in Hinglish: Hindi written in Roman/English letters, mixed with common English finance words, exactly the way the user writes (for example 'Reliance ka share aaj 2% upar hai'). Do not use Devanagari.",
  en: 'Answer in plain English.',
};
