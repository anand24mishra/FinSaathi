// Source of truth for the HTTP API between backend (Fastify, port 4000) and mobile (Expo).
// Backend imports this directly. Mobile copies it to mobile/src/api/contract.ts via mobile/scripts/sync-contract.sh.
// Rule: every number the user sees comes from a Sourced record. Nothing is invented.

export type Lang = 'en' | 'hi';
export type ISO = string; // ISO-8601 timestamp

export interface Sourced {
  asOf: ISO;
  source: string;                 // e.g. "Yahoo Finance (unofficial)", "AMFI via mfapi.in"
  delayMinutes?: number | null;   // known delay, null = unknown
}

export interface ApiError { error: { code: string; message: string; retryable: boolean } }

export const DISCLAIMER: Record<Lang, string> = {
  en: 'Educational research, not investment advice. We are not a SEBI-registered Investment Adviser or Research Analyst. Markets carry risk; you can lose money. Talk to a registered adviser before investing.',
  hi: 'यह केवल शैक्षिक जानकारी है, निवेश सलाह नहीं। हम सेबी-पंजीकृत निवेश सलाहकार या रिसर्च एनालिस्ट नहीं हैं। बाज़ार में जोखिम होता है, आपका पैसा डूब सकता है। निवेश से पहले पंजीकृत सलाहकार से बात करें।',
};

// ---------- Auth & profile ----------
export type RiskLevel = 'conservative' | 'balanced' | 'growth';
export type Experience = 'beginner' | 'some' | 'experienced';
export type Goal = 'retirement' | 'child_education' | 'house' | 'emergency' | 'wealth' | 'regular_income';

export interface Profile {
  language: Lang;
  textScale: 1 | 1.15 | 1.3;            // senior-friendly text size
  theme: 'system' | 'light' | 'dark';
  riskLevel: RiskLevel;
  experience: Experience;
  capital: number | null;               // rupees available to invest now
  monthlyBudget: number | null;         // rupees per month for SIP
  horizonYears: number;                 // default 5
  goals: Goal[];
  onboarded: boolean;
}
export interface User { id: string; name: string; email: string; profile: Profile; createdAt: ISO }
export interface AuthResponse { token: string; user: User }
// POST /v1/auth/register {name,email,password,language?}  -> AuthResponse
// POST /v1/auth/login    {email,password}                 -> AuthResponse
// POST /v1/auth/guest    {language?}                      -> AuthResponse   (instant start: no form; account has profile.onboarded=true and balanced defaults)
// POST /v1/me/claim {name,email,password} -> User   (turns a guest account into a saved account; keeps data)
// GET  /v1/me -> User ; PUT /v1/me/profile Partial<Profile> -> User
// POST /v1/me/push-token {token, platform:'ios'|'android'|'web'} -> {ok:true}
// All other routes require header Authorization: Bearer <token>, except /v1/health and /v1/education/*.

// ---------- Market ----------
export interface Quote extends Sourced {
  symbol: string;                 // e.g. "RELIANCE.NS", "^NSEI", "USDINR=X"
  name: string;
  price: number;
  change: number;
  changePct: number;
  currency: 'INR' | 'USD' | 'JPY' | 'HKD'; // additive: Nikkei/Hang Seng quote in JPY/HKD
  prevClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketState: 'open' | 'closed' | 'unknown';
}
export interface SeriesPoint { t: number; c: number }   // epoch ms, close
export interface Series extends Sourced { symbol: string; range: Range; points: SeriesPoint[] }
export type Range = '1mo' | '3mo' | '6mo' | '1y' | '5y';
// GET /v1/market/series?symbol=<whitelisted>&range=1y -> Series

export interface MarketOverview {
  asOf: ISO;
  india: Quote[];          // Nifty 50, Sensex, Bank Nifty
  global: Quote[];         // Nasdaq, S&P 500, Dow, Nikkei/Hang Seng if available
  commodities: Quote[];    // Gold, Silver, Brent crude (USD) — currency as returned
  fx: Quote | null;        // USD/INR
  mood: { key: 'calm' | 'positive' | 'weak' | 'volatile'; headline: string; bullets: string[] }; // localised
  flows: { available: boolean; note: string; fii?: number | null; dii?: number | null; asOf?: ISO }; // FII/DII only if a real source works
  rates: { available: boolean; note: string };
  unavailable: string[];   // symbols that failed, shown honestly in UI
}
// GET /v1/market/overview?lang=en|hi -> MarketOverview

