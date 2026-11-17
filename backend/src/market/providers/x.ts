// X (Twitter) API v2 recent search -> SocialPost. Active ONLY when X_BEARER_TOKEN is set.
// X API is pay-per-use (about $0.005 per post read), so there is a hard daily cap (X_DAILY_READ_CAP, default 200
// post reads, counted per UTC day in memory) and a 15 minute cache. The token is never logged or returned.
import type { SocialPost, SourceStatus } from '../../../../shared/contract';
import { TtlCache } from '../http';
import { headlineSentiment } from '../sentiment';
import { matchSymbols } from '../news';
import { fetchOnce } from './reddit';

type FetchFn = typeof fetch;
export const X_QUERY = '(Nifty OR Sensex OR "Bank Nifty" OR NSE OR BSE OR #StockMarketIndia) lang:en -is:retweet';
export const X_URL = 'https://api.x.com/2/tweets/search/recent';
const SRC = { id: 'x', name: 'X (Twitter)', origin: 'x' as const };
export interface XDeps { fetch?: FetchFn; token?: string; cap?: number; now?: () => number }
export interface XResult { posts: SocialPost[]; status: SourceStatus }

const cache = new TtlCache<XResult>(15 * 60_000, 6 * 3600_000);
let usage = { day: '', reads: 0 };
export const clearXCache = () => { cache.clear(); usage = { day: '', reads: 0 }; };
export const xReadsToday = () => usage.reads;

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
function capFrom(env: string | undefined): number { const n = Number(env); return env && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 200; }

export function parseX(body: string): SocialPost[] {
  const j = JSON.parse(body);
  const users = new Map<string, string>((j?.includes?.users ?? []).map((u: any) => [String(u.id), String(u.username)]));
  const out: SocialPost[] = [];
  for (const t of j?.data ?? []) {
    const text = String(t.text ?? '').replace(/https?:\/\/t\.co\/\S+/g, '').replace(/\s+/g, ' ').trim();
    const d = new Date(String(t.created_at ?? ''));
    if (!text || isNaN(d.getTime())) continue;
    const m = t.public_metrics ?? {};
    const author = users.get(String(t.author_id)) ?? null;
    out.push({
      id: `x:${t.id}`, origin: 'x', title: text.length > 280 ? text.slice(0, 277) + '...' : text,
      url: author ? `https://x.com/${author}/status/${t.id}` : `https://x.com/i/web/status/${t.id}`,
      author: author ? `@${author}` : null, community: null, publishedAt: d.toISOString(),
      engagement: (m.like_count ?? 0) + (m.reply_count ?? 0) + (m.retweet_count ?? 0) + (m.quote_count ?? 0),
      sentiment: headlineSentiment(text, 'en').sentiment, affectedSymbols: matchSymbols(text, 'en').map((s) => s.symbol),
    });
  }
  return out;
}

export async function fetchX(deps: XDeps = {}): Promise<XResult> {
  const token = (deps.token ?? process.env.X_BEARER_TOKEN ?? '').trim();
  if (!token) return { posts: [], status: { ...SRC, status: 'not_configured', count: 0, detail: 'Add X_BEARER_TOKEN to backend/.env; X API is pay-per-use, about $0.005 per post read' } };
  const cap = deps.cap ?? capFrom(process.env.X_DAILY_READ_CAP);
  const f: FetchFn = deps.fetch ?? ((u, i) => fetch(u, i));
  const now = deps.now ?? Date.now;
  const day0 = dayKey(now());
  if (usage.day === day0 && usage.reads >= cap) return { posts: [], status: { ...SRC, status: 'unavailable', count: 0, detail: 'daily read cap reached' } };
  try {
    return (await cache.wrap('recent', async () => {
      const day = dayKey(now());
      if (usage.day !== day) usage = { day, reads: 0 };
      if (usage.reads >= cap) return { posts: [], status: { ...SRC, status: 'unavailable' as const, count: 0, detail: 'daily read cap reached' } };
      const qs = new URLSearchParams({ query: X_QUERY, max_results: '20', 'tweet.fields': 'created_at,public_metrics,author_id', expansions: 'author_id', 'user.fields': 'username' });
      const r = await fetchOnce(f, `${X_URL}?${qs}`, { Authorization: `Bearer ${token}`, 'User-Agent': 'FinSaathi/1.0 (local personal use)' });
      if (r.status !== 200) throw new Error(r.status === 401 || r.status === 403 ? `X rejected the token (HTTP ${r.status})` : r.status === 429 ? 'X rate limit (HTTP 429)' : `X HTTP ${r.status}`);
      const posts = parseX(r.body);
      usage.reads += posts.length;
      return { posts, status: { ...SRC, status: 'live' as const, count: posts.length, detail: `recent search; ${usage.reads}/${cap} post reads used today` } };
    })).value;
  } catch (e: any) {
    return { posts: [], status: { ...SRC, status: 'unavailable', count: 0, detail: String(e?.message ?? 'error').replace(token, '***').slice(0, 140) } };
  }
}
