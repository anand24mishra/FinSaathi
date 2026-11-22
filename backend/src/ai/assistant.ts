// FinSaathi assistant: NOT a generic chatbot. An intent router over our own tools (quotes, analysis, portfolio, news, IPO,
// education). Every answer is composed from tool output with citations; missing data is stated plainly. Works fully
// without an LLM key ('rules'); with a key, an LLM may phrase the answer via tool-calling under the same guardrails.
import type { CallAction, ChatRequest, ChatResponse, Citation, Lang, StockCall } from '../../../shared/contract';
import { DISCLAIMER } from '../../../shared/contract';
import { NIFTY50, type RefStock } from '../market/reference/nifty50';
import { asciiDigits, inr, lakhCrore, spct } from '../market/format';
import { STANCE_LABEL } from '../market/analysis/text';
import { getQuote, getAnalysis, getFundamentals } from '../market/data';
import { getCallsFeed, getStockCall } from '../market/analysis/calls';
import { getMarketOverview } from '../market/overview';
import { getNews } from '../market/news';
import { getIpoFeed } from '../market/ipo';
import { getAlternatives } from '../market/alternatives';
import { getProfile } from '../core/users';
import { getPortfolioView, getPortfolioHealth } from '../core/portfolio';
import { searchTerms } from '../core/education';
import { llmConfigured, llmCall, textOf } from './llm';
import { AllowedNumbers, validateNarrative } from './guardrails';
import type { Term } from '../../../shared/contract';

