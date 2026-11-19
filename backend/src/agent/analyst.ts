// The daily analyst agent: gather (market, calls, news+social) -> write a veteran-style note -> flag changes -> alert users.
// Rules text always works. When an LLM is configured it may rewrite the note, but guardrails reject any number that is not in
// the evidence pack and any promotional phrase, and the token cap in ai/llm.ts bounds the cost. Never throws to the caller.
import type { AlertCandidate } from '../core/alerts';
import type { AnalystNote, CallAction, CallMode, CallsFeed, Lang, MarketOverview, NewsHub, StockCall } from '../../../shared/contract';
import { DISCLAIMER } from '../../../shared/contract';
import { getCallsFeed } from '../market/analysis/calls';
import { getNewsHub } from '../market/hub';
import { getMarketOverview } from '../market/overview';
import { llmCall, llmConfigured, textOf } from '../ai/llm';
import { AllowedNumbers, validateNarrative } from '../ai/guardrails';
import { parseJsonLoose } from '../ai/narrator';

export interface Deps { calls: (lang: Lang) => Promise<CallsFeed>; hub: (lang: Lang) => Promise<NewsHub>; overview: (lang: Lang) => Promise<MarketOverview> }
let deps: Deps = { calls: getCallsFeed, hub: getNewsHub, overview: getMarketOverview };
export const __setAnalystDeps = (d: Partial<Deps>) => { deps = { ...deps, ...d }; cache.clear(); };
/** Test helper: restore the real data sources and forget previous runs. */
export const __resetAnalyst = () => { deps = { calls: getCallsFeed, hub: getNewsHub, overview: getMarketOverview }; cache.clear(); inflight.clear(); lastActions = null; lastManualRun = 0; };

/** IST helpers (no DST in India). */
export const istParts = (now = new Date()) => { const d = new Date(now.getTime() + 5.5 * 3600_000); return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours(), minute: d.getUTCMinutes() }; };
export const sessionFor = (now = new Date()): AnalystNote['session'] => (() => { const h = istParts(now).hour; return h >= 5 && h < 13 ? 'pre-market' : 'post-market'; })();