// ---------- Stocks ----------
export interface Indicators {
  rsi14: number | null; sma50: number | null; sma200: number | null; ema20: number | null;
  macd: { macd: number; signal: number; hist: number } | null;
  atr14: number | null; volatilityAnnualPct: number | null; maxDrawdown1yPct: number | null;
  support: number | null; resistance: number | null;
  trend: 'up' | 'down' | 'sideways';
}
export interface Fundamentals extends Sourced {
  marketCapCr: number | null; pe: number | null; pb: number | null; roePct: number | null;
  debtToEquity: number | null; dividendYieldPct: number | null; epsTtm: number | null;
  revenueGrowthPct: number | null; profitMarginPct: number | null; sector: string | null; industry: string | null;
}
export interface StockListItem { symbol: string; name: string; sector: string | null; quote: Quote | null }
export interface StockDetail {
  quote: Quote; series: Series; indicators: Indicators;
  fundamentals: Fundamentals | null; fundamentalsNote: string | null; // honest note when unavailable
  performance: { '1m': number | null; '3m': number | null; '6m': number | null; '1y': number | null }; // % from real series
  sector: string | null;
}
// GET /v1/stocks?query=  -> StockListItem[]   (Nifty 50 universe + search within it)
// GET /v1/stocks/:symbol -> StockDetail

export type Stance = 'favourable' | 'neutral' | 'cautious';
export interface Evidence { label: string; value: string; direction: 'positive' | 'negative' | 'neutral'; detail: string; source: string; asOf: ISO }
export interface Analysis {
  symbol: string; name: string; asOf: ISO;
  stance: Stance;                       // shown as "Looks favourable / Neutral / Be cautious" — never "BUY"
  score: number;                        // 0-100 from deterministic model
  confidence: 'low' | 'medium' | 'high';
  horizon: { label: string; months: number };
  thesis: string;                       // localised, plain language
  levels: { entryLow: number; entryHigh: number; targetLow: number; targetHigh: number; stopLoss: number; basis: string } | null; // illustrative technical levels (ATR/support/resistance), basis explains
  evidence: Evidence[];
  risks: string[];
  uncertainty: string;
  sources: { name: string; url?: string; asOf: ISO }[];
  generatedBy: 'rules' | 'llm';
  disclaimer: string;
}
// GET /v1/stocks/:symbol/analysis?lang= -> Analysis

export interface IdeaItem { symbol: string; name: string; stance: Stance; score: number; oneLiner: string; price: number; changePct: number; reasons: string[] }
export interface DailyIdeas { asOf: ISO; universe: string; favourable: IdeaItem[]; cautious: IdeaItem[]; methodology: string; disclaimer: string }
// GET /v1/ideas/daily?lang= -> DailyIdeas

// ---------- Planner ----------
export interface PlanRequest { capital: number; monthlySip?: number; riskLevel: RiskLevel; horizonYears: number; goal: Goal }
export interface PlanLine {
  assetClass: 'equity' | 'debt' | 'gold' | 'silver' | 'liquid' | 'international';
  pct: number; amount: number; why: string;
}
export interface PlanInstrument {
  name: string; kind: 'index-etf' | 'index-fund' | 'gold-etf' | 'silver-etf' | 'fd' | 'liquid-fund' | 'debt-fund' | 'ppf-nps';
  symbol?: string; schemeCode?: number; pct: number; amount: number; why: string;
  price?: Quote | null; pastReturn?: { years: number; cagrPct: number; source: string; asOf: ISO } | null; // real history only
}
export interface Plan {
  asOf: ISO; request: PlanRequest; allocation: PlanLine[]; instruments: PlanInstrument[];
  sip: { monthly: number; note: string } | null;
  emergencyFundNote: string; rebalanceRule: string; risks: string[]; stepsToStart: string[]; disclaimer: string;
}
// POST /v1/planner PlanRequest -> Plan

// ---------- IPO ----------
export interface IpoCheck { label: string; status: 'ok' | 'warn' | 'unknown'; detail: string }
export interface IpoItem {
  name: string; status: 'upcoming' | 'open' | 'closed' | 'listed';
  openDate: string | null; closeDate: string | null; listingDate: string | null;
  priceBand: string | null; lotSize: number | null; issueSizeCr: number | null; exchange: string | null;
  subscription: { total: number | null; retail: number | null; qib: number | null; nii: number | null } | null;
  listingGainPct: number | null; checks: IpoCheck[]; summary: string;
}
export interface IpoGuide { asOf: string; lang: Lang; note: string; sections: { id: string; title: string; steps: string[]; tip?: string }[] }
// GET /v1/ipos/guide?lang= -> IpoGuide
export interface IpoFeed extends Sourced {
  available: boolean; note: string; items: IpoItem[];
  gmpNote: string; // explains why grey-market premium is not shown as advice
  checklist: { title: string; body: string }[]; // how to evaluate any IPO — always present
}
// GET /v1/ipos?lang= -> IpoFeed

