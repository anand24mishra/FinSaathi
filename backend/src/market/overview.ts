import type { MarketOverview, Quote, Lang } from '../../../shared/contract';
import { getQuotes } from './data';
import { fetchFlows, NSE_SOURCE } from './providers/nse';
import { usdInr } from './providers/frankfurter';
import { groupIndian } from './format';
import { TtlCache, TTL, iso } from './http';

const INDIA = ['^NSEI', '^BSESN', '^NSEBANK'], GLOBAL = ['^IXIC', '^GSPC', '^DJI', '^N225', '^HSI'], COMM = ['GC=F', 'SI=F', 'BZ=F'], FX = 'USDINR=X';
const NAMES: Record<string, Record<Lang, string>> = {
  '^NSEI': { en: 'Nifty 50', hi: 'निफ़्टी 50' }, '^BSESN': { en: 'Sensex', hi: 'सेंसेक्स' }, '^NSEBANK': { en: 'Bank Nifty', hi: 'बैंक निफ़्टी' },
  '^IXIC': { en: 'Nasdaq', hi: 'नैस्डैक' }, '^GSPC': { en: 'S&P 500', hi: 'एसएंडपी 500' }, '^DJI': { en: 'Dow Jones', hi: 'डाउ जोंस' }, '^N225': { en: 'Nikkei 225', hi: 'निक्केई 225' }, '^HSI': { en: 'Hang Seng', hi: 'हैंग सेंग' },
  'GC=F': { en: 'Gold', hi: 'सोना' }, 'SI=F': { en: 'Silver', hi: 'चाँदी' }, 'BZ=F': { en: 'Brent crude', hi: 'ब्रेंट कच्चा तेल' },
};
const f1 = (n: number) => Math.abs(n).toFixed(2);

async function fxQuote(q: Quote | undefined): Promise<Quote | null> {
  if (q) return q;
  try {
    const r = await usdInr();
    const ch = r.prev != null ? r.rate - r.prev : 0;
    return { symbol: FX, name: 'USD/INR', price: r.rate, change: +ch.toFixed(4), changePct: r.prev ? +((ch / r.prev) * 100).toFixed(3) : 0, currency: 'INR', prevClose: r.prev, dayHigh: null, dayLow: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, marketState: 'unknown', asOf: `${r.date}T00:00:00.000Z`, source: 'ECB reference rate via frankfurter.dev (fallback)', delayMinutes: null };
  } catch { return null; }
}

