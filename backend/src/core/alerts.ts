import { randomUUID } from 'node:crypto';
import type { Alert, Lang, PortfolioView } from '../../../shared/contract';
import { config } from '../config';
import { stmt } from '../db';
import { getDailyIdeas, getIpoFeed, getNews, getQuotes } from '../market/service';
import { guarded } from './health';
import { getPortfolioView, computeHealth, type HealthHolding } from './portfolio';
import { sendTelegramAlerts } from './telegramBot';
import { getProfile, getPushToken, listRecentlyActiveUserIds } from './users';

type Bi = { en: string; hi: string };
export interface AlertCandidate { dedupeKey: string; kind: Alert['kind']; severity: Alert['severity']; title: Bi; body: Bi }

/** Today's date in India (YYYY-MM-DD); dedupe keys roll over at IST midnight. */
export const istDate = (now = new Date()): string => new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const inr = (n: number) => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

// ---------- pure generators ----------
export function portfolioAlerts(view: PortfolioView, day: string): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  if (!view.holdings.length) return out;

  const items: HealthHolding[] = view.holdings.map((h) => ({ name: h.name, type: h.type, sector: h.sector, weight: h.value ?? h.invested, pnlPct: h.pnlPct }));
  const en = computeHealth(items, 'en');
  const hi = computeHealth(items, 'hi');
  const top = en.concentration.topHoldingPct;
  const sec = en.concentration.sectorWeights.find((s) => s.sector !== 'Mutual funds' && s.sector !== 'Other / unclassified');
  if (view.holdings.length > 1 && (top > 40 || (sec && sec.pct > 50))) {
    const important = top > 50 || (sec?.pct ?? 0) > 60;
    out.push({
      dedupeKey: `portfolio-conc:${day}`, kind: 'portfolio', severity: important ? 'important' : 'watch',
      title: { en: 'Your portfolio is concentrated', hi: 'आपका पोर्टफ़ोलियो कुछ ही जगह केंद्रित है' },
      body: { en: `${en.issues[0]?.detail ?? ''} ${en.issues[0]?.action ?? ''}`.trim(), hi: `${hi.issues[0]?.detail ?? ''} ${hi.issues[0]?.action ?? ''}`.trim() },
    });
  }

  const dayChange = view.totals.dayChange;
  const prevValue = view.totals.value - dayChange;
  if (dayChange !== 0 && prevValue > 0) {
    const pct = (dayChange / prevValue) * 100;
    if (Math.abs(pct) > 2) {
      const up = pct > 0;
      out.push({
        dedupeKey: `portfolio-move:${day}:${up ? 'up' : 'down'}`, kind: 'portfolio', severity: up ? 'info' : 'watch',
        title: { en: up ? `Your portfolio is up ${r1(pct)}% today` : `Your portfolio is down ${r1(-pct)}% today`, hi: up ? `आज आपका पोर्टफ़ोलियो ${r1(pct)}% ऊपर है` : `आज आपका पोर्टफ़ोलियो ${r1(-pct)}% नीचे है` },
        body: {
          en: `That is about ${inr(dayChange)} ${up ? 'higher' : 'lower'} than yesterday's close. One-day moves are normal; avoid deciding in a hurry.`,
          hi: `यह कल के बंद भाव से लगभग ${inr(dayChange)} ${up ? 'ज़्यादा' : 'कम'} है। एक दिन की चाल सामान्य है; जल्दबाज़ी में फ़ैसला न लें।`,
        },
      });
    }
  }
  return out;
}

export function marketDropAlert(niftyChangePct: number | null, day: string): AlertCandidate | null {
  if (niftyChangePct === null || !Number.isFinite(niftyChangePct) || niftyChangePct >= -1.5) return null;
  return {
    dedupeKey: `market-drop:${day}`, kind: 'market', severity: 'watch',
    title: { en: `Nifty is down ${r1(-niftyChangePct)}% today`, hi: `आज निफ़्टी ${r1(-niftyChangePct)}% नीचे है` },
    body: {
      en: 'Broad market falls happen from time to time. If you invest for the long term, a single down day rarely needs action. Check your plan, not the screen.',
      hi: 'बाज़ार में व्यापक गिरावट समय-समय पर आती है। लंबी अवधि के निवेशक के लिए एक गिरावट वाला दिन आम तौर पर कार्रवाई की माँग नहीं करता। स्क्रीन नहीं, अपनी योजना देखें।',
    },
  };
}