const n0 = (n: number) => Math.round(n).toLocaleString('en-IN');
const n2 = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sgn = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`;
const ACTION_HI: Record<CallAction, string> = { BUY: 'ख़रीदें', ACCUMULATE: 'धीरे-धीरे ख़रीदें', HOLD: 'रखें', REDUCE: 'घटाएँ', SELL: 'बेचें' };
const label = (a: CallAction, lang: Lang) => (lang === 'hi' ? ACTION_HI[a] : a);
const SESSION: Record<AnalystNote['session'], Record<Lang, string>> = {
  'pre-market': { en: 'Before the open', hi: 'बाज़ार खुलने से पहले' }, 'post-market': { en: 'After the close', hi: 'बाज़ार बंद होने के बाद' },
};

/** Deterministic note written from real data only. */
export function rulesNote(o: MarketOverview | null, feed: CallsFeed | null, hub: NewsHub | null, lang: Lang, session: AnalystNote['session'], asOf: string): AnalystNote {
  const en = lang === 'en';
  const nifty = o?.india[0], sensex = o?.india[1];
  const parts: string[] = [];
  if (nifty) parts.push(en
    ? `${SESSION[session].en}: the Nifty 50 is at ${n2(nifty.price)} (${sgn(nifty.changePct ?? 0)})${sensex ? ` and the Sensex at ${n2(sensex.price)} (${sgn(sensex.changePct ?? 0)})` : ''}.`
    : `${SESSION[session].hi}: निफ़्टी 50 ${n2(nifty.price)} पर है (${sgn(nifty.changePct ?? 0)})${sensex ? ` और सेंसेक्स ${n2(sensex.price)} पर (${sgn(sensex.changePct ?? 0)})` : ''}।`);
  const inv = feed?.invest[0], avoid = feed?.avoid[0], star = feed?.risingStars[0], trade = feed?.trade[0];
  if (inv) parts.push(en ? `Our strongest long-term call is ${inv.name}: ${label(inv.action, lang)}, score ${inv.score} out of 100.` : `सबसे मज़बूत लंबी अवधि की राय ${inv.name} पर है: ${label(inv.action, lang)}, स्कोर 100 में से ${inv.score}।`);
  if (avoid) parts.push(en ? `On the cautious side, ${avoid.name} reads ${label(avoid.action, lang)} (score ${avoid.score}).` : `सावधानी की तरफ़, ${avoid.name} पर राय ${label(avoid.action, lang)} है (स्कोर ${avoid.score})।`);
  if (star) parts.push(en ? `${star.name} is a rising star near its 52-week high.` : `${star.name} अपने 52-हफ़्ते के शिखर के पास उभरता सितारा है।`);
  const flows = o?.flows;
  if (flows?.available && (flows.fii != null || flows.dii != null)) parts.push(en ? `Institutional flows: FII ${flows.fii != null ? n0(flows.fii) : 'n/a'} crore, DII ${flows.dii != null ? n0(flows.dii) : 'n/a'} crore.` : `संस्थागत प्रवाह: FII ${flows.fii != null ? n0(flows.fii) : 'उपलब्ध नहीं'} करोड़, DII ${flows.dii != null ? n0(flows.dii) : 'उपलब्ध नहीं'} करोड़।`);
  const buzz = hub?.buzz[0];
  if (buzz) parts.push(en ? `${buzz.name} is the most talked-about stock with ${buzz.mentions} mentions across news and social posts.` : `${buzz.name} ख़बरों और सोशल पोस्ट में ${buzz.mentions} ज़िक्र के साथ सबसे ज़्यादा चर्चा में है।`);
  if (!parts.length) parts.push(en ? 'Market data is not available right now, so there is no note yet.' : 'अभी बाज़ार का डेटा उपलब्ध नहीं है, इसलिए नोट नहीं बन पाया।');

  const watch: string[] = [];
  if (trade?.levels) watch.push(en ? `${trade.name}: illustrative entry ${n0(trade.levels.entryLow)} to ${n0(trade.levels.entryHigh)}, protective level ${n0(trade.levels.stopLoss)}.` : `${trade.name}: उदाहरण के लिए एंट्री ${n0(trade.levels.entryLow)} से ${n0(trade.levels.entryHigh)}, सुरक्षा स्तर ${n0(trade.levels.stopLoss)}।`);
  if (nifty?.fiftyTwoWeekHigh != null && nifty.price) watch.push(en ? `Nifty 50 52-week high is ${n0(nifty.fiftyTwoWeekHigh)}; it is at ${n0(nifty.price)} now.` : `निफ़्टी 50 का 52-हफ़्ते का शिखर ${n0(nifty.fiftyTwoWeekHigh)} है; अभी ${n0(nifty.price)} पर है।`);
  if (o?.mood.bullets[0]) watch.push(o.mood.bullets[0]);
  const headline = o?.mood.headline ? `${SESSION[session][lang]}: ${o.mood.headline}` : SESSION[session][lang];
  const top = (c: StockCall[], mode: CallMode, k: number) => c.slice(0, k).map((x) => ({ symbol: x.symbol, name: x.name, action: x.action, mode }));
  return {
    asOf, session, lang, headline, body: parts.join(' '), watch: watch.slice(0, 4),
    topCalls: [...top(feed?.invest ?? [], 'invest', 3), ...top(feed?.trade ?? [], 'trade', 2), ...top(feed?.avoid ?? [], 'invest', 1)],
    generatedBy: 'rules', disclaimer: DISCLAIMER[lang],
  };
}

/** Optional LLM rewrite in a 20-year-veteran voice. Falls back to the rules note on any failure or guardrail hit. */
export async function polish(base: AnalystNote): Promise<AnalystNote> {
  if (!llmConfigured()) return base;
  const pack = { headline: base.headline, body: base.body, watch: base.watch, topCalls: base.topCalls };
  const system = `You are a calm, plain-spoken Indian equity analyst with 20+ years of experience writing the ${base.session} note for retail investors, in ${base.lang === 'hi' ? 'simple natural Hindi (Devanagari)' : 'plain English'}.