// ---------- News ----------
export interface NewsItem {
  id: string; title: string; source: string; url: string; publishedAt: ISO; lang: Lang;
  sentiment: 'positive' | 'neutral' | 'negative'; sentimentMethod: string;
  explanation: string; affectedSymbols: string[]; impact: string | null;
  channel?: NewsChannelId;        // which News channel it belongs to
  summary?: string;               // short description from the publisher feed (HTML stripped)
  body?: string;                  // full text when the item is readable in the app itself (url may then be '')
}
export type NewsChannelId = 'all' | 'markets' | 'stocks' | 'economy' | 'ipo' | 'funds' | 'gold';
export interface NewsFeed { asOf: ISO; lang: Lang; items: NewsItem[]; source: string }
// GET /v1/news?lang=&topic=market|economy|stocks|ipo|gold|funds -> NewsFeed
// GET /v1/news/channel?lang=&id=all|markets|stocks|economy|ipo|funds|gold -> NewsFeed  (every source merged; nothing opens another app)

// ---------- Funds & beyond stocks ----------
export interface FundSummary { schemeCode: number; name: string }
export interface FundDetail extends Sourced {
  schemeCode: number; name: string; house: string | null; category: string | null;
  nav: number; navDate: string; returns: { '1y': number | null; '3y': number | null; '5y': number | null }; // annualised %, computed from NAV history
  series: SeriesPoint[];
}
export interface SipSimulation extends Sourced {
  schemeCode: number; monthly: number; years: number; invested: number; currentValue: number; absoluteReturnPct: number; xirrPct: number | null;
  note: string; // "historical, not a forecast"
}
// GET /v1/funds/search?q= -> FundSummary[]
// GET /v1/funds/:schemeCode -> FundDetail
// POST /v1/funds/sip-sim {schemeCode, monthly, years} -> SipSimulation

export interface AlternativeCard {
  id: 'gold' | 'silver' | 'fd' | 'bonds' | 'etf' | 'mutual-fund' | 'ppf' | 'nps' | 'sgb';
  title: string; simple: string; goodFor: string; watchOut: string; liquidity: string; typicalRisk: 'low' | 'medium' | 'high';
  quote?: Quote | null;   // real quote where available (gold/silver ETF)
}
// GET /v1/alternatives?lang= -> { asOf: ISO; cards: AlternativeCard[]; disclaimer: string }

// ---------- Portfolio ----------
export interface HoldingInput { type: 'stock' | 'fund'; symbol?: string; schemeCode?: number; quantity: number; avgPrice: number; buyDate?: string }
export interface Holding {
  id: string; type: 'stock' | 'fund'; symbol: string | null; schemeCode: number | null; name: string;
  quantity: number; avgPrice: number; lastPrice: number | null; invested: number; value: number | null;
  pnl: number | null; pnlPct: number | null; dayChange: number | null; sector: string | null; priceAsOf: ISO | null;
}
export interface PortfolioView {
  asOf: ISO; holdings: Holding[];
  totals: { invested: number; value: number; pnl: number; pnlPct: number; dayChange: number };
}
export interface HealthIssue { severity: 'info' | 'watch' | 'important'; title: string; detail: string; action: string }
export interface PortfolioHealth {
  asOf: ISO; score: number; label: string;                   // 0-100 + plain label
  concentration: { topHoldingPct: number; top3Pct: number; hhi: number; sectorWeights: { sector: string; pct: number }[] };
  issues: HealthIssue[]; suggestions: string[]; empty: boolean; disclaimer: string;
}
// GET /v1/portfolio -> PortfolioView ; POST /v1/portfolio/holdings HoldingInput -> Holding ; DELETE /v1/portfolio/holdings/:id -> {ok:true}
// GET /v1/portfolio/health?lang= -> PortfolioHealth