export function ipoClosingAlerts(items: { name: string; status: string; closeDate: string | null }[], now: Date): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const today = istDate(now);
  const tomorrow = istDate(new Date(now.getTime() + 24 * 3600 * 1000));
  for (const i of items) {
    if (i.status !== 'open' || !i.closeDate) continue;
    const d = i.closeDate.slice(0, 10);
    if (d !== today && d !== tomorrow) continue;
    const when = d === today;
    out.push({
      dedupeKey: `ipo-close:${i.name}:${d}`, kind: 'ipo', severity: 'info',
      title: { en: `${i.name} IPO closes ${when ? 'today' : 'tomorrow'}`, hi: `${i.name} आईपीओ ${when ? 'आज' : 'कल'} बंद हो रहा है` },
      body: {
        en: 'If you are considering it, read the prospectus and the checklist in the IPO section first. Applying is optional; there is no need to rush.',
        hi: 'अगर आप इसके बारे में सोच रहे हैं, तो पहले प्रॉस्पेक्टस और आईपीओ सेक्शन की जाँच-सूची पढ़ें। आवेदन वैकल्पिक है; जल्दबाज़ी की ज़रूरत नहीं।',
      },
    });
  }
  return out;
}

export function newsAlerts(items: { id: string; title: string; sentiment: string; affectedSymbols: string[]; explanation: string }[], held: Set<string>): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const n of items) {
    if (n.sentiment === 'neutral') continue;
    const hit = n.affectedSymbols.filter((s) => held.has(s));
    if (!hit.length) continue;
    const label = hit.map((s) => s.replace(/\.(NS|BO)$/, '')).join(', ');
    out.push({
      dedupeKey: `news:${n.id}`, kind: 'news', severity: n.sentiment === 'negative' ? 'watch' : 'info',
      title: { en: `News on ${label}: ${n.title}`, hi: `${label} पर ख़बर: ${n.title}` },
      body: { en: n.explanation || 'A news item mentions a company you hold. Read it before reacting.', hi: n.explanation || 'एक ख़बर में आपकी किसी कंपनी का ज़िक्र है। प्रतिक्रिया देने से पहले इसे पढ़ें।' },
    });
    if (out.length >= 3) break;
  }
  return out;
}

export function ideaAlert(items: { symbol: string; name: string; score: number }[], day: string): AlertCandidate | null {
  const top = items.filter((i) => i.score >= 65).slice(0, 2);
  if (!top.length) return null;
  const names = top.map((i) => i.name).join(', ');
  return {
    dedupeKey: `ideas:${day}`, kind: 'idea', severity: 'info',
    title: { en: 'New ideas to study today', hi: 'आज पढ़ने के लिए नए विचार' },
    body: {
      en: `${names} look favourable on today's rules-based checks. This is for learning, not a recommendation; open the analysis to see the reasons and risks.`,
      hi: `आज की नियम-आधारित जाँच में ${names} अनुकूल दिखते हैं। यह सीखने के लिए है, सिफ़ारिश नहीं; कारण और जोखिम देखने के लिए विश्लेषण खोलें।`,
    },
  };
}

// ---------- persistence ----------
interface AlertRow { id: string; kind: Alert['kind']; severity: Alert['severity']; title: string; body: string; created_at: string; read: number }
const parseBi = (s: string): Bi => { try { return JSON.parse(s); } catch { return { en: s, hi: s }; } };

/** Insert candidates, ignoring ones already stored for this user (dedupe). Returns the newly created. */
export function saveAlerts(userId: string, cands: AlertCandidate[]): AlertCandidate[] {
  const created: AlertCandidate[] = [];
  const ins = stmt('INSERT OR IGNORE INTO alerts(id,user_id,dedupe_key,kind,severity,title,body,created_at) VALUES (?,?,?,?,?,?,?,?)');
  for (const c of cands) {
    const r = ins.run(randomUUID(), userId, c.dedupeKey, c.kind, c.severity, JSON.stringify(c.title), JSON.stringify(c.body), new Date().toISOString());
    if (Number(r.changes) > 0) created.push(c);
  }
  return created;
}