export interface Move { key: string; name: string; pct: number }
export function buildMood(lang: Lang, d: { india: Quote[]; global: Quote[]; commodities: Quote[]; fx: Quote | null; flows?: { fii: number | null; dii: number | null } }): MarketOverview['mood'] {
  const en = lang === 'en'; const nm = (s: string) => NAMES[s]?.[lang] ?? s;
  const nifty = d.india.find((q) => q.symbol === '^NSEI');
  const sp = d.global.find((q) => q.symbol === '^GSPC'), nas = d.global.find((q) => q.symbol === '^IXIC');
  const brent = d.commodities.find((q) => q.symbol === 'BZ=F'), gold = d.commodities.find((q) => q.symbol === 'GC=F');
  const bullets: string[] = [];
  let key: MarketOverview['mood']['key'] = 'calm';
  if (nifty) {
    const n = nifty.changePct;
    key = Math.abs(n) >= 1.5 ? 'volatile' : n >= 0.4 ? 'positive' : n <= -0.4 ? 'weak' : 'calm';
  }
  const word = (p: number) => (p > 0.05 ? (en ? 'up' : 'ऊपर') : p < -0.05 ? (en ? 'down' : 'नीचे') : (en ? 'flat' : 'लगभग स्थिर'));
  if (d.india.length) bullets.push(en
    ? d.india.map((q) => `${nm(q.symbol)} ${word(q.changePct)} ${f1(q.changePct)}% at ${groupIndian(q.price, 0)}`).join('; ') + '.'
    : d.india.map((q) => `${nm(q.symbol)} ${groupIndian(q.price, 0)} पर, ${f1(q.changePct)}% ${word(q.changePct)}`).join('; ') + '।');
  const us = [sp, nas].filter((x): x is Quote => !!x);
  if (us.length) {
    const avg = us.reduce((a, q) => a + q.changePct, 0) / us.length;
    bullets.push(en
      ? `US markets (${us.map((q) => nm(q.symbol)).join(', ')}) were ${word(avg)} ${f1(avg)}% in the latest session. ${avg <= -0.5 ? 'Weak global markets may weigh on Indian shares at the open, though the link is not certain.' : avg >= 0.5 ? 'Firm global markets may support sentiment in India, though the link is not certain.' : 'Little global push either way.'}`
      : `अमेरिकी बाज़ार (${us.map((q) => nm(q.symbol)).join(', ')}) पिछले सत्र में ${f1(avg)}% ${word(avg)} रहे। ${avg <= -0.5 ? 'कमज़ोर वैश्विक बाज़ार भारतीय शेयरों पर शुरुआत में दबाव डाल सकते हैं, हालाँकि यह संबंध पक्का नहीं होता।' : avg >= 0.5 ? 'मज़बूत वैश्विक बाज़ार भारत की धारणा को सहारा दे सकते हैं, हालाँकि यह संबंध पक्का नहीं होता।' : 'वैश्विक बाज़ार से किसी तरफ़ ख़ास असर नहीं दिखता।'}`);
  }
  if (brent) bullets.push(en
    ? `Brent crude oil is ${word(brent.changePct)} ${f1(brent.changePct)}% (about ${groupIndian(brent.price, 1)} dollars a barrel). ${brent.changePct >= 1 ? 'India imports most of its oil, so costlier crude may raise costs and may pressure the rupee and some shares.' : brent.changePct <= -1 ? 'Cheaper crude may ease costs for India, though effects on shares vary.' : 'No big oil shock today.'}`
    : `ब्रेंट कच्चा तेल ${f1(brent.changePct)}% ${word(brent.changePct)} है (लगभग ${groupIndian(brent.price, 1)} डॉलर प्रति बैरल)। ${brent.changePct >= 1 ? 'भारत अपना ज़्यादातर तेल आयात करता है, इसलिए महँगा तेल लागत बढ़ा सकता है और रुपये व कुछ शेयरों पर दबाव डाल सकता है।' : brent.changePct <= -1 ? 'सस्ता तेल भारत की लागत घटा सकता है, हालाँकि शेयरों पर असर अलग-अलग होता है।' : 'आज तेल में कोई बड़ा झटका नहीं है।'}`);
  if (d.fx) bullets.push(en
    ? `The rupee is at ${d.fx.price.toFixed(2)} per US dollar (${word(d.fx.changePct)} ${f1(d.fx.changePct)}%). ${d.fx.changePct >= 0.3 ? 'A weaker rupee may make imports costlier and may affect foreign investors\' flows.' : d.fx.changePct <= -0.3 ? 'A stronger rupee may help importers but may hurt exporters such as IT firms.' : 'The rupee is steady.'}`
    : `रुपया ${d.fx.price.toFixed(2)} प्रति अमेरिकी डॉलर पर है (डॉलर ${f1(d.fx.changePct)}% ${word(d.fx.changePct)})। ${d.fx.changePct >= 0.3 ? 'कमज़ोर रुपया आयात महँगा कर सकता है और विदेशी निवेशकों के रुख़ पर असर डाल सकता है।' : d.fx.changePct <= -0.3 ? 'मज़बूत रुपया आयातकों को राहत दे सकता है पर आईटी जैसे निर्यातकों को नुकसान पहुँचा सकता है।' : 'रुपया स्थिर है।'}`);
  if (gold && Math.abs(gold.changePct) >= 1) bullets.push(gold.changePct > 0
    ? (en ? `Gold is up ${f1(gold.changePct)}%; investors often turn to gold when they feel uncertain.` : `सोना ${f1(gold.changePct)}% ऊपर है; अनिश्चितता के समय निवेशक अक्सर सोने की ओर जाते हैं।`)
    : (en ? `Gold is down ${f1(gold.changePct)}% today; gold prices can swing even though many see it as a safe store of value.` : `सोना आज ${f1(gold.changePct)}% नीचे है; कई लोग इसे सुरक्षित मानते हैं, फिर भी इसके भाव घट-बढ़ सकते हैं।`));
  if (d.flows && d.flows.fii != null) bullets.push(en
    ? `Foreign institutions (FII/FPI) were net ${d.flows.fii >= 0 ? 'buyers' : 'sellers'} of about ₹${groupIndian(Math.abs(d.flows.fii), 0)} crore in the latest NSE report${d.flows.dii != null ? `; Indian institutions (DII) were net ${d.flows.dii >= 0 ? 'buyers' : 'sellers'} of about ₹${groupIndian(Math.abs(d.flows.dii), 0)} crore` : ''}.`
    : `NSE की ताज़ा रिपोर्ट में विदेशी संस्थाएँ (FII/FPI) लगभग ₹${groupIndian(Math.abs(d.flows.fii), 0)} करोड़ की शुद्ध ${d.flows.fii >= 0 ? 'ख़रीदार' : 'विक्रेता'} रहीं${d.flows.dii != null ? `; घरेलू संस्थाएँ (DII) लगभग ₹${groupIndian(Math.abs(d.flows.dii), 0)} करोड़ की शुद्ध ${d.flows.dii >= 0 ? 'ख़रीदार' : 'विक्रेता'}` : ''}।`);
  const heads: Record<typeof key, [string, string]> = {
    calm: ['Indian markets are calm', 'भारतीय बाज़ार शांत हैं'], positive: ['Indian markets are in good spirits', 'भारतीय बाज़ार में अच्छा माहौल है'],
    weak: ['Indian markets are under pressure', 'भारतीय बाज़ार पर दबाव है'], volatile: ['Indian markets are swinging sharply', 'भारतीय बाज़ार में तेज़ उतार-चढ़ाव है'],
  };
  const headline = nifty ? heads[key][en ? 0 : 1] : (en ? 'Market data is partly unavailable' : 'बाज़ार का कुछ डेटा अभी उपलब्ध नहीं है');
  if (!nifty) key = 'calm';
  return { key, headline, bullets };
}

