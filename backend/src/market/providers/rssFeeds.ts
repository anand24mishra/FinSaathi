// Generic finance RSS provider for Indian outlets (headlines + links only; we link out to the publisher).
// Local prototype use. Feed list verified with curl on 2026-11-21 (HTTP 200, valid RSS 2.0 with <item>s):
//   Economic Times Markets (50 items), ET Stocks (50), Livemint Markets (35), Livemint Companies (35),
//   Business Standard Markets (35), NDTV Profit latest (20, mixed topics -> sports etc. filtered by URL),
//   CNBC-TV18 Market (200).
// Checked and DROPPED: Moneycontrol rss/*.xml (403 Access Denied to non-browser clients).
// All feeds are English; for lang 'hi' they are skipped (no verified Hindi finance feed yet).
import { XMLParser } from 'fast-xml-parser';
import type { Lang, SourceStatus } from '../../../../shared/contract';
import { getText, Limiter, TtlCache, TTL } from '../http';
import type { RawNews } from './googleNews';

export interface FeedDef { id: string; name: string; url: string; lang: Lang; skipPath?: RegExp }
export const FEEDS: FeedDef[] = [
  { id: 'et-markets', name: 'Economic Times Markets', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', lang: 'en' },
  { id: 'et-stocks', name: 'Economic Times Stocks', url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms', lang: 'en' },
  { id: 'mint-markets', name: 'Livemint Markets', url: 'https://www.livemint.com/rss/markets', lang: 'en' },
  { id: 'mint-companies', name: 'Livemint Companies', url: 'https://www.livemint.com/rss/companies', lang: 'en' },
  { id: 'bs-markets', name: 'Business Standard Markets', url: 'https://www.business-standard.com/rss/markets-106.rss', lang: 'en' },
  { id: 'ndtv-profit', name: 'NDTV Profit', url: 'https://feeds.feedburner.com/ndtvprofit-latest', lang: 'en', skipPath: /\/(sports?|entertainment|lifestyle|cricket|trending|world)\// },
  { id: 'cnbctv18-markets', name: 'CNBC-TV18 Markets', url: 'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml', lang: 'en' },
];

const text = (v: any): string => {
  if (v == null) return '';
  if (typeof v === 'object') return String(v['#text'] ?? '');
  return String(v);
};

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** RSS <description> -> plain text; dropped when it only repeats the headline. */
export function cleanSummary(raw: string, title: string): string | undefined {
  const t = raw.replace(/<[^>]*>/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&([a-z]+);/gi, (m, e) => ENT[e.toLowerCase()] ?? m).replace(/\s+/g, ' ').trim();
  if (t.length < 25) return undefined;
  const k = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (k(t).startsWith(k(title).slice(0, 40)) && k(t).length < k(title).length + 20) return undefined;
  return t.length > 400 ? t.slice(0, 397).trimEnd() + '…' : t;
}

/** Parse a plain RSS 2.0 feed (CDATA ok). Titles are kept intact (no " - Publisher" stripping). */
export function parseFeed(xml: string, publisher: string, lang: Lang, skipPath?: RegExp): RawNews[] {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' }).parse(xml);
  let items = doc?.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) items = [items];
  const out: RawNews[] = [];
  for (const it of items) {
    const title = text(it.title).replace(/\s+/g, ' ').trim();
    const url = text(it.link).trim() || text(it.guid).trim();
    const d = new Date(text(it.pubDate).trim());
    if (!title || !/^https?:\/\//.test(url) || isNaN(d.getTime())) continue;
    if (skipPath?.test(url)) continue;
    const summary = cleanSummary(text(it.description), title);
    out.push({ title, url: url.replace(/#publisher=newsstand$/, ''), publishedAt: d.toISOString(), publisher, lang, ...(summary ? { summary } : {}) });
  }
  return out;
}

const limiter = new Limiter(3);
const cache = new TtlCache<RawNews[]>(TTL.news, 6 * 3600_000);
export const clearRssCache = () => cache.clear();

export interface FeedsResult { items: RawNews[]; statuses: SourceStatus[] }

/** Fetch every feed for `lang`; a failing feed only marks its own status 'unavailable'. */
export async function fetchRssFeeds(lang: Lang, feeds: FeedDef[] = FEEDS): Promise<FeedsResult> {
  const active = feeds.filter((f) => f.lang === lang);
  const settled = await Promise.allSettled(active.map((f) => cache.wrap(f.id, async () => {
    const xml = await getText(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinSaathi/1.0 local personal use)', Accept: 'application/rss+xml, application/xml, text/xml' }, limiter, retries: 1 });
    const items = parseFeed(xml, f.name, f.lang, f.skipPath);
    if (!items.length) throw new Error('no items in feed');
    return items.slice(0, 30);
  })));
  const items: RawNews[] = []; const statuses: SourceStatus[] = [];
  settled.forEach((r, i) => {
    const f = active[i];
    if (r.status === 'fulfilled') {
      items.push(...r.value.value);
      statuses.push({ id: f.id, name: f.name, origin: 'news', status: 'live', count: r.value.value.length, detail: r.value.stale ? 'serving cached items (last refresh failed)' : 'RSS ok' });
    } else statuses.push({ id: f.id, name: f.name, origin: 'news', status: 'unavailable', count: 0, detail: String((r.reason as Error)?.message ?? r.reason).slice(0, 120) });
  });
  return { items, statuses };
}
