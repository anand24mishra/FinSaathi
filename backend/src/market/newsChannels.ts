// News channels: every source (Google News, finance RSS, verified public Telegram news channels) merged into one simple,
// in-app reading feed split by channel. Telegram posts are presented as ordinary news items from the publisher
// (e.g. "Mint") with their full text; the app never needs to open Telegram.
import { createHash } from 'node:crypto';
import type { Lang, NewsChannelId, NewsFeed, NewsItem, SocialPost } from '../../../shared/contract';
import { reportService } from '../core/health';
import { dedupe, getNews, toNewsItem, type Topic } from './news';
import { fetchRssFeeds } from './providers/rssFeeds';
import { fetchTelegram, telegramText } from './providers/telegram';
import type { RawNews } from './providers/googleNews';
import { TtlCache, iso } from './http';
import { DataError } from './data';

export const CHANNEL_IDS = ['all', 'markets', 'stocks', 'economy', 'ipo', 'funds', 'gold'] as const;
const TOPIC_OF: Partial<Record<NewsChannelId, Topic>> = { markets: 'market', stocks: 'stocks', economy: 'economy', ipo: 'ipo', funds: 'funds', gold: 'gold' };

/** Verified channel handle -> the publication's real name. */
export const PUBLISHER: Record<string, string> = {
  livemint: 'Mint', hindubusinessline: 'BusinessLine', moneycontrolcom: 'Moneycontrol', bsindiaofficial: 'Business Standard',
};

const RE = {
  ipo: /\bipos?\b|\bgmp\b|anchor investor|\bdrhp\b|\brhp\b|price band|listing gains?|आईपीओ/i,
  funds: /mutual fund|\bsips?\b|\bnav\b|\betfs?\b|\bamfi\b|fund house|\bnfo\b|म्यूचुअल फंड|एसआईपी/i,
  gold: /\bgold\b|\bsilver\b|bullion|सोना|सोने|चांदी|चाँदी/i,
  economy: /\brbi\b|inflation|\bgdp\b|repo rate|fiscal|budget|\bcpi\b|\bwpi\b|trade deficit|monetary policy|rupee|economy|आरबीआई|महंगाई|अर्थव्यवस्था|रुपया/i,
  stocks: /\bshares?\b|\bstocks?\b|q[1-4]\s?(fy)?\d*|results?|earnings|target price|brokerage|dividend|buyback|block deal|शेयर|नतीजे/i,
};
/** Which channel a headline belongs to (most specific first); anything else is general "markets". */
export function classify(text: string, hasSymbols = false): Exclude<NewsChannelId, 'all'> {
  if (RE.ipo.test(text)) return 'ipo';
  if (RE.funds.test(text)) return 'funds';
  if (RE.gold.test(text)) return 'gold';
  if (RE.economy.test(text)) return 'economy';
  if (hasSymbols || RE.stocks.test(text)) return 'stocks';
  return 'markets';
}

const firstLine = (t: string, max = 150): string => {
  const one = t.split(/\n/)[0].replace(/\s+/g, ' ').trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max); const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '') + '…';
};

/** A verified-Telegram-channel post as a normal news item: publisher name, headline, full text, no outbound link. */
export function telegramToNews(p: SocialPost): NewsItem {
  const handle = (p.community ?? '').replace(/^@/, '').toLowerCase();
  const text = telegramText(p).trim();
  const l: Lang = /[ऀ-ॿ]/.test(text) ? 'hi' : 'en';
  const raw: RawNews = {
    id: createHash('sha1').update(p.id).digest('hex').slice(0, 12), title: firstLine(text), url: '', publishedAt: p.publishedAt,
    publisher: PUBLISHER[handle] ?? p.author ?? 'News', lang: l, body: text,
  };
  return toNewsItem(raw, l);
}

const cache = new TtlCache<NewsFeed>(5 * 60_000, 6 * 3600_000);
export const clearChannelCache = () => cache.clear();

async function build(lang: Lang, id: NewsChannelId): Promise<NewsFeed> {
  const topic = TOPIC_OF[id];
  const [g, rss, tg] = await Promise.allSettled([getNews(lang, topic ?? 'market'), fetchRssFeeds(lang), fetchTelegram()]);
  const pool: NewsItem[] = [];
  if (g.status === 'fulfilled') pool.push(...g.value.items.map((n) => ({ ...n, channel: topic ? id : classify(n.title, n.affectedSymbols.length > 0) })));
  if (rss.status === 'fulfilled') pool.push(...rss.value.items.map((r) => toNewsItem(r, r.lang)).map((n) => ({ ...n, channel: classify(`${n.title} ${n.summary ?? ''}`, n.affectedSymbols.length > 0) })));
  if (tg.status === 'fulfilled') {
    pool.push(...tg.value.posts.map(telegramToNews).map((n) => ({ ...n, channel: classify(`${n.title} ${n.body ?? ''}`, n.affectedSymbols.length > 0) })));
    const live = tg.value.statuses.filter((s) => s.status === 'live').length;
    reportService('telegram', live > 0, `${live}/${tg.value.statuses.length} channels live`);
  }
  if (!pool.length) throw new Error('no source returned news');
  const wanted = id === 'all' ? pool : pool.filter((n) => n.channel === id);
  // Hindi readers see Hindi items first, then English ones.
  const rank = (n: NewsItem) => (lang === 'hi' && n.lang !== 'hi' ? 1 : 0);
  const sorted = wanted.sort((a, b) => rank(a) - rank(b) || b.publishedAt.localeCompare(a.publishedAt));
  return { asOf: iso(), lang, items: dedupe(sorted).slice(0, 60), source: 'Google News, Mint, Economic Times, Business Standard, BusinessLine, Moneycontrol' };
}

export async function getNewsChannel(lang: Lang, id: string = 'all'): Promise<NewsFeed> {
  const ch: NewsChannelId = (CHANNEL_IDS as readonly string[]).includes(id) ? (id as NewsChannelId) : 'all';
  try { return (await cache.wrap(`${lang}:${ch}`, () => build(lang, ch))).value; }
  catch (e: any) { throw new DataError('upstream_unavailable', `News is unavailable right now (${e?.message ?? 'error'})`, true); }
}