const cache = new TtlCache<MarketOverview>(TTL.quote);
export async function getMarketOverview(lang: Lang): Promise<MarketOverview> {
  return (await cache.wrap(lang, async () => {
    const all = [...INDIA, ...GLOBAL, ...COMM, FX];
    const [quotes, flowsRes] = await Promise.all([getQuotes(all), fetchFlows().then((r) => r, () => null)]);
    const pick = (syms: string[]) => syms.map((s) => quotes[s]).filter((q): q is Quote => !!q).map((q) => ({ ...q, name: NAMES[q.symbol]?.[lang] ?? q.name }));
    const india = pick(INDIA), global = pick(GLOBAL), commodities = pick(COMM);
    const fx = await fxQuote(quotes[FX]);
    const unavailable = all.filter((s) => !quotes[s] && !(s === FX && fx));
    const fl = flowsRes?.data;
    const flows: MarketOverview['flows'] = fl
      ? { available: true, fii: fl.fiiNetCr, dii: fl.diiNetCr, asOf: fl.date ? `${fl.date}T00:00:00+05:30` : iso(fl.fetchedAt),
          note: lang === 'hi' ? `${NSE_SOURCE}: कैश बाज़ार में शुद्ध ख़रीद (+) या बिक्री (−), ₹ करोड़ में${fl.date ? `, तारीख़ ${fl.date}` : ''}। अनंतिम आँकड़े।${flowsRes?.stale ? ' (पुराने आँकड़े, ताज़ा नहीं मिले)' : ''}` : `${NSE_SOURCE}: net buying (+) or selling (−) in the cash market, in ₹ crore${fl.date ? `, for ${fl.date}` : ''}. Provisional figures.${flowsRes?.stale ? ' (older data; fresh data unavailable)' : ''}` }
      : { available: false, note: lang === 'hi' ? 'FII/DII के आँकड़े अभी उपलब्ध नहीं हैं (NSE स्रोत से नहीं मिले)।' : 'FII/DII flow data is unavailable right now (NSE source did not respond).' };
    const mood = buildMood(lang, { india, global, commodities, fx, flows: fl ? { fii: fl.fiiNetCr, dii: fl.diiNetCr } : undefined });
    const times = [...india, ...global, ...commodities, ...(fx ? [fx] : [])].map((q) => Date.parse(q.asOf)).filter((n) => isFinite(n));
    return {
      asOf: iso(times.length ? Math.max(...times) : Date.now()), india, global, commodities, fx, mood, flows,
      rates: { available: false, note: lang === 'hi' ? 'आरबीआई की रेपो दर: rbi.org.in पर देखें (हम इसे प्रमाणित तारीख़ वाले स्रोत के बिना नहीं दिखाते)।' : 'RBI repo rate: check rbi.org.in (we do not show it without a verified, dated source).' },
      unavailable,
    };
  })).value;
}
export const clearOverviewCache = () => cache.clear();
