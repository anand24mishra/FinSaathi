// Telegram bot (Bot API, long polling). The bot only talks to a user who linked THEIR OWN private chat from the app:
// it sends alerts and answers /calls and /note. It never posts into groups/channels and ignores non-private chats.
// Needs TELEGRAM_BOT_TOKEN (from @BotFather). Without it every function here is inert: status not_configured, zero network calls.
// The token is only ever used to build the API URL; it is never logged or returned, and error text is scrubbed of it.
import { createHash, randomBytes } from 'node:crypto';
import type { CallAction, CallsFeed, Lang, StockCall, TelegramStatus } from '../../../shared/contract';
import { config } from '../config';
import { telegramCodes, telegramLinks } from '../store';
import { getCallsFeed } from '../market/analysis/calls';
import { getProfile } from './users';

type FetchFn = typeof fetch;
type Bi = { en: string; hi: string };
export interface BotLog { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void }
const noLog: BotLog = { info: () => {}, warn: () => {} };

export const NOT_CONFIGURED_DETAIL = 'Add TELEGRAM_BOT_TOKEN to backend/.env (create a bot with @BotFather)';
export const CODE_TTL_MS = 15 * 60_000;
const CODES_PER_WINDOW = 5;          // link codes a user may create per 15 minutes
const START_ATTEMPTS_PER_MIN = 5;    // /start <code> attempts per chat per minute

let deps = { fetch: ((u: any, i?: any) => fetch(u, i)) as FetchFn, now: () => Date.now(), log: noLog };
let me: { username: string } | null = null;
let offset = 0;
let running = false;
let abort: AbortController | null = null;
let loop: Promise<void> | null = null;
const attempts = new Map<string, { n: number; resetAt: number }>();
const created = new Map<string, { n: number; resetAt: number }>();

/** Test hook: inject fetch/clock/logger and reset in-memory state. */
export function __setTelegramDeps(d: Partial<typeof deps> = {}): void {
  deps = { fetch: ((u: any, i?: any) => fetch(u, i)) as FetchFn, now: () => Date.now(), log: noLog, ...d };
  me = null; offset = 0; attempts.clear(); created.clear();
}

const token = (): string | null => process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
export const telegramConfigured = (): boolean => !!token();
const enabledFlag = (): boolean => !['0', 'false', 'no', 'off'].includes((process.env.TELEGRAM_ENABLED ?? '').toLowerCase());
const scrub = (s: string): string => { const t = token(); return (t ? s.split(t).join('***') : s).slice(0, 200); };
/** Log-safe chat reference: never the full id. */
export const maskChat = (id: string): string => `chat…${String(id).slice(-3)}`;

class TgError extends Error { constructor(public code: number, message: string) { super(message); } }

