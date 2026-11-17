// Reddit public listings -> SocialPost. Local personal use only.
// NOTE: Reddit's free API/public endpoints are for NON-COMMERCIAL use (https://www.redditinc.com/policies/data-api-terms).
// A commercial FinSaathi must move to a paid Reddit data agreement. We send a descriptive User-Agent, keep
// concurrency at 1, and cache each subreddit for 10 minutes. Order: hot.json -> (403/429/bad body) -> hot.rss -> 'unavailable'.
// Verification 2026-11-21 from the dev machine: www.reddit.com answered 403 (JSON) / 429 (.rss) to curl, so live
// availability depends on the network/IP; the code reports 'unavailable' honestly and never throws.
import { XMLParser } from 'fast-xml-parser';
import type { SocialPost, SourceStatus } from '../../../../shared/contract';
import { Limiter, TtlCache } from '../http';
import { headlineSentiment } from '../sentiment';
import { matchSymbols } from '../news';

export const SUBREDDITS = ['IndianStreetBets', 'IndiaInvestments', 'StockMarketIndia'] as const;
export const REDDIT_UA = 'FinSaathi/1.0 (local personal use)';
export const MIN_ENGAGEMENT = 10;
type FetchFn = typeof fetch;
export interface RedditDeps { fetch?: FetchFn; subs?: readonly string[] }
export interface RedditResult { posts: SocialPost[]; statuses: SourceStatus[] }

const limiter = new Limiter(1);
const cache = new TtlCache<{ posts: SocialPost[]; status: SourceStatus }>(10 * 60_000, 6 * 3600_000);
export const clearRedditCache = () => cache.clear();

/** One GET with a timeout; never throws on HTTP status (returns it). */
export async function fetchOnce(f: FetchFn, url: string, headers: Record<string, string>, timeoutMs = 8000): Promise<{ status: number; body: string }> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try { const r = await f(url, { headers, signal: ctl.signal, redirect: 'follow' }); return { status: r.status, body: await r.text() }; }
  finally { clearTimeout(t); }
}

const lang = (s: string) => (/[ऀ-ॿ]/.test(s) ? 'hi' : 'en') as 'hi' | 'en';
function toPost(p: { id: string; title: string; url: string; author: string | null; sub: string; at: string; engagement: number | null }): SocialPost {
  const l = lang(p.title);
  return { id: `reddit:${p.id}`, origin: 'reddit', title: p.title, url: p.url, author: p.author, community: `r/${p.sub}`, publishedAt: p.at, engagement: p.engagement, sentiment: headlineSentiment(p.title, l).sentiment, affectedSymbols: matchSymbols(p.title, l).map((s) => s.symbol) };
}

export function parseRedditJson(body: string, sub: string): SocialPost[] {
  const j = JSON.parse(body);
  const kids: any[] = j?.data?.children;
  if (!Array.isArray(kids)) throw new Error('unexpected Reddit JSON shape');
  const out: SocialPost[] = [];
  for (const k of kids) {
    const d = k?.data; if (!d) continue;
    const title = String(d.title ?? '').replace(/\s+/g, ' ').trim();
    if (d.stickied || d.over_18 || d.removed_by_category || d.selftext === '[removed]' || d.author === '[deleted]' || title.length < 8) continue;
    const engagement = (Number(d.score) || 0) + (Number(d.num_comments) || 0);
    if (engagement < MIN_ENGAGEMENT) continue;
    out.push(toPost({ id: String(d.id), title, url: `https://www.reddit.com${d.permalink}`, author: d.author ? String(d.author) : null, sub, at: new Date((Number(d.created_utc) || 0) * 1000).toISOString(), engagement }));
  }
  return out;
}

/** Atom fallback (hot.rss): no score/NSFW info, so engagement is null. */
export function parseRedditRss(xml: string, sub: string): SocialPost[] {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' }).parse(xml);
  let entries = doc?.feed?.entry ?? [];
  if (!Array.isArray(entries)) entries = [entries];
  if (!doc?.feed) throw new Error('not an Atom feed');
  const out: SocialPost[] = [];
  for (const e of entries) {
    const title = String(typeof e.title === 'object' ? e.title['#text'] ?? '' : e.title ?? '').replace(/\s+/g, ' ').trim();
    const link = Array.isArray(e.link) ? e.link[0] : e.link; const url = String(link?.['@_href'] ?? '');
    const d = new Date(String(e.updated ?? e.published ?? ''));
    if (title.length < 8 || !url || isNaN(d.getTime())) continue;
    const author = typeof e.author === 'object' ? String(e.author?.name ?? '').replace(/^\/u\//, '') : '';
    out.push(toPost({ id: String(e.id ?? url), title, url, author: author || null, sub, at: d.toISOString(), engagement: null }));
  }
  return out;
}

async function loadSub(f: FetchFn, sub: string): Promise<{ posts: SocialPost[]; status: SourceStatus }> {
  const base = { id: `reddit-${sub.toLowerCase()}`, name: `Reddit r/${sub}`, origin: 'reddit' as const };
  const headers = { 'User-Agent': REDDIT_UA };
  const fails: string[] = [];
  try {
    const r = await fetchOnce(f, `https://www.reddit.com/r/${sub}/hot.json?limit=25`, { ...headers, Accept: 'application/json' });
    if (r.status === 200) { const posts = parseRedditJson(r.body, sub); return { posts, status: { ...base, status: 'live', count: posts.length, detail: 'public JSON listing' } }; }
    fails.push(`json HTTP ${r.status}`);
  } catch (e: any) { fails.push(`json ${e?.message ?? 'error'}`); }
  try {
    const r = await fetchOnce(f, `https://www.reddit.com/r/${sub}/hot.rss?limit=25`, { ...headers, Accept: 'application/atom+xml' });
    if (r.status === 200) { const posts = parseRedditRss(r.body, sub); return { posts, status: { ...base, status: 'live', count: posts.length, detail: `RSS fallback (${fails.join(', ')}); no scores available` } }; }
    fails.push(`rss HTTP ${r.status}`);
  } catch (e: any) { fails.push(`rss ${e?.message ?? 'error'}`); }
  return { posts: [], status: { ...base, status: 'unavailable', count: 0, detail: `Reddit blocked or failed: ${fails.join(', ')}`.slice(0, 160) } };
}

export async function fetchReddit(deps: RedditDeps = {}): Promise<RedditResult> {
  const f = deps.fetch ?? ((u, i) => fetch(u, i));
  const subs = deps.subs ?? SUBREDDITS;
  const res = await Promise.all(subs.map(async (sub) => {
    try { return (await cache.wrap(`${deps.fetch ? 'inj:' : ''}${sub}`, () => limiter.run(() => loadSub(f, sub)))).value; }
    catch (e: any) { return { posts: [] as SocialPost[], status: { id: `reddit-${sub.toLowerCase()}`, name: `Reddit r/${sub}`, origin: 'reddit' as const, status: 'unavailable' as const, count: 0, detail: String(e?.message ?? e).slice(0, 120) } }; }
  }));
  return { posts: res.flatMap((r) => r.posts), statuses: res.map((r) => r.status) };
}
