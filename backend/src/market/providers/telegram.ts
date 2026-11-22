// Public Telegram channel previews (https://t.me/s/<handle>) -> SocialPost. Local personal use; no API key.
//
// PRODUCT RULES (Telegram is the main channel for Indian stock-tip pump-and-dump fraud; SEBI warns about it repeatedly):
//  1. Only an operator allow-list of reputable PUBLIC news/official channels is read, never tipster channels.
//     Users cannot add channels from the app; the operator can via env TELEGRAM_CHANNELS (comma separated handles).
//  2. Every item is community/unverified chatter (origin 'telegram', community '@handle'), never a call.
//  3. Posts that look like tips or promotions are dropped (looksLikeTip), as are forwards, ads and photo-only posts.
//
// Handle verification (curl against https://t.me/s/<handle>, 2026-11-21 and re-checked 2026-11-22 by READING the posts, not just
// the channel name; this network is flaky, so "no response" means unreachable from here, not necessarily non-existent):
//   ACCEPTED  livemint          "Mint Business News - Official Channel", 20 posts, newest same day, on-topic business news.
//   ACCEPTED  hindubusinessline "BusinessLine" (The Hindu businessline, official), 20 posts, newest same day, on-topic.
//   ACCEPTED  moneycontrolcom   "Moneycontrol" (description links the outlet's own Facebook/Twitter), 20 posts, newest same day.
//   ACCEPTED  bsindiaofficial   "Business Standard Official" ("The official Telegram channel of Business Standard"), newest 2026-11-21.
//   REJECTED AS FRAUD  cnbcawaaz (active, but the posts are a crypto "profit" scam, not the broadcaster), varsity (sells
//             hacked-style social-media accounts, nothing to do with Zerodha Varsity).
//   REJECTED  equitymasterofficial (real publisher, but posts are paid-research promotions and stock lists, i.e. tip-like),
//             ETMarkets (an Ethiopian market channel), thehindubusinessline (stale since 2023), businessstandard (squatted
//             "Business Standart"), bloombergquint (idle since 2024), MoneycontrolOfficial (last post 2023), BusinessTodayOfficial /
//             businesstodayofficial (last post 2026-03), economictimesofficial / financialexpressofficial / zerodhaonline /
//             zerodhavarsity (frozen since 2023), cnbctv18news (2 posts, 2024), sebiindia (1 post, 2022), timesofindia,
//             indianexpress (general news, weeks idle), ndtv.
//   NO PUBLIC PREVIEW (no such channel): NSEIndia, BSEIndia, sebi_official, RBI_Official, PIB_India, etnow, cnbctv18, zeebusiness,
//             moneycontrol, ndtvprofit, economictimes, financialexpress, reuters_india.
// Re-run scripts/smoke-telegram.ts to re-check, and add handles only after reading their preview by eye.
import type { SocialPost, SourceStatus } from '../../../../shared/contract';
import { detectRefusal } from '../../ai/assistant';
import { bannedHit } from '../../ai/guardrails';
import { Limiter, TtlCache } from '../http';
import { matchSymbols } from '../news';
import { headlineSentiment } from '../sentiment';
import { fetchOnce } from './reddit';

export const DEFAULT_TELEGRAM_CHANNELS = ['livemint', 'hindubusinessline', 'moneycontrolcom', 'bsindiaofficial'] as const;
export const TELEGRAM_UA = 'FinSaathi/1.0 (local personal use; public channel preview reader)';
export const MAX_POST_AGE_MS = 7 * 24 * 3600_000;
type FetchFn = typeof fetch;
export interface TelegramDeps { fetch?: FetchFn; channels?: readonly string[]; now?: () => number }
export interface TelegramResult { posts: SocialPost[]; statuses: SourceStatus[] }
export interface ParsedChannel { title: string | null; hasWidget: boolean; posts: SocialPost[]; skipped: { forwarded: number; ads: number; media: number; service: number } }

const limiter = new Limiter(2);
const cache = new TtlCache<{ posts: SocialPost[]; status: SourceStatus }>(8 * 60_000, 6 * 3600_000);
export const clearTelegramCache = () => cache.clear();