async function api<T = any>(method: string, body: object, timeoutMs = 15_000, signal?: AbortSignal): Promise<T> {
  const t = token(); if (!t) throw new Error('not configured');
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const onAbort = () => ctl.abort(); signal?.addEventListener('abort', onAbort);
  try {
    const r = await deps.fetch(`https://api.telegram.org/bot${t}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    let j: any = null; try { j = await r.json(); } catch { /* non-JSON */ }
    if (!j?.ok) throw new TgError(Number(j?.error_code ?? r.status), String(j?.description ?? `HTTP ${r.status}`));
    return j.result as T;
  } catch (e: any) {
    if (e instanceof TgError) throw new TgError(e.code, scrub(e.message));
    throw new Error(scrub(String(e?.name === 'AbortError' ? 'timeout' : e?.message ?? e)));
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

export async function ensureMe(): Promise<string | null> {
  if (!token()) return null;
  if (me) return me.username;
  try { const r = await api<{ username?: string }>('getMe', {}, 8000); if (r?.username) me = { username: r.username }; } catch (e: any) { deps.log.warn({ err: e.message }, 'telegram getMe failed'); }
  return me?.username ?? null;
}

// ---------- link storage ----------
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no look-alikes; 10 chars = 50 bits
const newCode = () => Array.from(randomBytes(10), (b) => ALPHABET[b % 32]).join('');
const bump = (m: Map<string, { n: number; resetAt: number }>, key: string, windowMs: number, max: number): boolean => {
  const now = deps.now(); const e = m.get(key);
  if (!e || e.resetAt <= now) { m.set(key, { n: 1, resetAt: now + windowMs }); return true; }
  e.n++; return e.n <= max;
};

export class LinkRateLimited extends Error {}
/** Creates a single-use code (stored hashed) for the user; older unused codes of that user are revoked. */
export async function createLinkCode(userId: string): Promise<string> {
  if (!bump(created, userId, CODE_TTL_MS, CODES_PER_WINDOW)) throw new LinkRateLimited('Too many link codes requested. Please wait a few minutes.');
  const code = newCode();
  await telegramCodes().deleteMany({ $or: [{ user_id: userId }, { expires_at: { $lt: deps.now() } }] });
  await telegramCodes().insertOne({ _id: sha(code), user_id: userId, expires_at: deps.now() + CODE_TTL_MS, created_at: new Date(deps.now()).toISOString() });
  return code;
}
/** Consumes a code. Returns the user id, or null when unknown/expired/already used. */
export async function consumeLinkCode(code: string): Promise<string | null> {
  const h = sha(code.trim().toUpperCase());
  const row = await telegramCodes().findOneAndDelete({ _id: h });   // single-use, even when expired
  if (!row) return null;
  return Number(row.expires_at) >= deps.now() ? row.user_id : null;
}
export async function bindChat(userId: string, chatId: string): Promise<void> {
  await telegramLinks().deleteMany({ $or: [{ chat_id: chatId }, { _id: userId }] });
  await telegramLinks().insertOne({ _id: userId, chat_id: chatId, linked_at: new Date(deps.now()).toISOString() });
}
export const chatForUser = async (userId: string): Promise<string | null> => (await telegramLinks().findOne({ _id: userId }))?.chat_id ?? null;
export const userForChat = async (chatId: string): Promise<string | null> => (await telegramLinks().findOne({ chat_id: chatId }))?._id ?? null;
export const unlinkUser = async (userId: string): Promise<boolean> => (await telegramLinks().deleteOne({ _id: userId })).deletedCount > 0;
export const isLinked = async (userId: string): Promise<boolean> => (await chatForUser(userId)) !== null;

// ---------- status for the app ----------
export async function getTelegramStatus(userId: string, linkUrl: string | null = null): Promise<TelegramStatus> {
  if (!token()) return { configured: false, linked: false, botUsername: null, linkUrl: null, detail: NOT_CONFIGURED_DETAIL };
  const botUsername = await ensureMe();
  const linked = await isLinked(userId);
  const detail = !botUsername ? 'Telegram is not reachable right now. Try again in a moment.'
    : linkUrl ? 'Open the link on a device with Telegram and press Start. It works once and expires in 15 minutes.'
    : linked ? 'Connected. Important alerts arrive in your Telegram chat; send /calls or /note to the bot any time.'
    : 'Not connected. Create a link to receive alerts in your own Telegram chat.';
  return { configured: true, linked, botUsername, linkUrl, detail };
}
export async function startTelegramLink(userId: string): Promise<TelegramStatus> {
  if (!token()) return getTelegramStatus(userId);
  const botUsername = await ensureMe();
  if (!botUsername) return getTelegramStatus(userId);
  return getTelegramStatus(userId, `https://t.me/${botUsername}?start=${await createLinkCode(userId)}`);
}
export async function unlinkTelegram(userId: string): Promise<TelegramStatus> {
  const chat = await chatForUser(userId);
  await unlinkUser(userId);
  await telegramCodes().deleteMany({ user_id: userId });
  if (chat) void sendMessage(chat, 'Unlinked from FinSaathi. You will no longer get alerts here.\nFinSaathi से जुड़ाव हटा दिया गया। अब यहाँ अलर्ट नहीं आएँगे।');
  return getTelegramStatus(userId);
}

// ---------- sending ----------
export const SEBI_LINE: Bi = { en: 'Research, not SEBI-registered advice. You can lose money.', hi: 'यह रिसर्च है, सेबी-पंजीकृत सलाह नहीं। आपका पैसा डूब सकता है।' };
/** Plain text (no parse_mode), so nothing needs escaping. Never throws. A 403 (user blocked the bot) unlinks the chat. */
export async function sendMessage(chatId: string, text: string): Promise<boolean> {
  if (!token()) return false;
  try { await api('sendMessage', { chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }); return true; }
  catch (e: any) {
    deps.log.warn({ chat: maskChat(chatId), err: e?.message }, 'telegram send failed');
    if (e instanceof TgError && (e.code === 403 || /chat not found/i.test(e.message))) await telegramLinks().deleteMany({ chat_id: chatId });
    return false;
  }
}
/** Alert delivery for a linked user: one message per alert, same text as the push, plus the SEBI line. Failures are swallowed. */
export async function sendTelegramAlerts(userId: string, items: { title: Bi; body: Bi }[]): Promise<void> {
  try {
    if (!token() || !items.length) return;
    const chat = await chatForUser(userId); if (!chat) return;
    const lang = (await getProfile(userId)).language;
    for (const i of items.slice(0, 3)) await sendMessage(chat, `${i.title[lang]}\n${i.body[lang].slice(0, 600)}\n\n${SEBI_LINE[lang]}`);
  } catch { /* never break alert delivery */ }
}

// ---------- commands ----------
const T = {
  help: { en: 'FinSaathi bot. Commands:\n/calls - top research calls\n/note - the analyst note\n/unlink - disconnect this chat\nTo connect, open the FinSaathi app, go to Settings > Telegram and tap Connect.', hi: 'FinSaathi बॉट। कमांड:\n/calls - शीर्ष रिसर्च राय\n/note - विश्लेषक का नोट\n/unlink - यह चैट अलग करें\nजोड़ने के लिए FinSaathi ऐप में सेटिंग्स > Telegram खोलकर Connect दबाएँ।' },
  startNoCode: { en: 'Welcome to FinSaathi. To connect this chat, open the FinSaathi app, go to Settings > Telegram, tap Connect and then press Start in the link it gives you.\nI only send alerts to you; I never join groups and I never give tips.', hi: 'FinSaathi में स्वागत है। यह चैट जोड़ने के लिए FinSaathi ऐप में सेटिंग्स > Telegram खोलें, Connect दबाएँ और मिले लिंक में Start दबाएँ।\nमैं सिर्फ़ आपको अलर्ट भेजता हूँ; ग्रुप में नहीं जुड़ता और टिप नहीं देता।' },
  badCode: { en: 'That link code is invalid, already used, or expired. Please create a new one in the app (Settings > Telegram).', hi: 'यह लिंक कोड अमान्य है, इस्तेमाल हो चुका है या समाप्त हो गया है। कृपया ऐप (सेटिंग्स > Telegram) में नया बनाएँ।' },
  slow: { en: 'Too many attempts. Please wait a minute and try again.', hi: 'बहुत ज़्यादा कोशिशें। कृपया एक मिनट रुककर फिर प्रयास करें।' },
  linked: { en: 'Connected. You will get important FinSaathi alerts here. Send /calls for research calls, /note for the analyst note, /unlink to disconnect.\nWe never send tips, and nothing here is a guarantee.', hi: 'जुड़ गया। महत्वपूर्ण FinSaathi अलर्ट यहीं मिलेंगे। रिसर्च राय के लिए /calls, विश्लेषक नोट के लिए /note, अलग करने के लिए /unlink भेजें।\nहम टिप नहीं भेजते, और यहाँ कुछ भी गारंटी नहीं है।' },
  notLinked: { en: 'This chat is not connected to a FinSaathi account. Open the app, go to Settings > Telegram and tap Connect.', hi: 'यह चैट किसी FinSaathi खाते से जुड़ी नहीं है। ऐप में सेटिंग्स > Telegram खोलकर Connect दबाएँ।' },
  unlinked: { en: 'Disconnected. You will not get alerts here any more. You can reconnect from the app any time.', hi: 'अलग कर दिया गया। अब यहाँ अलर्ट नहीं आएँगे। ऐप से कभी भी दोबारा जोड़ सकते हैं।' },
  unavailable: { en: 'That is not available right now. Please try again in a little while.', hi: 'यह अभी उपलब्ध नहीं है। थोड़ी देर बाद फिर कोशिश करें।' },
} satisfies Record<string, Bi>;

const ACTION_HI: Record<CallAction, string> = { BUY: 'ख़रीदें', ACCUMULATE: 'धीरे-धीरे ख़रीदें', HOLD: 'रखें', REDUCE: 'घटाएँ', SELL: 'बेचें' };
const CONV_HI = { high: 'ऊँचा', medium: 'मध्यम', low: 'कम' } as const;
const callLine = (c: StockCall, lang: Lang) => lang === 'hi'
  ? `• ${c.name}: ${ACTION_HI[c.action]}, स्कोर ${c.score}/100, भरोसा ${CONV_HI[c.conviction]}`
  : `• ${c.name}: ${c.action}, score ${c.score}/100, conviction ${c.conviction}`;

/** Same sections and SEBI reminder as the in-app assistant's calls answer, in plain text. */
export function formatCalls(f: CallsFeed, lang: Lang): string {
  const en = lang === 'en';
  const lines: string[] = [en ? 'Here is what our research calls say right now (rule-based, with reasons in the app):' : 'हमारी रिसर्च राय अभी यह कहती हैं (नियम-आधारित, कारण ऐप में देखें):'];
  const add = (title: string, list: StockCall[], n: number) => { if (list.length) { lines.push('', title, ...list.slice(0, n).map((c) => callLine(c, lang))); } };
  add(en ? 'Long-term picks:' : 'लंबी अवधि के चयन:', f.invest, 3);
  add(en ? 'Short-term setups:' : 'छोटी अवधि के मौक़े:', f.trade.filter((c) => c.action === 'BUY'), 2);
  add(en ? 'Reduce or avoid:' : 'घटाएँ या बचें:', f.avoid, 2);
  if (lines.length === 1) lines.push('', en ? 'No calls are available right now.' : 'अभी कोई राय उपलब्ध नहीं है।');
  lines.push('', en ? 'Open any stock in the app to see entry, target, stop-loss, the numbers behind the call and what could go wrong. This is research, not SEBI-registered advice, and you can lose money.' : 'किसी भी शेयर को ऐप में खोलकर एंट्री, लक्ष्य, स्टॉप-लॉस, राय के पीछे के आँकड़े और जोखिम देखें। यह रिसर्च है, सेबी-पंजीकृत सलाह नहीं, और आपका पैसा डूब सकता है।');
  return lines.join('\n');
}

async function handleCommand(chatId: string, cmd: string, arg: string): Promise<void> {
  const reply = (b: Bi, lang: Lang = 'en') => sendMessage(chatId, b[lang]);
  const userId = await userForChat(chatId);
  const lang: Lang = userId ? (await getProfile(userId)).language : 'en';
  switch (cmd) {
    case 'start': {
      const code = arg.trim();
      if (!code) { await reply(userId ? T.help : T.startNoCode, lang); return; }
      if (!bump(attempts, chatId, 60_000, START_ATTEMPTS_PER_MIN)) { await reply(T.slow, lang); return; }
      const uid = /^[A-Za-z0-9_-]{6,64}$/.test(code) ? await consumeLinkCode(code) : null;
      if (!uid) { await reply(T.badCode, lang); return; }
      await bindChat(uid, chatId);
      deps.log.info({ chat: maskChat(chatId) }, 'telegram chat linked');
      await reply(T.linked, (await getProfile(uid)).language);
      return;
    }
    case 'calls': case 'note': {
      if (!userId) { await reply(T.notLinked); return; }
      try {
        if (cmd === 'calls') await sendMessage(chatId, formatCalls(await getCallsFeed(lang), lang));
        else {
          const { getAnalystNote } = await import('../agent/analyst'); // lazy: analyst imports alerts, which imports this module
          const n = await getAnalystNote(lang);
          const parts = [n.headline, '', n.body, ...(n.watch.length ? ['', (lang === 'hi' ? 'आज किन बातों पर नज़र रखें:' : 'What to watch:'), ...n.watch.map((w) => '• ' + w)] : []), '', n.disclaimer || SEBI_LINE[lang]];
          await sendMessage(chatId, parts.join('\n'));
        }
      } catch { await reply(T.unavailable, lang); }
      return;
    }
    case 'stop': case 'unlink': {
      if (!userId) { await reply(T.notLinked); return; }
      await unlinkUser(userId); await reply(T.unlinked, lang); return;
    }
    default: await reply(T.help, lang);
  }
}

export interface TgUpdate { update_id: number; message?: { text?: string; chat?: { id: number | string; type?: string } } }
/** Handles one update. Group/channel chats and non-text messages are ignored. Never throws. */
export async function handleUpdate(u: TgUpdate): Promise<void> {
  try {
    const m = u.message; const chat = m?.chat;
    if (!m?.text || !chat || chat.type !== 'private') return;
    const chatId = String(chat.id);
    const c = m.text.trim().match(/^\/([A-Za-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
    if (!c) { await sendMessage(chatId, T.help[await (async () => { const u = await userForChat(chatId); return u ? (await getProfile(u)).language : 'en'; })()]); return; }
    await handleCommand(chatId, c[1].toLowerCase(), c[2] ?? '');
  } catch (e: any) { deps.log.warn({ err: scrub(String(e?.message ?? e)) }, 'telegram update failed'); }
}

/** One getUpdates round (long poll). Returns how many updates were handled. */
export async function pollOnce(timeoutSec = 25, signal?: AbortSignal): Promise<number> {
  const updates = await api<TgUpdate[]>('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message'] }, (timeoutSec + 15) * 1000, signal);
  for (const u of updates) { offset = Math.max(offset, u.update_id + 1); await handleUpdate(u); }
  return updates.length;
}

const sleepAbortable = (ms: number, signal: AbortSignal) => new Promise<void>((res) => { const t = setTimeout(res, ms); signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true }); });

/** Starts long polling when TELEGRAM_BOT_TOKEN is set, TELEGRAM_ENABLED is not false and the scheduler flag allows. */
export function startTelegramBot(log: BotLog = noLog, opts: { ignoreSchedulerFlag?: boolean } = {}): boolean {
  if (running) return true;
  if (!token() || !enabledFlag() || (!config.schedulerEnabled && !opts.ignoreSchedulerFlag)) return false;
  deps.log = log; running = true; abort = new AbortController();
  const signal = abort.signal;
  loop = (async () => {
    let backoff = 1000;
    try { await api('deleteWebhook', { drop_pending_updates: false }, 8000, signal); } catch { /* polling may still work */ }
    while (running) {
      try {
        if (!(await ensureMe())) throw new Error('getMe failed');
        await pollOnce(25, signal); backoff = 1000;
      } catch (e: any) {
        if (!running) break;
        const conflict = e instanceof TgError && e.code === 409; // another poller or a webhook owns this bot
        log.warn({ err: scrub(String(e?.message ?? e)), retryInMs: conflict ? 30_000 : backoff }, 'telegram polling error');
        await sleepAbortable(conflict ? 30_000 : backoff, signal); backoff = Math.min(backoff * 2, 60_000);
      }
    }
  })();
  log.info({ bot: 'telegram' }, 'telegram bot polling started');
  return true;
}
export async function stopTelegramBot(): Promise<void> {
  running = false; abort?.abort();
  try { await loop; } catch { /* ignore */ }
  loop = null; abort = null;
}
