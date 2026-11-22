import { createHash } from 'node:crypto';
import type { Lang, NewsFeed, NewsItem } from '../../../shared/contract';
import { fetchNewsRss, NEWS_SOURCE, type RawNews } from './providers/googleNews';
import { headlineSentiment, sentimentMethod } from './sentiment';
import { NIFTY50, type RefStock } from './reference/nifty50';
import { TtlCache, TTL, iso } from './http';
import { DataError } from './data';

export const TOPICS = ['market', 'economy', 'stocks', 'ipo', 'gold', 'funds'] as const;
export type Topic = (typeof TOPICS)[number];
const QUERY: Record<Lang, Record<Topic, string>> = {
  en: { market: 'Sensex Nifty stock market India', economy: 'India economy RBI inflation', stocks: 'India stocks shares results NSE', ipo: 'IPO India NSE BSE', gold: 'gold price India', funds: 'mutual fund SIP India' },
  hi: { market: 'सेंसेक्स निफ्टी शेयर बाजार', economy: 'भारत अर्थव्यवस्था आरबीआई महंगाई', stocks: 'शेयर कंपनी नतीजे निफ्टी', ipo: 'आईपीओ', gold: 'सोने का भाव', funds: 'म्यूचुअल फंड एसआईपी' },
};

const strip = (s: string) => s.replace(/़/g, '').toLowerCase();
/** Which Nifty companies a headline mentions (name/alias/ticker; short aliases need exact capitals to avoid false matches). */
export function matchSymbols(title: string, lang: Lang): RefStock[] {
  const out: RefStock[] = [];
  const t = strip(title);
  for (const s of NIFTY50) {
    let hit = false;
    const base = s.symbol.replace('.NS', '');
    if (new RegExp(`(^|[^A-Za-z])${base.replace(/[&-]/g, '\\$&')}($|[^A-Za-z])`).test(title) && base.length >= 3) hit = true;
    for (const a of s.alias) {
      if (hit) break;
      if (a.length <= 4) { if (new RegExp(`(^|[^A-Za-z])${a.toUpperCase().replace(/&/g, '\\&')}($|[^A-Za-z])`).test(title)) hit = true; }
      else if (new RegExp(`(^|[^a-z])${a.replace(/[&.]/g, '\\$&')}($|[^a-z])`, 'i').test(title)) hit = true;
    }
    if (!hit && lang === 'hi') hit = s.hi.some((h) => h.length >= 4 && t.includes(strip(h)));
    if (hit) out.push(s);
  }
  return out;
}

const SENT_WORD = { en: { positive: 'positive', negative: 'negative', neutral: 'neutral' }, hi: { positive: 'सकारात्मक', negative: 'नकारात्मक', neutral: 'तटस्थ' } };
export function toNewsItem(r: RawNews, lang: Lang): NewsItem {
  const { sentiment } = headlineSentiment(r.title, lang);
  const syms = matchSymbols(r.title, lang);
  const names = syms.slice(0, 3).map((s) => (lang === 'hi' && s.hi[0] ? s.hi[0] : s.name)).join(', ');
  const sw = SENT_WORD[lang][sentiment];
  let explanation: string, impact: string | null = null;
  if (syms.length) {
    explanation = lang === 'hi'
      ? `यह ख़बर ${names} के बारे में है। शीर्षक के शब्दों से यह ${sw} लगती है। एक शीर्षक पूरी कहानी नहीं बताता।`
      : `This headline is about ${names}. From its wording it reads ${sw}. A single headline never tells the whole story.`;
    impact = lang === 'hi'
      ? `ऐसी ख़बरें कम समय में ${names} के भाव को ऊपर-नीचे कर सकती हैं, पर इससे यह तय नहीं होता कि कंपनी लंबे समय के लिए अच्छी है या नहीं। कोई फ़ैसला लेने से पहले पूरी ख़बर पढ़ें।`
      : `News like this may move ${names}'s price in the short term, but it does not decide whether the company suits you for the long run. Read the full story before acting.`;
  } else {
    explanation = lang === 'hi' ? `बाज़ार या अर्थव्यवस्था की सामान्य ख़बर; शीर्षक के शब्दों से ${sw} लगती है।` : `General market or economy news; its wording reads ${sw}.`;
  }
  return {
    id: r.id ?? createHash('sha1').update(r.url).digest('hex').slice(0, 12), title: r.title, source: r.publisher, url: r.url, publishedAt: r.publishedAt, lang,
    sentiment, sentimentMethod: sentimentMethod(lang), explanation, affectedSymbols: syms.map((s) => s.symbol), impact,
    ...(r.summary ? { summary: r.summary } : {}), ...(r.body ? { body: r.body } : {}),
  };
}

export function dedupe<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>(); const out: T[] = [];
  for (const it of items) {
    const k = it.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 60);
    if (seen.has(k)) continue; seen.add(k); out.push(it);
  }
  return out;
}

const cache = new TtlCache<NewsFeed>(TTL.news, 6 * 3600_000);
export async function getNews(lang: Lang, topic: string = 'market'): Promise<NewsFeed> {
  const t: Topic = (TOPICS as readonly string[]).includes(topic) ? (topic as Topic) : 'market';
  try {
    const r = await cache.wrap(`${lang}:${t}`, async () => {
      const raw = await fetchNewsRss(QUERY[lang][t], lang);
      if (!raw.length) throw new Error('no items');
      const items = dedupe(raw.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))).slice(0, 25).map((x) => toNewsItem(x, lang));
      return { asOf: iso(), lang, items, source: NEWS_SOURCE } satisfies NewsFeed;
    });
    return r.value;
  } catch (e: any) { throw new DataError('upstream_unavailable', `News is unavailable right now (${e?.message ?? 'error'})`, true); }
}
export const clearNewsCache = () => cache.clear();