const HANDLE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
/** Operator allow-list: TELEGRAM_CHANNELS (comma separated, '@' / t.me/ prefixes tolerated), else the verified default. */
export function configuredChannels(env: string | undefined = process.env.TELEGRAM_CHANNELS): string[] {
  const raw = (env ?? '').split(',').map((s) => s.trim().replace(/^https?:\/\/t\.me\/(s\/)?/i, '').replace(/^@/, '').replace(/[/?#].*$/, '')).filter(Boolean);
  const list = raw.length ? raw : [...DEFAULT_TELEGRAM_CHANNELS];
  return [...new Set(list.filter((h) => HANDLE.test(h)))];
}

// ---------- tip / promotion filter ----------
const PROMO: RegExp[] = [
  /\bjoin\s+(our|us|now|my|free|vip|premium|the\s+(group|channel))\b/i, /\bjoin\b.{0,30}\b(group|channel|whatsapp|telegram|community)\b/i,
  /\bpremium\s+(group|channel|plan|service|tips?|calls?|member\w*|access|pack)\b/i, /\bvip\b/i,
  /\bfree\s+(tips?|calls?|trial|demo|intraday|signals?)\b/i,
  /\btargets?\b[^\n]{0,24}?\d/i, /\btarget\s+price\b/i, /\bstop[\s-]?loss\b/i, /\bsl\s*[:@-]\s*\d/i,
  /\b(buy|sell)\s+(above|below|at|near|on\s+dips?|now|today)\b/i, /\b(buy|sell)\s+(call|tip)s?\b/i, /\bbtst\b|\bstbt\b/i,
  /\b(intraday|swing|stock|option|index|trading)\s+(tips?|calls?|signals?)\b/i, /\b(tips?|calls?)\s+(of\s+the\s+day|for\s+today)\b/i,
  /\bupper\s+circuit\b/i, /\bmulti[\s-]?bagger/i, /\b\d+\s?x\s+(returns?|profit)\b/i, /\bprofit\s+(guarantee|assured)/i,
  /\bsebi[\s-]?(registered|reg\b|registration)/i, /\b(registration|reg)\.?\s*(no|number)\b/i, /\bINH\d{6,}\b|\bINA\d{6,}\b/,
  /\b(dm|inbox)\s+(me|us)\b|\bcontact\s+us\b|\bwhatsapp\b|\bwa\.me\b|\bsubscribe\b|\bsponsored\b|\bpromo(tion|ted)?\b|\badvertis/i,
  /(https?:\/\/)?t\.me\/(\+|joinchat)/i, /chat\.whatsapp\.com|wa\.me\//i, /\+91[\s-]?\d{5}/,
  /टारगेट|प्रीमियम\s*(ग्रुप|चैनल|सर्विस)|फ्री\s*टिप्स?|ग्रुप\s*जॉइन|जॉइन\s*करें|सुनिश्चित\s*मुनाफ|पक्का\s*मुनाफ/,
];
/** Returns the reason a post looks like a tip/promotion (so it is dropped), or null when it looks like plain news. */
export function looksLikeTip(text: string, links: string[] = []): string | null {
  const hay = `${text}\n${links.join('\n')}`;
  const kind = detectRefusal(text);
  if (kind && kind !== 'certainty') return `refusal:${kind}`;
  const b = bannedHit(text); if (b) return `banned:${b}`;
  for (const re of PROMO) { const m = hay.match(re); if (m) return `promo:${m[0].slice(0, 30)}`; }
  return null;
}

// ---------- HTML parsing ----------
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return ''; } }
    return ENT[e.toLowerCase()] ?? m;
  });

/** '1.2K' -> 1200, '3M' -> 3000000, '847' -> 847, junk -> null. */
export function parseViews(s: string | undefined | null): number | null {
  const m = String(s ?? '').trim().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? '').toUpperCase() as 'K' | 'M' | 'B'] ?? 1;
  return Math.round(Number(m[1]) * mult);
}

function messageText(inner: string): { text: string; links: string[] } {
  const links = [...inner.matchAll(/<a\s[^>]*href="([^"]+)"/gi)].map((m) => decodeEntities(m[1]));
  const text = decodeEntities(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|blockquote)>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text, links };
}

const lang = (s: string) => (/[ऀ-ॿ]/.test(s) ? 'hi' : 'en') as 'hi' | 'en';
export function clip(text: string, max = 280): string {
  const one = text.replace(/\s*\n\s*/g, ' ').trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max); const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '') + '…';
}