// ---------- Assistant ----------
export type ReplyStyle = 'hi' | 'hinglish' | 'en';
export interface ChatRequest { message: string; lang: Lang; history?: { role: 'user' | 'assistant'; text: string }[]; style?: ReplyStyle; conversationId?: string }
export interface Citation { label: string; ref: string; asOf: ISO | null }
export interface ChatResponse {
  answer: string; citations: Citation[]; toolsUsed: string[]; refused: boolean; followUps: string[];
  generatedBy: 'rules' | 'llm'; disclaimer: string;
  style?: ReplyStyle; conversationId?: string; transcript?: string;
}
export interface ChatMessage {
  id: string; role: 'user' | 'assistant'; text: string; at: string; style?: ReplyStyle; viaVoice?: boolean;
  citations?: Citation[]; followUps?: string[]; refused?: boolean; disclaimer?: string;
}
export interface ConversationSummary { id: string; title: string; updatedAt: string; preview: string }
export interface Conversation { id: string; title: string; createdAt: string; updatedAt: string; messages: ChatMessage[] }
// GET /v1/assistant/conversations -> ConversationSummary[]; GET/PATCH/DELETE /v1/assistant/conversations/:id
// POST /v1/assistant/voice { audio: base64, mimeType, conversationId? } -> ChatResponse (with transcript)
// POST /v1/assistant/chat ChatRequest -> ChatResponse
// Behaviour: answers ONLY from data fetched by internal tools (quotes, analysis, portfolio, education, news). If data missing: say so. Refuses "guaranteed returns"/insider/tip-style requests.

// ---------- Education ----------
export interface Term { id: string; category: string; term: { en: string; hi: string }; simple: { en: string; hi: string }; example: { en: string; hi: string } }
// GET /v1/education/terms?q=&category= -> Term[]  (public; both languages always returned)
// GET /v1/education/terms/:id -> Term

// ---------- Alerts ----------
export interface Alert { id: string; kind: 'portfolio' | 'market' | 'ipo' | 'news' | 'idea'; severity: 'info' | 'watch' | 'important'; title: string; body: string; createdAt: ISO; read: boolean }
// GET /v1/alerts?lang= -> Alert[] ; POST /v1/alerts/refresh?lang= -> Alert[] ; POST /v1/alerts/:id/read -> {ok:true}

// ---------- Briefing ----------
export interface BriefingSection { id: 'happened' | 'why' | 'watch' | 'money' | 'learn'; title: string; body: string; bullets: string[] }
export interface Briefing { date: string; greeting: string; sections: BriefingSection[]; speechText: string; asOf: ISO; sources: string[]; disclaimer: string }
// GET /v1/briefing/daily?lang= -> Briefing

// ---------- Health ----------
export interface HealthStatus {
  ok: boolean; time: ISO; uptimeSec: number;
  services: Record<string, { ok: boolean; detail?: string; checkedAt?: ISO }>;
  llm: 'configured' | 'not-configured';
}
// GET /v1/health -> HealthStatus (public)

// ---------- Calls (explicit research calls: invest + trade) ----------
export type CallAction = 'BUY' | 'ACCUMULATE' | 'HOLD' | 'REDUCE' | 'SELL';
export type CallMode = 'invest' | 'trade';
export interface PersonaScore {
  key: 'buffett' | 'jhunjhunwala' | 'technical' | 'sentiment';
  label: string;                         // localised, e.g. "Buffett lens: quality & value"
  score: number | null;                  // 0-100, null when the needed data is missing (never invent)
  summary: string;                       // localised one-liner with the numbers that drove the score
}
export interface StockCall {
  symbol: string; name: string; sector: string | null;
  mode: CallMode; action: CallAction; conviction: 'low' | 'medium' | 'high';
  score: number;                         // 0-100 composite for this mode
  price: number; changePct: number | null;
  horizon: { label: string; months: number };
  levels: { entryLow: number; entryHigh: number; targetLow: number; targetHigh: number; stopLoss: number; basis: string } | null;
  personas: PersonaScore[];
  bull: string[]; bear: string[];        // the two sides of the debate, each point backed by a number from evidence
  evidence: Evidence[]; risks: string[];
  asOf: ISO; sources: { name: string; url?: string; asOf: ISO }[];
  generatedBy: 'rules' | 'llm';
  disclaimer: string;
}
export interface CallsFeed {
  asOf: ISO; universe: string;
  invest: StockCall[];                   // best long-term calls first (BUY/ACCUMULATE)
  trade: StockCall[];                    // swing-trade calls (BUY/SELL with tight levels)
  risingStars: StockCall[];              // momentum + volume + near 52-week high, beyond the Nifty 50 top names
  avoid: StockCall[];                    // REDUCE/SELL calls
  methodology: string; disclaimer: string;
  notes: string[];                       // honest caveats, e.g. "Fundamentals unavailable for 3 names"
}
// GET /v1/calls?lang= -> CallsFeed ; GET /v1/calls/:symbol?mode=invest|trade&lang= -> StockCall