Rewrite the draft so it reads like a thoughtful human wrote it: 3 to 5 sentences, no hype. Use ONLY facts and numbers present in the JSON draft; never add a number, price, forecast or promise. Never say guaranteed, sure-shot, risk-free, or tell the reader to buy or sell now.
Return ONLY JSON: {"headline": string, "body": string}`;
  const msg = await llmCall({ max_tokens: 700, system, messages: [{ role: 'user', content: JSON.stringify(pack) }] });
  if (!msg) return base;
  const j = parseJsonLoose(textOf(msg));
  if (!j || typeof j.headline !== 'string' || typeof j.body !== 'string') return base;
  const allowed = new AllowedNumbers().add(JSON.stringify(pack), base.asOf);
  if (!validateNarrative(j.headline, allowed).ok || !validateNarrative(j.body, allowed).ok) return base;
  return { ...base, headline: j.headline.trim(), body: j.body.trim(), generatedBy: 'llm' };
}

// ---------- change detection -> alerts ----------
type ActionMap = Map<string, CallAction>;
const flat = (f: CallsFeed): StockCall[] => [...f.invest, ...f.trade, ...f.risingStars, ...f.avoid];
export const actionMap = (f: CallsFeed): ActionMap => { const m: ActionMap = new Map(); for (const c of flat(f)) m.set(`${c.symbol}:${c.mode}`, c.action); return m; };

export function analystAlerts(feed: CallsFeed, prev: ActionMap | null, day: string): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const seen = new Set<string>();
  for (const c of flat(feed)) {
    const key = `${c.symbol}:${c.mode}`; if (seen.has(key)) continue; seen.add(key);
    const before = prev?.get(key);
    if (before && before !== c.action && (c.action === 'BUY' || c.action === 'SELL' || c.action === 'REDUCE')) {
      const bad = c.action !== 'BUY';
      out.push({
        dedupeKey: `call:${key}:${c.action}:${day}`, kind: 'idea', severity: bad ? 'important' : 'watch',
        title: { en: `${c.name}: call changed to ${c.action}`, hi: `${c.name}: राय बदलकर ${ACTION_HI[c.action]} हुई` },
        body: { en: `It was ${before}. Score is now ${c.score} out of 100. Open the call to see the numbers and risks. This is research, not advice.`, hi: `पहले राय ${ACTION_HI[before]} थी। अब स्कोर 100 में से ${c.score} है। आँकड़े और जोखिम देखने के लिए राय खोलें। यह रिसर्च है, सलाह नहीं।` },
      });
    }
  }
  const movers = flat(feed).filter((c) => c.changePct != null && Math.abs(c.changePct) >= 4).sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!));
  const ms = new Set<string>();
  for (const c of movers) {
    if (ms.has(c.symbol) || ms.size >= 3) continue; ms.add(c.symbol);
    out.push({
      dedupeKey: `mover:${c.symbol}:${day}`, kind: 'market', severity: 'watch',
      title: { en: `${c.name} moved ${sgn(c.changePct!)} today`, hi: `${c.name} आज ${sgn(c.changePct!)} चला` },
      body: { en: `Current call: ${c.action} (score ${c.score}). Big moves can reverse; check the reasons before acting.`, hi: `मौजूदा राय: ${ACTION_HI[c.action]} (स्कोर ${c.score})। बड़ी चाल पलट भी सकती है; कुछ करने से पहले कारण देखें।` },
    });
  }
  return out;
}

// ---------- run + cache ----------
const cache = new Map<Lang, { note: AnalystNote; at: number }>();
const inflight = new Map<Lang, Promise<AnalystNote>>();
let lastActions: ActionMap | null = null;
let lastManualRun = 0;
export const NOTE_TTL_MS = 3 * 3600_000;

export async function runAnalyst(lang: Lang, now = new Date()): Promise<AnalystNote> {
  const existing = inflight.get(lang); if (existing) return existing;
  const p = (async () => {
    const [o, feed, hub] = await Promise.all([deps.overview(lang).catch(() => null), deps.calls(lang).catch(() => null), deps.hub(lang).catch(() => null)]);
    const base = rulesNote(o, feed, hub, lang, sessionFor(now), now.toISOString());
    const note = await polish(base).catch(() => base);
    cache.set(lang, { note, at: Date.now() });
    return note;
  })().finally(() => inflight.delete(lang));
  inflight.set(lang, p);
  return p;
}

export async function getAnalystNote(lang: Lang): Promise<AnalystNote> {
  const c = cache.get(lang);
  if (c && Date.now() - c.at < NOTE_TTL_MS) return c.note;
  return runAnalyst(lang);
}

/** Manual trigger: at most one real run per 5 minutes per process (bounds LLM cost). */
export async function manualRun(lang: Lang): Promise<AnalystNote> {
  if (Date.now() - lastManualRun < 5 * 60_000) { const c = cache.get(lang); if (c) return c.note; }
  lastManualRun = Date.now();
  return runAnalyst(lang);
}

/** Scheduled run: refresh both languages, diff the calls against the previous run and alert recently active users. */
export async function scheduledRun(deliver: (c: (lang: Lang) => AlertCandidate[]) => Promise<void>, now = new Date()): Promise<{ alerts: number }> {
  const { day } = istParts(now);
  const feeds = await deps.calls('en').catch(() => null);
  await Promise.all([runAnalyst('en', now), runAnalyst('hi', now)]).catch(() => {});
  let alerts = 0;
  if (feeds) {
    const cands = analystAlerts(feeds, lastActions, day);
    alerts = cands.length;
    const hiFeed = await deps.calls('hi').catch(() => feeds);
    const hiCands = analystAlerts(hiFeed, lastActions, day);
    lastActions = actionMap(feeds);
    if (cands.length) await deliver((lang) => (lang === 'hi' ? hiCands : cands));
  }
  return { alerts };
}

let timer: NodeJS.Timeout | null = null;
const done = new Set<string>();
export function startAnalystScheduler(deliver: (c: (lang: Lang) => AlertCandidate[]) => Promise<void>, enabled: boolean): void {
  if (timer || !enabled) return;
  let running = false;
  timer = setInterval(async () => {
    if (running) return;
    const { day, hour, minute } = istParts();
    const t = hour * 60 + minute;
    const slot = t >= 8 * 60 + 45 && t < 9 * 60 + 30 ? 'pre' : t >= 16 * 60 && t < 16 * 60 + 45 ? 'post' : null;
    if (!slot || done.has(`${day}:${slot}`)) return;
    running = true; done.add(`${day}:${slot}`);
    try { await scheduledRun(deliver); } catch { /* keep the loop alive */ } finally { running = false; }
  }, 60_000);
  timer.unref();
}
export const stopAnalystScheduler = () => { if (timer) clearInterval(timer); timer = null; };