/** Parse one t.me/s/<handle> page. Does NOT apply the tip filter or the age limit (see fetchTelegram). */
export function parseChannelHtml(html: string, handle: string): ParsedChannel {
  const title = decodeEntities(html.match(/tgme_channel_info_header_title"[^>]*><span[^>]*>([^<]*)</)?.[1] ?? '').trim() || null;
  const out: ParsedChannel = { title, hasWidget: /tgme_(widget_message|channel_info)/.test(html), posts: [], skipped: { forwarded: 0, ads: 0, media: 0, service: 0 } };
  const chunks = html.split(/<div class="tgme_widget_message_wrap/).slice(1);
  for (const raw of chunks) {
    if (/tgme_widget_message_service/.test(raw)) { out.skipped.service++; continue; }
    if (/tgme_widget_message_sponsored|tgme_widget_message_ad\b/.test(raw)) { out.skipped.ads++; continue; }
    if (/tgme_widget_message_forwarded_from/.test(raw)) { out.skipped.forwarded++; continue; } // reposts from unknown channels are a tip route
    const post = raw.match(/data-post="([^"]+)"/)?.[1];
    if (!post || post.split('/')[0].toLowerCase() !== handle.toLowerCase()) continue;
    const body = raw.replace(/<a class="tgme_widget_message_reply[\s\S]*?<\/a>/, '');
    const inner = body.match(/<div class="tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!inner) { out.skipped.media++; continue; } // photo/video/sticker only
    const { text } = messageText(inner);
    const at = new Date(raw.match(/<time[^>]*datetime="([^"]+)"/)?.[1] ?? '');
    if (text.length < 20 || isNaN(at.getTime())) { out.skipped.media++; continue; }
    const l = lang(text);
    const title0 = clip(text);
    out.posts.push({
      id: `telegram:${post}`, origin: 'telegram', title: title0, url: `https://t.me/${post}`, author: title, community: `@${handle}`,
      publishedAt: at.toISOString(), engagement: parseViews(raw.match(/tgme_widget_message_views">([^<]*)</)?.[1]),
      sentiment: headlineSentiment(title0, l).sentiment, affectedSymbols: matchSymbols(text, l).map((s) => s.symbol),
    });
    // keep raw text/links for the filter without widening the SocialPost contract
    rawOf.set(out.posts[out.posts.length - 1], messageText(inner));
  }
  return out;
}
const rawOf = new WeakMap<SocialPost, { text: string; links: string[] }>();

// ---------- fetching ----------
const idOf = (h: string) => `telegram-${h.toLowerCase()}`;
const base = (h: string) => ({ id: idOf(h), name: `Telegram @${h}`, origin: 'telegram' as const });
const down = (h: string, detail: string): { posts: SocialPost[]; status: SourceStatus } => ({ posts: [], status: { ...base(h), status: 'unavailable', count: 0, detail: detail.slice(0, 160) } });

async function loadChannel(f: FetchFn, h: string, now: number): Promise<{ posts: SocialPost[]; status: SourceStatus }> {
  let r: { status: number; body: string };
  const get = () => fetchOnce(f, `https://t.me/s/${h}`, { 'User-Agent': TELEGRAM_UA, Accept: 'text/html' }, 10_000);
  try { try { r = await get(); } catch { r = await get(); } } // t.me resets connections now and then; one retry
  catch (e: any) { return down(h, `request failed: ${e?.name === 'AbortError' ? 'timeout' : e?.message ?? 'error'}`); }
  if (r.status !== 200) return down(h, `HTTP ${r.status}`);
  const parsed = parseChannelHtml(r.body, h);
  if (!parsed.hasWidget || !/tgme_widget_message_wrap/.test(r.body)) return down(h, 'no public preview for this handle');
  let tips = 0, stale = 0;
  const posts = parsed.posts.filter((p) => {
    if (now - Date.parse(p.publishedAt) > MAX_POST_AGE_MS) { stale++; return false; }
    const raw = rawOf.get(p);
    if (looksLikeTip(raw?.text ?? p.title, raw?.links ?? [])) { tips++; return false; }
    return true;
  });
  if (!posts.length && stale && stale >= parsed.posts.length - tips) return down(h, 'channel has no posts in the last 7 days');
  const bits = [`public preview of ${parsed.title ?? '@' + h}`, 'unverified chatter'];
  if (tips) bits.push(`${tips} tip/promo post${tips > 1 ? 's' : ''} dropped`);
  const fwd = parsed.skipped.forwarded + parsed.skipped.ads; if (fwd) bits.push(`${fwd} forward/ad skipped`);
  return { posts, status: { ...base(h), status: 'live', count: posts.length, detail: bits.join('; ') } };
}

export async function fetchTelegram(deps: TelegramDeps = {}): Promise<TelegramResult> {
  const f = deps.fetch ?? ((u, i) => fetch(u, i));
  const channels = deps.channels ?? configuredChannels();
  const now = deps.now ?? Date.now;
  const res = await Promise.all(channels.map(async (h) => {
    try { return (await cache.wrap(`${deps.fetch ? 'inj:' : ''}${h}`, () => limiter.run(() => loadChannel(f, h, now())))).value; }
    catch (e: any) { return down(h, String(e?.message ?? e)); }
  }));
  return { posts: res.flatMap((r) => r.posts), statuses: res.map((r) => r.status) };
}