export function listAlerts(userId: string, lang: Lang): Alert[] {
  const rows = stmt('SELECT id,kind,severity,title,body,created_at,read FROM alerts WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 60').all(userId) as unknown as AlertRow[];
  return rows.map((r) => ({ id: r.id, kind: r.kind, severity: r.severity, title: parseBi(r.title)[lang], body: parseBi(r.body)[lang], createdAt: r.created_at, read: !!r.read }));
}

export const unreadCount = (userId: string): number =>
  Number((stmt('SELECT COUNT(*) AS n FROM alerts WHERE user_id = ? AND read = 0').get(userId) as { n: number }).n);

export const markAlertRead = (userId: string, id: string): boolean =>
  Number(stmt('UPDATE alerts SET read = 1 WHERE id = ? AND user_id = ?').run(id, userId).changes) > 0;

// ---------- engine ----------
export async function generateCandidates(userId: string, now = new Date()): Promise<AlertCandidate[]> {
  const day = istDate(now);
  const lang = getProfile(userId).language;
  const cands: AlertCandidate[] = [];

  const view = await guarded('market', () => getPortfolioView(userId), null);
  if (view) cands.push(...portfolioAlerts(view, day));

  const nifty = await guarded('market', async () => (await getQuotes(['^NSEI']))['^NSEI'] ?? null, null);
  const drop = marketDropAlert(nifty ? nifty.changePct : null, day);
  if (drop) cands.push(drop);

  const ipos = await guarded('ipo', () => getIpoFeed(lang), null);
  if (ipos?.available) cands.push(...ipoClosingAlerts(ipos.items, now));

  const held = new Set((view?.holdings ?? []).filter((h) => h.symbol).map((h) => h.symbol!));
  if (held.size) {
    const news = await guarded('news', () => getNews(lang, 'stocks'), null);
    if (news) cands.push(...newsAlerts(news.items, held));
  }

  const ideas = await guarded('market', () => getDailyIdeas(lang), null);
  if (ideas) { const a = ideaAlert(ideas.favourable ?? [], day); if (a) cands.push(a); }
  return cands;
}

async function sendPush(token: string, title: string, body: string): Promise<boolean> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ to: token, title, body: body.slice(0, 200), sound: 'default' }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch { return false; }
}

/** Save candidates for one user and push the important ones. Used by the analyst agent's scheduled run. */
export async function deliverCandidates(userId: string, cands: AlertCandidate[]): Promise<number> {
  let created: AlertCandidate[] = [];
  try { created = saveAlerts(userId, cands); } catch { return 0; }
  await pushCreated(userId, created);
  return created.length;
}

export async function refreshAlerts(userId: string, now = new Date()): Promise<{ created: number }> {
  let created: AlertCandidate[] = [];
  try { created = saveAlerts(userId, await generateCandidates(userId, now)); } catch { /* never throw from refresh */ }
  await pushCreated(userId, created);
  return { created: created.length };
}

async function pushCreated(userId: string, created: AlertCandidate[]): Promise<void> {
  if (!created.length) return;
  const important = created.filter((x) => x.severity !== 'info').slice(0, 3);
  if (config.pushEnabled) {
    const token = getPushToken(userId);
    if (token && /^Expo(nent)?PushToken\[.+\]$/.test(token)) {
      const lang = getProfile(userId).language;
      for (const c of important) await sendPush(token, c.title[lang], c.body[lang]);
    }
  }
  await sendTelegramAlerts(userId, important); // no-op unless the bot is configured and this user linked a chat; never throws
}

let timer: NodeJS.Timeout | null = null;
export function startAlertScheduler(intervalMs = 15 * 60 * 1000): void {
  if (timer || !config.schedulerEnabled) return;
  let running = false;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const since = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
      for (const id of listRecentlyActiveUserIds(since)) await refreshAlerts(id);
    } catch { /* keep the loop alive */ } finally { running = false; }
  }, intervalMs);
  timer.unref();
}
export function stopAlertScheduler(): void { if (timer) clearInterval(timer); timer = null; }