// ---------- News hub (news + Reddit + X) ----------
export type NewsOrigin = 'news' | 'reddit' | 'x' | 'telegram';
export interface SocialPost { id: string; origin: NewsOrigin; title: string; url: string; author: string | null; community: string | null; publishedAt: ISO; engagement: number | null; sentiment: 'positive' | 'neutral' | 'negative'; affectedSymbols: string[] }
export interface SourceStatus { id: string; name: string; origin: NewsOrigin; status: 'live' | 'unavailable' | 'not_configured'; count: number; detail: string }
export interface BuzzItem { symbol: string; name: string; mentions: number; sentimentScore: number; /* -100..100 from the keyword/LLM sentiment of mentions */ topHeadline: string | null }
export interface NewsHub {
  asOf: ISO; lang: Lang;
  news: NewsItem[];                      // merged finance RSS + Google News, deduped, newest first
  social: SocialPost[];                  // Reddit + X posts (X only when X_BEARER_TOKEN is set)
  buzz: BuzzItem[];                      // most-mentioned Nifty names across news + social
  sources: SourceStatus[];
}
// GET /v1/news/hub?lang= -> NewsHub

// ---------- Analyst agent ----------
export interface AnalystNote {
  asOf: ISO; session: 'pre-market' | 'post-market'; lang: Lang;
  headline: string; body: string;        // veteran-analyst voice, every number traceable to evidence
  topCalls: { symbol: string; name: string; action: CallAction; mode: CallMode }[];
  watch: string[];                       // what to watch today
  generatedBy: 'rules' | 'llm'; disclaimer: string;
}
// GET /v1/agent/note?lang= -> AnalystNote ; POST /v1/agent/run (manual trigger) -> AnalystNote

// ---------- Full Indian market: universe, movers, live quotes ----------
export interface MarketMover {
  symbol: string; name: string; price: number; changePct: number; volume: number | null;
  yearHigh: number | null; yearLow: number | null; nearHighPct: number | null; nearLowPct: number | null;  // % below the 52-week high / above the 52-week low
  change30dPct: number | null; change365dPct: number | null;
}
export interface MoversFeed {
  asOf: ISO; source: string; delayNote: string;           // honest about how fresh the data is
  universe: string; count: number;                          // e.g. "NIFTY TOTAL MARKET (750 stocks)"
  gainers: MarketMover[]; losers: MarketMover[]; volumeSpikes: MarketMover[]; nearHigh: MarketMover[]; nearLow: MarketMover[];
}
// GET /v1/market/movers -> MoversFeed   (whole-market screen: top gainers/losers, volume leaders, near 52-week high/low)
// GET /v1/stocks?query=  now searches EVERY NSE-listed equity (~2,000+); with no query it still returns the Nifty 50 list.
// Any NSE-listed symbol (SYMBOL.NS) works with /stocks/:symbol, /market/series, /stocks/:symbol/analysis and /calls/:symbol.

/** Live quotes over WebSocket:  ws(s)://<host>/v1/ws?token=<jwt>  */
export type LiveClientMsg = { type: 'subscribe'; symbols: string[] } | { type: 'unsubscribe'; symbols: string[] } | { type: 'ping' };
export type LiveServerMsg =
  | { type: 'hello'; source: string; intervalSec: number; delayNote: string; max: number }
  | { type: 'quote'; quote: Quote }
  | { type: 'error'; message: string }
  | { type: 'pong' };

// ---------- Telegram ----------
export interface TelegramStatus {
  configured: boolean;                  // server has TELEGRAM_BOT_TOKEN
  linked: boolean;                      // this account is connected to a Telegram chat
  botUsername: string | null;
  linkUrl: string | null;               // https://t.me/<bot>?start=<code>, valid ~15 minutes, only after POST /me/telegram/link
  detail: string;
}
// GET /v1/me/telegram -> TelegramStatus ; POST /v1/me/telegram/link -> TelegramStatus (with linkUrl) ; DELETE /v1/me/telegram -> TelegramStatus