const nukta = (s: string) => s.replace(/़/g, '');
export const norm = (s: string) => nukta(asciiDigits(s)).toLowerCase().replace(/[“”"'`’]/g, '').replace(/\s+/g, ' ').trim();

// ---------- stock name resolution ----------
/** "Reliance", "tcs", "HDFC bank", "रिलायंस", "ज़ोमैटो" -> RefStock (longest match wins). */
export function resolveStock(text: string): RefStock | null {
  const t = norm(text); let best: { s: RefStock; len: number } | null = null;
  for (const s of NIFTY50) {
    const cands: { v: string; hi: boolean }[] = [
      { v: s.name.toLowerCase().replace(/[().,]/g, ''), hi: false }, { v: s.symbol.replace('.NS', '').toLowerCase(), hi: false },
      ...s.alias.map((a) => ({ v: a, hi: false })), ...s.hi.map((h) => ({ v: nukta(h).toLowerCase(), hi: true })),
    ];
    for (const c of cands) {
      if (c.v.length < 2) continue;
      const hit = c.hi ? t.includes(c.v) : new RegExp(`(^|[^a-z0-9])${c.v.replace(/[.*+?^${}()|[\]\\&-]/g, '\\$&')}($|[^a-z0-9])`).test(t);
      if (hit && (!best || c.v.length > best.len)) best = { s, len: c.v.length };
    }
  }
  return best?.s ?? null;
}

// ---------- refusals ----------
export type RefusalKind = 'guaranteed' | 'insider' | 'double' | 'pump' | 'certainty';
const R: [RefusalKind, RegExp][] = [
  ['pump', /\bpump\b|pump[\s-]?and[\s-]?dump|telegram|whatsapp (group|tip)|operator|upper circuit (tomorrow|kal)|पंप|टेलीग्राम|व्हाट्सएप ग्रुप|ऑपरेटर|कल अपर सर्किट/],
  ['insider', /insider|inside (info|news|tip)|leak(ed)?|non[\s-]?public|advance (info|news)|इनसाइडर|अंदर की (ख़बर|खबर|जानकारी)|लीक/],
  ['double', /(double|triple|10x|2x|3x|multiply)\s+(my|your|the)?\s*(money|investment|savings)|which\s+(stock|share)s?.{0,40}(double|triple|10x|multibagger|rocket|moon|jackpot)|multi[\s-]?bagger|get rich quick|quick money|दोगुना|तिगुना|मल्टीबैगर|जल्दी अमीर|रातों[\s-]?रात|कौन सा शेयर.{0,30}(रॉकेट|जैकपॉट)|पैसा डबल|डबल (हो|कर)/],
  ['guaranteed', /guarantee|assured (return|profit)|sure[\s-]?shot|risk[\s-]?free|no[\s-]?risk|100\s?%\s*(safe|profit|return|sure)|fixed return.{0,20}(share|stock|equity)|गारंटी|पक्का (मुनाफ|रिटर्न|फायदा)|बिना (जोखिम|रिस्क)|रिस्क फ्री|सौ प्रतिशत/],
  ['certainty', /(tell|say|be) (me )?(for )?sure|definitely|without (any )?doubt|\bcertain(ly)?\b|will (the )?(nifty|sensex|market|it|stock|share|price).{0,30}(go up|rise|fall|crash|double|hit)|(tomorrow|next week).{0,40}(go up|rise|fall|crash)|(nifty|sensex|market).{0,20}(tomorrow|kal)|पक्का बताओ|निश्चित (रूप से )?बताओ|कल (बढ़ेगा|गिरेगा|क्या होगा)|कल .{0,20}(बढ़ेगा|गिरेगा)|ज़रूर (बढ़ेगा|गिरेगा)/],
];
export function detectRefusal(text: string): RefusalKind | null {
  const t = norm(text);
  for (const [k, re] of R) if (re.test(t)) return k;
  return null;
}
const REFUSAL_TXT: Record<RefusalKind, Record<Lang, string>> = {
  guaranteed: { en: 'I cannot promise or point you to guaranteed returns, because none exist in investing. Anyone offering guaranteed or risk-free profits from shares is a red flag; SEBI repeatedly warns about this. What I can do instead: explain how risk and return are linked, show how a monthly SIP actually performed on real past data, or compare safe options like deposits with market-linked ones.',
    hi: 'मैं गारंटीशुदा रिटर्न का वादा नहीं कर सकता और न ही कोई ऐसा विकल्प बता सकता हूँ, क्योंकि निवेश में गारंटी जैसी कोई चीज़ नहीं होती। जो भी शेयरों से पक्के या बिना जोखिम के मुनाफ़े का दावा करे, वह ख़तरे की घंटी है; सेबी भी इस बारे में बार-बार चेताता है। इसके बदले मैं बता सकता हूँ कि जोखिम और रिटर्न कैसे जुड़े हैं, असली पुराने आँकड़ों पर SIP का प्रदर्शन दिखा सकता हूँ, या FD जैसे सुरक्षित और बाज़ार से जुड़े विकल्पों की तुलना कर सकता हूँ।' },
  insider: { en: 'I cannot share or help with tips based on inside or leaked information. Trading on non-public information is illegal (insider trading) and tips like this are often scams. I can show you the public data on any stock: price trend, company numbers and risks, so you can decide with facts.',
    hi: 'मैं अंदर की या लीक हुई जानकारी पर आधारित टिप नहीं दे सकता। गैर-सार्वजनिक जानकारी पर ख़रीद-बिक्री ग़ैरक़ानूनी है (इनसाइडर ट्रेडिंग) और ऐसी टिप अक्सर धोखाधड़ी होती है। मैं किसी भी शेयर का सार्वजनिक डेटा दिखा सकता हूँ: भाव का रुझान, कंपनी के आँकड़े और जोखिम, ताकि आप तथ्यों के आधार पर फ़ैसला लें।' },
  double: { en: 'No one can tell which stock will double, and anyone who claims to know is guessing or selling something. High-promise "multibagger" talk is how many people lose money. What I can do: show how a stock is behaving on real data (trend, risk, company numbers), and explain how to spread risk across several investments.',
    hi: 'कोई नहीं बता सकता कि कौन-सा शेयर दोगुना होगा; जो दावा करे वह अंदाज़ा लगा रहा है या कुछ बेच रहा है। "मल्टीबैगर" जैसे बड़े वादों में ही बहुत लोग पैसा गँवाते हैं। मैं असली आँकड़ों पर किसी शेयर की चाल (रुझान, जोखिम, कंपनी के आँकड़े) दिखा सकता हूँ और बता सकता हूँ कि जोखिम को कई निवेशों में कैसे बाँटें।' },
  pump: { en: 'I cannot help with operator calls, pump-and-dump groups or "upper circuit tomorrow" tips. These are a common fraud route: promoters push a price up, then sell to people who join late. If a Telegram or WhatsApp group promises quick gains, please stay away. I can show you how to check a stock\'s real data instead, or explain how to spot such schemes.',
    hi: 'मैं ऑपरेटर कॉल, पंप-एंड-डंप ग्रुप या "कल अपर सर्किट" जैसी टिप में मदद नहीं कर सकता। यह धोखाधड़ी का आम तरीक़ा है: भाव चढ़ाकर देर से जुड़ने वालों को बेच दिया जाता है। अगर टेलीग्राम या व्हाट्सएप ग्रुप जल्दी मुनाफ़े का वादा करे तो दूर रहें। मैं इसके बदले किसी शेयर का असली डेटा जाँचना या ऐसी चालों को पहचानना समझा सकता हूँ।' },
  certainty: { en: 'I cannot know what the market or any stock will do tomorrow, and neither can anyone else, so I will not give a sure answer. What I can do: show the latest data, explain what the trend and risks look like today, and what to keep an eye on.',
    hi: 'कल बाज़ार या कोई शेयर क्या करेगा, यह न मैं जान सकता हूँ न कोई और, इसलिए मैं पक्का जवाब नहीं दूँगा। मैं आज का ताज़ा डेटा, रुझान और जोखिम की तस्वीर, और किन बातों पर नज़र रखनी है, यह बता सकता हूँ।' },
};
const FU = {
  en: { calls: ['How is the market today?', 'Latest market news', 'Explain P/E ratio'], general: ['How is the market today?', 'Explain what a SIP is', 'Show my portfolio health'], stock: ['What are the risks?', 'How is the market today?', 'Explain P/E ratio'], market: ['Any IPOs open now?', 'Latest market news', 'Explain what a SIP is'], refuse: ['Explain risk and return simply', 'How is the market today?', 'Show a SIP example'], portfolio: ['How is the market today?', 'Explain diversification', 'Where can I invest ₹50,000?'], ipo: ['How do I judge an IPO?', 'Latest market news', 'How is the market today?'], term: ['Explain SIP', 'How is the market today?', 'Show my portfolio health'], news: ['How is the market today?', 'Any IPOs open now?', 'Explain what a SIP is'] },
  hi: { calls: ['आज बाज़ार कैसा है?', 'बाज़ार की ताज़ा ख़बरें', 'P/E अनुपात क्या है?'], general: ['आज बाज़ार कैसा है?', 'SIP क्या होता है?', 'मेरे पोर्टफ़ोलियो की सेहत दिखाइए'], stock: ['इसके जोखिम क्या हैं?', 'आज बाज़ार कैसा है?', 'P/E अनुपात क्या है?'], market: ['अभी कौन-से IPO खुले हैं?', 'बाज़ार की ताज़ा ख़बरें', 'SIP क्या होता है?'], refuse: ['जोखिम और रिटर्न आसान भाषा में समझाइए', 'आज बाज़ार कैसा है?', 'SIP का उदाहरण दिखाइए'], portfolio: ['आज बाज़ार कैसा है?', 'विविधीकरण क्या है?', '₹50,000 कहाँ निवेश करूँ?'], ipo: ['IPO को कैसे परखें?', 'बाज़ार की ताज़ा ख़बरें', 'आज बाज़ार कैसा है?'], term: ['SIP क्या होता है?', 'आज बाज़ार कैसा है?', 'मेरे पोर्टफ़ोलियो की सेहत दिखाइए'], news: ['आज बाज़ार कैसा है?', 'अभी कौन-से IPO खुले हैं?', 'SIP क्या होता है?'] },
} as const;

// ---------- intent helpers ----------
const MEANING = /(what is|what are|what's|whats|meaning of|explain|define|full form|tell me about the term|क्या (है|होता|होती|हैं)|मतलब|का अर्थ|समझा|kya hota|kya hai)/;
const PRICEWORDS = /(price|quote|rate|trading at|how much|भाव|कीमत|दाम|कितना|कितने|प्राइस)/;
const ANALYSISWORDS = /(analy|view|outlook|should i|worth|good|safe|hold|invest|opinion|future|कैसा|कैसी|विश्लेषण|क्या करूँ|क्या करूं|लेना|लूँ|लूं|ख़रीद|खरीद|बेच|रखूँ|रखूं|सही|अच्छा|अच्छी)/;
const NEWSWORDS = /(news|headline|खबर|ख़बर|समाचार|न्यूज़|न्यूज)/;
const MARKETWORDS = /(market|nifty|sensex|bank nifty|today|आज|बाज़ार|बाजार|निफ्टी|निफ़्टी|सेंसेक्स|how is|कैसा रहा|कैसा है)/;
const PORTFOLIOWORDS = /(my portfolio|my holdings|my shares|my stocks|my investments|portfolio health|मेरा पोर्टफ|मेरे पोर्टफ|मेरे शेयर|मेरी होल्डिंग|मेरा निवेश|मेरे निवेश|पोर्टफ़ोलियो की सेहत|पोर्टफोलियो की सेहत)/;
const PLANWORDS = /(where (should|can|do) i (invest|put)|where to invest|how (should|do) i invest|kahan (invest|nivesh)|कहाँ (निवेश|लगाऊँ|लगाऊं|लगाएँ|लगाएं)|कहां (निवेश|लगाऊँ|लगाऊं|लगाएँ|लगाएं)|कहाँ लगा|कैसे निवेश|क्या करूँ इस पैसे|invest (₹|rs\.?|rupees)?\s*[\d,]+)/;
const CALLSWORDS = /(what (should|to) (i )?(buy|sell|avoid)|which (stock|share)s?|stocks? (to|for) (buy|sell|avoid|invest)|shares? (to|for) (buy|sell|avoid)|top (picks?|stocks?|calls?)|best (stock|share)s?|(buy|sell|avoid) today|today'?s calls?|any (buy|sell) calls?|rising stars?|worth (buying|selling)|कौन ?(सा|से) (शेयर|स्टॉक)|क्या (ख़रीदूँ|खरीदूँ|खरीदूं|ख़रीदूं|बेचूँ|बेचूं|खरीदें|ख़रीदें)|(ख़रीदने|खरीदने|बेचने) (लायक|के लिए)|आज की राय|टॉप (शेयर|स्टॉक)|उभरते सितारे)/;
const IPOWORDS = /(\bipo\b|आईपीओ|आई पी ओ)/;

export function parseAmount(text: string): number | null {
  const t = asciiDigits(text).toLowerCase().replace(/,/g, '');
  const m = t.match(/(?:₹|rs\.?|inr|rupees?)?\s*(\d+(?:\.\d+)?)\s*(crore|cr|करोड़|करोड|lakhs?|lacs?|लाख|thousand|k|हज़ार|हजार)?/);
  if (!m) return null; let v = parseFloat(m[1]); const u = m[2] ?? '';
  if (/crore|cr|करोड/.test(u)) v *= 1e7; else if (/lakh|lac|लाख/.test(u)) v *= 1e5; else if (/thousand|^k$|हज़ार|हजार/.test(u)) v *= 1e3;
  return v >= 100 ? v : null;
}

async function findTerm(msg: string): Promise<Term | null> {
  let all: Term[] = [];
  try { all = searchTerms(); } catch { return null; }
  const t = norm(msg); let best: { term: Term; len: number } | null = null;
  const forms = (x: string) => { const base = norm(x); const noParen = base.replace(/\(.*?\)/g, '').trim(); return [base, noParen, ...(base.match(/\((.*?)\)/g) ?? []).map((p) => p.slice(1, -1))].filter((v) => v.length >= 2); };
  for (const term of all) {
    for (const f of [...forms(term.term.en), ...forms(term.term.hi), term.id.toLowerCase().replace(/[-_]/g, ' ')]) {
      const hit = /[a-z]/.test(f) ? new RegExp(`(^|[^a-z0-9])${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(t) : t.includes(f);
      if (hit && (!best || f.length > best.len)) best = { term, len: f.length };
    }
  }
  return best?.term ?? null;
}

interface Tool<T = unknown> { name: string; data: T; citations: Citation[] }
type Draft = { answer: string; citations: Citation[]; toolsUsed: string[]; kind: keyof typeof FU.en; refused?: boolean };
const dedupeCites = (c: Citation[]) => { const s = new Set<string>(); return c.filter((x) => { const k = x.label + x.ref; if (s.has(k)) return false; s.add(k); return true; }); };
const unavailable = (lang: Lang, what: string) => lang === 'hi' ? `${what} अभी उपलब्ध नहीं है, इसलिए मैं इस बारे में अंदाज़ा नहीं लगाऊँगा। थोड़ी देर बाद फिर कोशिश करें।` : `${what} is not available right now, so I will not guess. Please try again in a little while.`;
const asOfStr = (iso: string | null, lang: Lang) => { if (!iso) return ''; const d = new Date(iso); return isNaN(+d) ? '' : d.toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }); };


// ---------- calls (explicit research calls) ----------
const ACTION_HI: Record<CallAction, string> = { BUY: 'ख़रीदें', ACCUMULATE: 'धीरे-धीरे ख़रीदें', HOLD: 'रखें', REDUCE: 'घटाएँ', SELL: 'बेचें' };
const label = (a: CallAction, lang: Lang) => (lang === 'hi' ? ACTION_HI[a] : a);
const MODE_WORD: Record<Lang, Record<'invest' | 'trade', string>> = { en: { invest: 'long-term', trade: 'short-term' }, hi: { invest: 'लंबी अवधि', trade: 'छोटी अवधि' } };
function callLine(c: StockCall, lang: Lang, withLevels = true): string {
  const en = lang === 'en'; const L = c.levels;
  const base = en
    ? `${c.name}, ${MODE_WORD.en[c.mode]} call: ${label(c.action, lang)}, score ${c.score} out of 100, conviction ${c.conviction}.`
    : `${c.name}, ${MODE_WORD.hi[c.mode]} की राय: ${label(c.action, lang)}, स्कोर 100 में से ${c.score}, भरोसा ${c.conviction === 'high' ? 'ऊँचा' : c.conviction === 'medium' ? 'मध्यम' : 'कम'}।`;
  if (!withLevels || !L || c.action === 'HOLD') return base;
  return base + (en
    ? ` Illustrative levels: entry ${inr(L.entryLow)} to ${inr(L.entryHigh)}, target ${inr(L.targetLow)} to ${inr(L.targetHigh)}, protective level ${inr(L.stopLoss)}.`
    : ` उदाहरण स्तर: एंट्री ${inr(L.entryLow)} से ${inr(L.entryHigh)}, लक्ष्य ${inr(L.targetLow)} से ${inr(L.targetHigh)}, सुरक्षा स्तर ${inr(L.stopLoss)}।`);
}
const callCite = (c: StockCall, lang: Lang): Citation => ({ label: `${c.name} ${lang === 'hi' ? 'राय' : 'call'} (FinSaathi rules)`, ref: `/calls/${c.symbol}?mode=${c.mode}`, asOf: c.asOf });

async function callsAnswer(lang: Lang): Promise<Draft> {
  const en = lang === 'en';
  try {
    const f = await getCallsFeed(lang);
    const lines: string[] = [en ? "Here is what our research calls say right now (rule-based, with reasons in the app):" : 'हमारी रिसर्च राय अभी यह कहती हैं (नियम-आधारित, कारण ऐप में देखें):'];
    const cites: Citation[] = [];
    const add = (title: string, list: StockCall[], n: number) => {
      if (!list.length) return;
      lines.push(title);
      for (const c of list.slice(0, n)) { lines.push('• ' + callLine(c, lang, false)); cites.push(callCite(c, lang)); }
    };
    add(en ? 'Long-term picks:' : 'लंबी अवधि के चयन:', f.invest, 3);
    add(en ? 'Short-term setups:' : 'छोटी अवधि के मौक़े:', f.trade.filter((c) => c.action === 'BUY'), 2);
    add(en ? 'Reduce or avoid:' : 'घटाएँ या बचें:', f.avoid, 2);
    add(en ? 'Rising stars (a screen, not a prediction):' : 'उभरते सितारे (छँटाई, भविष्यवाणी नहीं):', f.risingStars, 2);
    lines.push(en ? 'Open any stock to see the entry, target, stop-loss, the numbers behind the call and what could go wrong. This is research, not SEBI-registered advice, and you can lose money.' : 'किसी भी शेयर को खोलकर एंट्री, लक्ष्य, स्टॉप-लॉस, राय के पीछे के आँकड़े और जोखिम देखें। यह रिसर्च है, सेबी-पंजीकृत सलाह नहीं, और आपका पैसा डूब सकता है।');
    return { answer: lines.join('\n'), citations: cites, toolsUsed: ['calls'], kind: 'calls' };
  } catch { return { answer: unavailable(lang, en ? "Today's calls" : 'आज की राय'), citations: [], toolsUsed: [], kind: 'calls' }; }
}

// ---------- rule-based tools ----------
async function stockAnswer(msg: string, st: RefStock, lang: Lang): Promise<Draft> {
  const en = lang === 'en'; const t = norm(msg);
  const nm = en ? st.name : (st.hi[0] ?? st.name);
  const priceOnly = PRICEWORDS.test(t) && !ANALYSISWORDS.test(t);
  const cites: Citation[] = []; const used: string[] = ['quote'];
  let quote; try { quote = await getQuote(st.symbol); } catch { quote = null; }
  let lines: string[] = [];
  if (quote) {
    cites.push({ label: `${st.name} price (${quote.source})`, ref: st.symbol, asOf: quote.asOf });
    lines.push(en
      ? `${st.name} is at ${inr(quote.price)}, ${quote.change >= 0 ? 'up' : 'down'} ${Math.abs(quote.changePct).toFixed(2)}% from the previous close (data as of ${asOfStr(quote.asOf, lang)}; this source may be delayed).`
      : `${nm} का भाव ${inr(quote.price)} है, पिछले बंद भाव से ${Math.abs(quote.changePct).toFixed(2)}% ${quote.change >= 0 ? 'ऊपर' : 'नीचे'} (आँकड़ा: ${asOfStr(quote.asOf, lang)}; यह स्रोत कुछ देरी से हो सकता है)।`);
    if (quote.fiftyTwoWeekLow != null && quote.fiftyTwoWeekHigh != null) lines.push(en ? `Its 52-week range is ${inr(quote.fiftyTwoWeekLow)} to ${inr(quote.fiftyTwoWeekHigh)}.` : `पिछले 52 हफ़्तों में भाव ${inr(quote.fiftyTwoWeekLow)} से ${inr(quote.fiftyTwoWeekHigh)} के बीच रहा।`);
  } else lines.push(unavailable(lang, en ? `The live price of ${st.name}` : `${nm} का ताज़ा भाव`));
  try {
    used.push('analysis');
    const a = await getAnalysis(st.symbol, lang);
    cites.push({ label: `${st.name} analysis (FinSaathi rules on ${a.sources[0]?.name ?? 'Yahoo Finance'})`, ref: `/stocks/${st.symbol}/analysis`, asOf: a.asOf });
    if (priceOnly) lines.push(en ? `Our rule-based read: "${STANCE_LABEL.en[a.stance]}" (score ${a.score}/100). Ask me for the full analysis if you like.` : `हमारी नियम-आधारित राय: "${STANCE_LABEL.hi[a.stance]}" (स्कोर ${a.score}/100)। पूरा विश्लेषण चाहें तो पूछिए।`);
    else {
      lines.push(en ? `Our rule-based read is "${STANCE_LABEL.en[a.stance]}" with a score of ${a.score} out of 100 (confidence: ${a.confidence}).` : `हमारी नियम-आधारित राय "${STANCE_LABEL.hi[a.stance]}" है, स्कोर 100 में से ${a.score} (भरोसा: ${a.confidence === 'high' ? 'अधिक' : a.confidence === 'medium' ? 'मध्यम' : 'कम'})।`);
      a.evidence.slice(0, 3).forEach((e) => lines.push(`• ${e.label}: ${e.value}`));
      if (a.risks[0]) lines.push(en ? `Main risk: ${a.risks[0]}` : `मुख्य जोखिम: ${a.risks[0]}`);
      lines.push(a.uncertainty);
    }
  } catch { lines.push(unavailable(lang, en ? 'The analysis' : 'विश्लेषण')); }
  // The explicit research calls (long-term and short-term) for this stock.
  try {
    for (const mode of ['invest', 'trade'] as const) {
      const c = await getStockCall(st.symbol, mode, lang);
      lines.push(callLine(c, lang, !priceOnly)); cites.push(callCite(c, lang)); if (!used.includes('calls')) used.push('calls');
      if (priceOnly) break;
    }
    if (!priceOnly) lines.push(en ? 'These are research calls with illustrative levels, not SEBI-registered advice. You can lose money.' : 'ये उदाहरण स्तरों वाली रिसर्च राय हैं, सेबी-पंजीकृत सलाह नहीं। आपका पैसा डूब सकता है।');
  } catch { /* the call is optional; the analysis above still stands */ }
  void getFundamentals;
  return { answer: lines.join('\n'), citations: cites, toolsUsed: used, kind: 'stock' };
}

async function marketAnswer(lang: Lang): Promise<Draft> {
  try {
    const o = await getMarketOverview(lang);
    const cites: Citation[] = o.india.slice(0, 3).map((q) => ({ label: `${q.name} (${q.source})`, ref: q.symbol, asOf: q.asOf }));
    if (!o.india.length && !o.global.length) return { answer: unavailable(lang, lang === 'en' ? 'Market data' : 'बाज़ार का डेटा'), citations: [], toolsUsed: ['marketOverview'], kind: 'market' };
    const note = o.unavailable.length ? (lang === 'en' ? `\n(Not available right now: ${o.unavailable.join(', ')}.)` : `\n(अभी उपलब्ध नहीं: ${o.unavailable.join(', ')}।)`) : '';
    return { answer: `${o.mood.headline}.\n${o.mood.bullets.map((b) => '• ' + b).join('\n')}${note}`, citations: cites, toolsUsed: ['marketOverview'], kind: 'market' };
  } catch { return { answer: unavailable(lang, lang === 'en' ? 'Market data' : 'बाज़ार का डेटा'), citations: [], toolsUsed: ['marketOverview'], kind: 'market' }; }
}

async function newsAnswer(msg: string, lang: Lang): Promise<Draft> {
  const t = norm(msg);
  const topic = /gold|सोना|सोने/.test(t) ? 'gold' : /ipo|आईपीओ/.test(t) ? 'ipo' : /economy|rbi|inflation|अर्थव्यवस्था|महंगाई|आरबीआई/.test(t) ? 'economy' : 'market';
  try {
    const f = await getNews(lang, topic);
    const items = f.items.slice(0, 4);
    const w = { en: { positive: 'reads positive', negative: 'reads negative', neutral: 'neutral' }, hi: { positive: 'सकारात्मक', negative: 'नकारात्मक', neutral: 'तटस्थ' } }[lang];
    return { answer: (lang === 'en' ? 'Latest headlines (wording-based mood, not a verdict):\n' : 'ताज़ा सुर्ख़ियाँ (शब्दों के आधार पर माहौल, फ़ैसला नहीं):\n') + items.map((i) => `• ${i.title} (${i.source}, ${w[i.sentiment]})`).join('\n'), citations: items.map((i) => ({ label: `${i.source}: ${i.title.slice(0, 80)}`, ref: i.url, asOf: i.publishedAt })), toolsUsed: ['news'], kind: 'news' };
  } catch { return { answer: unavailable(lang, lang === 'en' ? 'News' : 'ख़बरें'), citations: [], toolsUsed: ['news'], kind: 'news' }; }
}

async function ipoAnswer(lang: Lang): Promise<Draft> {
  const f = await getIpoFeed(lang); const en = lang === 'en';
  const active = f.items.filter((i) => i.status === 'open' || i.status === 'upcoming').slice(0, 5);
  const lines: string[] = [];
  if (!f.available) lines.push(f.note);
  else if (!active.length) lines.push(en ? 'No open or upcoming IPOs were listed in the NSE data right now.' : 'NSE के आँकड़ों में अभी कोई खुला या आने वाला IPO नहीं दिखा।');
  else { lines.push(en ? 'IPOs open or coming up (from NSE data):' : 'खुले या आने वाले IPO (NSE के आँकड़ों से):'); active.forEach((i) => lines.push(`• ${i.name} (${i.status === 'open' ? (en ? 'open' : 'खुला') : (en ? 'upcoming' : 'आने वाला')}${i.openDate ? `, ${i.openDate} to ${i.closeDate}` : ''}${i.priceBand ? `, ${i.priceBand}` : ''})`)); }
  lines.push(en ? 'This is not a recommendation. Before applying, check: ' + f.checklist.slice(0, 3).map((c) => c.title).join('; ') + '.' : 'यह सिफ़ारिश नहीं है। आवेदन से पहले देखें: ' + f.checklist.slice(0, 3).map((c) => c.title).join('; ') + '।');
  return { answer: lines.join('\n'), citations: [{ label: f.source, ref: '/ipos', asOf: f.asOf }], toolsUsed: ['ipos'], kind: 'ipo' };
}

async function portfolioAnswer(userId: string, lang: Lang): Promise<Draft> {
  const en = lang === 'en';
  try {
    const v = await getPortfolioView(userId);
    if (!v.holdings.length) return { answer: en ? 'You have not added any holdings yet. Add the shares or funds you own in the Portfolio tab and I can check how diversified they are.' : 'आपने अभी कोई होल्डिंग नहीं जोड़ी है। पोर्टफ़ोलियो टैब में अपने शेयर या फ़ंड जोड़ें, फिर मैं देख सकता हूँ कि वे कितने विविध हैं।', citations: [{ label: 'Your portfolio', ref: '/portfolio', asOf: v.asOf }], toolsUsed: ['portfolio'], kind: 'portfolio' };
    const lines = [en ? `You hold ${v.holdings.length} investment(s) with a current value of ${inr(v.totals.value, 0)} against ${inr(v.totals.invested, 0)} invested (${spct(v.totals.pnlPct)}). Today's change: ${inr(v.totals.dayChange, 0)}.`
      : `आपके पास ${v.holdings.length} निवेश हैं, जिनका मौजूदा मूल्य ${inr(v.totals.value, 0)} है और लगाई गई रकम ${inr(v.totals.invested, 0)} (${spct(v.totals.pnlPct)})। आज का बदलाव: ${inr(v.totals.dayChange, 0)}।`];
    const cites: Citation[] = [{ label: 'Your portfolio', ref: '/portfolio', asOf: v.asOf }]; const used = ['portfolio'];
    try {
      const h = await getPortfolioHealth(userId, lang); used.push('portfolioHealth');
      lines.push(en ? `Portfolio health: ${h.score}/100 (${h.label}).` : `पोर्टफ़ोलियो की सेहत: ${h.score}/100 (${h.label})।`);
      h.issues.slice(0, 2).forEach((i) => lines.push(`• ${i.title}: ${i.detail}`));
      cites.push({ label: 'Portfolio health check', ref: '/portfolio/health', asOf: h.asOf });
    } catch { /* optional */ }
    return { answer: lines.join('\n'), citations: cites, toolsUsed: used, kind: 'portfolio' };
  } catch { return { answer: unavailable(lang, en ? 'Your portfolio' : 'आपका पोर्टफ़ोलियो'), citations: [], toolsUsed: ['portfolio'], kind: 'portfolio' }; }
}

async function planAnswer(userId: string, msg: string, lang: Lang): Promise<Draft> {
  const en = lang === 'en'; const amt = parseAmount(msg); const used = ['alternatives']; const cites: Citation[] = [];
  let risk: string | null = null;
  try { risk = (await getProfile(userId)).riskLevel; used.push('profile'); } catch { /* optional */ }
  const rl = risk ? ({ conservative: en ? 'cautious' : 'सतर्क', balanced: en ? 'balanced' : 'संतुलित', growth: en ? 'growth-oriented' : 'बढ़त-उन्मुख' } as Record<string, string>)[risk] : null;
  const alt = await getAlternatives(lang).catch(() => null);
  if (alt) { cites.push({ label: 'FinSaathi alternatives guide', ref: '/alternatives', asOf: alt.asOf }); alt.cards.filter((c) => c.quote).forEach((c) => cites.push({ label: `${c.title} ETF price (${c.quote!.source})`, ref: c.quote!.symbol, asOf: c.quote!.asOf })); }
  const a = amt ? (en ? `${inr(amt, 0)} (${lakhCrore(amt, 'en')})` : `${inr(amt, 0)} (${lakhCrore(amt, 'hi')})`) : null;
  const lines = en ? [
    `${a ? `For ${a}, ` : ''}I cannot tell you exactly what to buy, but here is a sensible order of thinking${rl ? ` (your profile says you are ${rl})` : ''}:`,
    '1. Keep an emergency fund first: several months of expenses in a safe, easy-to-withdraw place such as a bank deposit or liquid fund.',
    '2. Money you need within about 3 years belongs in safer options (deposits, short-term debt funds), not shares.',
    '3. Money for 5 years or more can go partly into shares through a low-cost index fund or ETF, ideally spread over months (a SIP) instead of all at once.',
    '4. A small share in gold can help balance things when shares fall.',
    'The Planner tab can turn this into a personal plan using your goals and risk level. I do not quote interest rates here because they change; check your bank for today\'s rate.',
  ] : [
    `${a ? `${a} के लिए ` : ''}मैं सटीक रूप से यह नहीं बता सकता कि क्या ख़रीदें, पर सोचने का एक समझदार क्रम यह है${rl ? ` (आपकी प्रोफ़ाइल के अनुसार आप ${rl} निवेशक हैं)` : ''}:`,
    '1. पहले आपातकालीन निधि रखें: कई महीनों का ख़र्च किसी सुरक्षित और आसानी से निकल सकने वाली जगह, जैसे बैंक जमा या लिक्विड फ़ंड, में।',
    '2. जो पैसा लगभग 3 साल के भीतर चाहिए, वह सुरक्षित विकल्पों (FD, छोटी अवधि के डेट फ़ंड) में रखें, शेयरों में नहीं।',
    '3. 5 साल या उससे लंबे समय का पैसा कम ख़र्च वाले इंडेक्स फ़ंड या ETF के ज़रिए आंशिक रूप से शेयरों में जा सकता है, एक साथ नहीं बल्कि महीनों में बाँटकर (SIP)।',
    '4. सोने में छोटा हिस्सा शेयर गिरने पर संतुलन बनाने में मदद कर सकता है।',
    'प्लानर टैब आपके लक्ष्यों और जोखिम स्तर के हिसाब से इसे निजी योजना बना सकता है। मैं यहाँ ब्याज दरें नहीं बताता क्योंकि वे बदलती रहती हैं; आज की दर अपने बैंक से पूछें।',
  ];
  return { answer: lines.join('\n'), citations: cites, toolsUsed: used, kind: 'general' };
}

async function termAnswer(term: Term, lang: Lang): Promise<Draft> {
  const en = lang === 'en';
  return { answer: `${term.term[lang]}: ${term.simple[lang]}\n${en ? 'Example' : 'उदाहरण'}: ${term.example[lang]}`, citations: [{ label: en ? 'FinSaathi learning library' : 'FinSaathi सीखने का भंडार', ref: `/education/terms/${term.id}`, asOf: null }], toolsUsed: ['education'], kind: 'term' };
}

const HELP: Record<Lang, string> = {
  en: 'I am FinSaathi, your investing companion. I answer only from real data I can fetch. Ask me about a stock\'s price or analysis (for example "How is Reliance doing?"), today\'s market, your portfolio, open IPOs, news, or the meaning of an investing term. I can also share FinSaathi\'s research calls (buy, hold, sell) with their reasons, for example "Which stocks look good today?". I never promise returns.',
  hi: 'मैं FinSaathi हूँ, आपका निवेश साथी। मैं सिर्फ़ उसी असली डेटा से जवाब देता हूँ जो मैं निकाल सकता हूँ। आप किसी शेयर का भाव या विश्लेषण ("रिलायंस कैसा चल रहा है?"), आज का बाज़ार, अपना पोर्टफ़ोलियो, खुले IPO, ख़बरें, या निवेश के किसी शब्द का मतलब पूछ सकते हैं। मैं FinSaathi की रिसर्च राय (ख़रीदें, रखें, बेचें) कारण के साथ बता सकता हूँ, जैसे "आज कौन-से शेयर अच्छे दिख रहे हैं?"। मैं रिटर्न का वादा नहीं करता।',
};

// ---------- rules router ----------
export async function rulesChat(userId: string, req: ChatRequest): Promise<Draft> {
  const lang = req.lang; const msg = req.message; const t = norm(msg);
  const ref = detectRefusal(msg);
  if (ref) return { answer: REFUSAL_TXT[ref][lang], citations: [], toolsUsed: [], kind: 'refuse', refused: true };
  const stock = resolveStock(msg);
  const meaning = MEANING.test(t);
  const term = await findTerm(msg);
  if (meaning && term && !stock) return termAnswer(term, lang);
  if (PORTFOLIOWORDS.test(t)) return portfolioAnswer(userId, lang);
  if (PLANWORDS.test(t) && !stock) return planAnswer(userId, msg, lang);
  if (stock && !(meaning && term)) return stockAnswer(msg, stock, lang);
  if (CALLSWORDS.test(t) && !stock) return callsAnswer(lang);
  if (IPOWORDS.test(t)) return ipoAnswer(lang);
  if (NEWSWORDS.test(t)) return newsAnswer(msg, lang);
  if (MARKETWORDS.test(t)) return marketAnswer(lang);
  if (term) return termAnswer(term, lang);
  return { answer: HELP[lang], citations: [], toolsUsed: [], kind: 'general' };
}

// ---------- optional LLM tool-use path (same tools, same guardrails) ----------
const TOOLS = [
  { name: 'get_stock', description: 'Live price and rule-based analysis for a Nifty 50 stock. Input: company name or symbol.', input_schema: { type: 'object' as const, properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'get_market_today', description: 'Today\'s Indian and global market overview.', input_schema: { type: 'object' as const, properties: {} } },
  { name: 'get_portfolio', description: 'The user\'s portfolio and its health.', input_schema: { type: 'object' as const, properties: {} } },
  { name: 'get_news', description: 'Latest headlines.', input_schema: { type: 'object' as const, properties: { topic: { type: 'string', enum: ['market', 'economy', 'stocks', 'ipo', 'gold'] } } } },
  { name: 'get_top_calls', description: "FinSaathi's current research calls: top long-term picks, short-term setups, rising stars and stocks to reduce or avoid.", input_schema: { type: 'object' as const, properties: {} } },
  { name: 'get_ipos', description: 'Open and upcoming IPOs.', input_schema: { type: 'object' as const, properties: {} } },
  { name: 'explain_term', description: 'Plain-language definition of an investing term.', input_schema: { type: 'object' as const, properties: { term: { type: 'string' } }, required: ['term'] } },
];

async function llmChat(userId: string, req: ChatRequest): Promise<Draft | null> {
  if (!llmConfigured()) return null;
  const lang = req.lang; const outputs: string[] = []; const cites: Citation[] = []; const used: string[] = [];
  const runTool = async (name: string, input: any): Promise<string> => {
    let d: Draft | null = null;
    if (name === 'get_stock') { const s = resolveStock(String(input?.name ?? '')) ?? resolveStock(req.message); d = s ? await stockAnswer(String(input?.name ?? req.message), s, lang) : null; if (!d) return 'Unknown or unsupported stock.'; }
    else if (name === 'get_market_today') d = await marketAnswer(lang);
    else if (name === 'get_portfolio') d = await portfolioAnswer(userId, lang);
    else if (name === 'get_news') d = await newsAnswer(String(input?.topic ?? 'market'), lang);
    else if (name === 'get_top_calls') d = await callsAnswer(lang);
    else if (name === 'get_ipos') d = await ipoAnswer(lang);
    else if (name === 'explain_term') { const tm = await findTerm(String(input?.term ?? '')); if (!tm) return 'Term not found in the library.'; d = await termAnswer(tm, lang); }
    else return 'Unknown tool.';
    cites.push(...d.citations); used.push(...d.toolsUsed); outputs.push(d.answer);
    return d.answer;
  };
  const system = `You are FinSaathi, an investing companion for Indian retail investors, many of them seniors. Answer in ${lang === 'hi' ? 'simple, natural Hindi' : 'plain English'}. Use ONLY the tools; never state a price, number, or fact that a tool did not return. If a tool says data is unavailable, say so. You may report FinSaathi's research calls (BUY, ACCUMULATE, HOLD, REDUCE, SELL) exactly as the tools return them, with their levels and the reminder that it is research, not SEBI-registered advice. Never say guaranteed, sure-shot or risk-free, never promise returns and never predict prices. Explain jargon briefly. Keep answers under 150 words. If no tool fits, say what you can help with.`;
  const messages: any[] = [...(req.history ?? []).slice(-6).map((h) => ({ role: h.role, content: h.text })), { role: 'user', content: req.message }];
  for (let i = 0; i < 4; i++) {
    const r = await llmCall({ max_tokens: 700, system, tools: TOOLS, messages });
    if (!r) return null;
    if (r.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: r.content });
      const results: any[] = [];
      for (const b of r.content) if (b.type === 'tool_use') results.push({ type: 'tool_result', tool_use_id: b.id, content: await runTool(b.name, b.input).catch(() => 'Tool failed.') });
      messages.push({ role: 'user', content: results });
      continue;
    }
    const text = textOf(r).trim();
    if (!text || used.length === 0) return null;
    const allowed = new AllowedNumbers().add(...outputs, req.message);
    if (!validateNarrative(text, allowed).ok) return null;
    return { answer: text, citations: dedupeCites(cites), toolsUsed: [...new Set(used)], kind: 'general' };
  }
  return null;
}

export async function chat(userId: string, req: ChatRequest): Promise<ChatResponse> {
  const lang: Lang = req.lang === 'hi' ? 'hi' : 'en';
  const message = String(req.message ?? '').slice(0, 1000).trim();
  const r: ChatRequest = { ...req, lang, message };
  if (!message) return { answer: HELP[lang], citations: [], toolsUsed: [], refused: false, followUps: [...FU[lang].general], generatedBy: 'rules', disclaimer: DISCLAIMER[lang] };
  const refusal = detectRefusal(message);
  let draft: Draft | null = null; let by: 'rules' | 'llm' = 'rules';
  if (!refusal) { try { draft = await llmChat(userId, r); if (draft) by = 'llm'; } catch { draft = null; } }
  if (!draft) draft = await rulesChat(userId, r).catch(() => ({ answer: unavailable(lang, lang === 'en' ? 'That information' : 'वह जानकारी'), citations: [], toolsUsed: [], kind: 'general' as const }));
  return { answer: draft.answer, citations: dedupeCites(draft.citations), toolsUsed: draft.toolsUsed, refused: !!draft.refused, followUps: [...FU[lang][draft.kind]], generatedBy: by, disclaimer: DISCLAIMER[lang] };
}
