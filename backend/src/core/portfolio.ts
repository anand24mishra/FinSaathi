import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DISCLAIMER, type Holding, type HoldingInput, type HealthIssue, type Lang, type PortfolioHealth, type PortfolioView, type Quote } from '../../../shared/contract';
import { holdings } from '../store';
import { getFundDetail, getQuotes, stockMeta } from '../market/service';
import { getProfile } from './users';

// ---------- repository ----------
interface HoldingRow { id: string; user_id: string; type: 'stock' | 'fund'; symbol: string | null; scheme_code: number | null; name: string; quantity: number; avg_price: number; buy_date: string | null }
export const listHoldingRows = async (userId: string): Promise<HoldingRow[]> =>
  (await holdings().find({ user_id: userId }).sort({ created_at: 1, _id: 1 }).toArray()).map((d) => ({ id: d._id, user_id: d.user_id, type: d.type, symbol: d.symbol, scheme_code: d.scheme_code, name: d.name, quantity: d.quantity, avg_price: d.avg_price, buy_date: d.buy_date }));

export const holdingInputSchema = z.object({
  type: z.enum(['stock', 'fund']),
  symbol: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9&.^=_-]+$/, 'Symbol has unexpected characters').optional(),
  schemeCode: z.number().int().positive().optional(),
  quantity: z.number().positive().max(1e9),
  avgPrice: z.number().positive().max(1e9),
  buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'buyDate must look like 2025-01-31').optional(),
}).superRefine((v, ctx) => {
  if (v.type === 'stock' && !v.symbol) ctx.addIssue({ code: 'custom', path: ['symbol'], message: 'symbol is required for a stock holding' });
  if (v.type === 'fund' && !v.schemeCode) ctx.addIssue({ code: 'custom', path: ['schemeCode'], message: 'schemeCode is required for a fund holding' });
});

export const normalizeSymbol = (s: string) => {
  const u = s.trim().toUpperCase();
  return u.includes('.') || u.startsWith('^') || u.includes('=') ? u : `${u}.NS`;
};

async function resolveHolding(input: HoldingInput): Promise<{ name: string; symbol: string | null; scheme: number | null }> {
  let name: string;
  let symbol: string | null = null;
  let scheme: number | null = null;
  if (input.type === 'stock') {
    symbol = normalizeSymbol(input.symbol!);
    name = stockMeta(symbol)?.name ?? symbol;
    if (name === symbol) {
      try { const q = (await getQuotes([symbol]))[symbol]; if (q?.name) name = q.name; } catch { /* market unavailable: keep symbol */ }
    }
  } else {
    scheme = input.schemeCode!;
    name = `Fund ${scheme}`;
    try { name = (await getFundDetail(scheme)).name || name; } catch { /* keep generic */ }
  }
  return { name, symbol, scheme };
}

export async function addHolding(userId: string, input: HoldingInput): Promise<Holding> {
  const { name, symbol, scheme } = await resolveHolding(input);
  const id = randomUUID();
  await holdings().insertOne({ _id: id, user_id: userId, type: input.type, symbol, scheme_code: scheme, name, quantity: input.quantity, avg_price: input.avgPrice, buy_date: input.buyDate ?? null, created_at: new Date().toISOString() });
  const row = (await listHoldingRows(userId)).find((r) => r.id === id)!;
  return buildHolding(row, null, null);
}

/** Replace a holding's fields. Returns null if it does not exist or belongs to someone else. */
export async function updateHolding(userId: string, id: string, input: HoldingInput): Promise<Holding | null> {
  if (!(await holdings().findOne({ _id: id, user_id: userId }, { projection: { _id: 1 } }))) return null;
  const { name, symbol, scheme } = await resolveHolding(input);
  await holdings().updateOne({ _id: id, user_id: userId }, { $set: { type: input.type, symbol, scheme_code: scheme, name, quantity: input.quantity, avg_price: input.avgPrice, buy_date: input.buyDate ?? null } });
  const row = (await listHoldingRows(userId)).find((r) => r.id === id);
  return row ? buildHolding(row, null, null) : null;
}

export async function deleteHolding(userId: string, id: string): Promise<boolean> {
  return (await holdings().deleteOne({ _id: id, user_id: userId })).deletedCount > 0;
}

// ---------- view ----------
const r2 = (n: number) => Math.round(n * 100) / 100;

function buildHolding(row: HoldingRow, price: { last: number; dayChangePerUnit: number | null; asOf: string } | null, sector: string | null): Holding {
  const invested = r2(row.quantity * row.avg_price);
  const value = price ? r2(row.quantity * price.last) : null;
  const pnl = value !== null ? r2(value - invested) : null;
  return {
    id: row.id, type: row.type, symbol: row.symbol, schemeCode: row.scheme_code, name: row.name,
    quantity: row.quantity, avgPrice: row.avg_price, lastPrice: price?.last ?? null, invested, value,
    pnl, pnlPct: pnl !== null && invested > 0 ? r2((pnl / invested) * 100) : null,
    dayChange: price && price.dayChangePerUnit !== null ? r2(price.dayChangePerUnit * row.quantity) : null,
    sector, priceAsOf: price?.asOf ?? null,
  };
}

export async function getPortfolioView(userId: string): Promise<PortfolioView> {
  const rows = await listHoldingRows(userId);
  const stockSyms = [...new Set(rows.filter((r) => r.type === 'stock' && r.symbol).map((r) => r.symbol!))];
  let quotes: Record<string, Quote> = {};
  if (stockSyms.length) { try { quotes = (await getQuotes(stockSyms)) ?? {}; } catch { quotes = {}; } }

  const fundCodes = [...new Set(rows.filter((r) => r.type === 'fund' && r.scheme_code).map((r) => r.scheme_code!))];
  const funds = new Map<number, { last: number; dayChangePerUnit: number | null; asOf: string }>();
  await Promise.all(fundCodes.map(async (code) => {
    try {
      const f = await getFundDetail(code);
      const s = f.series;
      const prev = s && s.length >= 2 ? s[s.length - 2]!.c : null;
      funds.set(code, { last: f.nav, dayChangePerUnit: prev !== null ? f.nav - prev : null, asOf: f.asOf });
    } catch { /* leave null */ }
  }));

  const holdings = rows.map((row) => {
    if (row.type === 'stock' && row.symbol) {
      const q = quotes[row.symbol];
      return buildHolding(row, q && Number.isFinite(q.price) ? { last: q.price, dayChangePerUnit: Number.isFinite(q.change) ? q.change : null, asOf: q.asOf } : null, stockMeta(row.symbol)?.sector ?? null);
    }
    return buildHolding(row, row.scheme_code ? funds.get(row.scheme_code) ?? null : null, null);
  });

  const invested = holdings.reduce((a, h) => a + h.invested, 0);
  // Totals count priced holdings' value; unpriced holdings are carried at cost so totals stay meaningful.
  const value = holdings.reduce((a, h) => a + (h.value ?? h.invested), 0);
  const pnl = value - invested;
  return {
    asOf: new Date().toISOString(), holdings,
    totals: { invested: r2(invested), value: r2(value), pnl: r2(pnl), pnlPct: invested > 0 ? r2((pnl / invested) * 100) : 0, dayChange: r2(holdings.reduce((a, h) => a + (h.dayChange ?? 0), 0)) },
  };
}

// ---------- health (deterministic) ----------
const t = (lang: Lang, en: string, hi: string) => (lang === 'hi' ? hi : en);
const pctStr = (n: number) => `${Math.round(n)}%`;

export interface HealthHolding { name: string; type: 'stock' | 'fund'; sector: string | null; weight: number; pnlPct: number | null }

export function computeHealth(items: HealthHolding[], lang: Lang, asOf = new Date().toISOString()): PortfolioHealth {
  const disclaimer = DISCLAIMER[lang];
  const total = items.reduce((a, h) => a + h.weight, 0);
  if (!items.length || total <= 0) {
    return {
      asOf, score: 0, label: t(lang, 'No holdings yet', 'अभी कोई निवेश नहीं जोड़ा'),
      concentration: { topHoldingPct: 0, top3Pct: 0, hhi: 0, sectorWeights: [] },
      issues: [],
      suggestions: [
        t(lang, 'Add your first holding to see how balanced your portfolio is. You can start with something you already own.', 'आपका पोर्टफ़ोलियो कितना संतुलित है, यह देखने के लिए अपना पहला निवेश जोड़ें। जो आपके पास पहले से है, उसी से शुरू करें।'),
        t(lang, 'Not invested yet? Try the Planner to see an example split across asset types.', 'अभी निवेश नहीं किया? एसेट के प्रकार के बीच बँटवारे का उदाहरण देखने के लिए प्लानर आज़माएँ।'),
      ],
      empty: true, disclaimer,
    };
  }

  const w = items.map((h) => ({ ...h, pct: (h.weight / total) * 100 })).sort((a, b) => b.pct - a.pct);
  const topHoldingPct = w[0]!.pct;
  const top3Pct = w.slice(0, 3).reduce((a, h) => a + h.pct, 0);
  const hhi = Math.round(w.reduce((a, h) => a + h.pct * h.pct, 0)); // 0..10000

  const bucket: Record<string, number> = {};
  for (const h of w) {
    const k = h.type === 'fund' ? 'Mutual funds' : h.sector ?? 'Other / unclassified';
    bucket[k] = (bucket[k] ?? 0) + h.pct;
  }
  const sectorWeights = Object.entries(bucket).map(([sector, pct]) => ({ sector, pct: r2(pct) })).sort((a, b) => b.pct - a.pct);
  const topSector = sectorWeights.find((s) => s.sector !== 'Mutual funds' && s.sector !== 'Other / unclassified');

  const issues: HealthIssue[] = [];
  const suggestions: string[] = [];
  let score = 100;
  const fundShare = w.filter((h) => h.type === 'fund').reduce((a, h) => a + h.pct, 0);
  const count = items.length;

  if (count === 1) {
    score -= 25;
    issues.push({
      severity: 'important',
      title: t(lang, 'Everything is in one holding', 'पूरा पैसा एक ही निवेश में है'),
      detail: t(lang, `All of your money (${pctStr(100)}) is in ${w[0]!.name}. If it falls, your whole portfolio falls with it.`, `आपका पूरा पैसा (100%) ${w[0]!.name} में है। अगर यह गिरता है तो आपका पूरा पोर्टफ़ोलियो गिरेगा।`),
      action: t(lang, 'Consider spreading future investments across a few different companies or a diversified index fund.', 'आगे के निवेश को कुछ अलग कंपनियों या एक विविध इंडेक्स फ़ंड में बाँटने पर विचार करें।'),
    });
  } else if (topHoldingPct > 25) {
    const big = topHoldingPct > 50;
    const mid = topHoldingPct > 35;
    score -= big ? 25 : mid ? 15 : 8;
    issues.push({
      severity: big ? 'important' : 'watch',
      title: t(lang, 'One holding is a large share', 'एक निवेश का हिस्सा बहुत बड़ा है'),
      detail: t(lang, `${w[0]!.name} is about ${pctStr(topHoldingPct)} of your portfolio. A bad year for it would hurt a lot.`, `${w[0]!.name} आपके पोर्टफ़ोलियो का लगभग ${pctStr(topHoldingPct)} है। इसके ख़राब साल का असर आप पर बहुत पड़ेगा।`),
      action: t(lang, 'Consider directing new money to your other holdings instead of adding more here.', 'नया पैसा इसमें और डालने के बजाय अपने बाक़ी निवेशों में लगाने पर विचार करें।'),
    });
  }

  if (count > 3 && top3Pct > 80) {
    score -= 8;
    issues.push({
      severity: 'watch',
      title: t(lang, 'Top three holdings dominate', 'शीर्ष तीन निवेश ही हावी हैं'),
      detail: t(lang, `Your three biggest holdings make up about ${pctStr(top3Pct)} of the total, so the smaller ones barely matter.`, `आपके तीन सबसे बड़े निवेश कुल का लगभग ${pctStr(top3Pct)} हैं, इसलिए छोटे निवेशों का असर बहुत कम है।`),
      action: t(lang, 'Consider spreading new money more evenly.', 'नया पैसा अधिक बराबरी से बाँटने पर विचार करें।'),
    });
  }

  if (hhi > 2500) score -= 10; else if (hhi > 1800) score -= 5;

  if (count > 1 && count < 5 && fundShare < 50) {
    score -= 10;
    issues.push({
      severity: 'watch',
      title: t(lang, 'Only a few holdings', 'बहुत कम निवेश'),
      detail: t(lang, `You hold ${count} investments. With so few, one bad surprise has a big effect.`, `आपके पास ${count} निवेश हैं। इतने कम होने पर एक बुरी ख़बर का असर बड़ा होता है।`),
      action: t(lang, 'Consider a broad index fund or ETF, which holds many companies in one purchase.', 'एक व्यापक इंडेक्स फ़ंड या ETF पर विचार करें, जो एक ही ख़रीद में कई कंपनियाँ देता है।'),
    });
  }

  if (topSector && topSector.pct > 40) {
    score -= topSector.pct > 60 ? 15 : 10;
    issues.push({
      severity: topSector.pct > 60 ? 'important' : 'watch',
      title: t(lang, 'One sector is a big share', 'एक सेक्टर का हिस्सा बड़ा है'),
      detail: t(lang, `About ${pctStr(topSector.pct)} of your money is in ${topSector.sector}. Companies in the same sector often rise and fall together.`, `आपका लगभग ${pctStr(topSector.pct)} पैसा ${topSector.sector} सेक्टर में है। एक ही सेक्टर की कंपनियाँ अक्सर साथ-साथ चढ़ती-गिरती हैं।`),
      action: t(lang, 'Consider adding holdings from other sectors, or an index fund.', 'दूसरे सेक्टर के निवेश या एक इंडेक्स फ़ंड जोड़ने पर विचार करें।'),
    });
  }

  const losers = w.filter((h) => h.pnlPct !== null && h.pnlPct <= -20);
  if (losers.length) {
    score -= Math.min(12, losers.length * 4);
    const names = losers.slice(0, 3).map((h) => h.name).join(', ');
    issues.push({
      severity: losers.length >= 3 ? 'important' : 'watch',
      title: t(lang, 'Some holdings are well below your buy price', 'कुछ निवेश आपके ख़रीद भाव से काफ़ी नीचे हैं'),
      detail: t(lang, `${losers.length} holding(s) are down 20% or more: ${names}. A fall alone does not mean the business is bad, but it is worth a look.`, `${losers.length} निवेश 20% या उससे ज़्यादा नीचे हैं: ${names}। सिर्फ़ गिरावट का मतलब यह नहीं कि कंपनी ख़राब है, पर इन्हें देखना ज़रूरी है।`),
      action: t(lang, 'Consider reading the latest news and analysis for each one and asking whether your original reason still holds. Avoid deciding in a hurry.', 'हर एक की ताज़ा ख़बरें और विश्लेषण पढ़ें और सोचें कि ख़रीदने का आपका कारण अब भी सही है या नहीं। जल्दबाज़ी में फ़ैसला न लें।'),
    });
  }

  if (count > 30) {
    score -= 3;
    issues.push({
      severity: 'info',
      title: t(lang, 'Very many holdings', 'बहुत ज़्यादा निवेश'),
      detail: t(lang, `With ${count} holdings it is hard to keep track of each one.`, `${count} निवेश होने पर हर एक पर नज़र रखना कठिन है।`),
      action: t(lang, 'Consider whether some small positions could be combined into a fund.', 'सोचें कि क्या कुछ छोटे निवेशों को एक फ़ंड में समेटा जा सकता है।'),
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 80 ? t(lang, 'Well balanced', 'अच्छी तरह संतुलित')
    : score >= 60 ? t(lang, 'Reasonably balanced', 'ठीक-ठाक संतुलित')
    : score >= 40 ? t(lang, 'Needs attention', 'ध्यान देने की ज़रूरत')
    : t(lang, 'Needs care', 'सावधानी की ज़रूरत');

  if (!issues.length) {
    suggestions.push(t(lang, 'Your portfolio looks reasonably spread out. Review it once in a while rather than every day.', 'आपका पोर्टफ़ोलियो ठीक से फैला हुआ दिखता है। इसे रोज़ नहीं, कभी-कभार देखना काफ़ी है।'));
  } else {
    suggestions.push(t(lang, 'Consider directing new investments to the under-represented parts of your portfolio before changing what you already hold.', 'जो आपके पास है उसे बदलने से पहले, नया निवेश पोर्टफ़ोलियो के कम-हिस्से वाले भागों में लगाने पर विचार करें।'));
  }
  if (fundShare < 20) suggestions.push(t(lang, 'A low-cost Nifty 50 index fund or ETF can add instant diversification. Compare costs before choosing.', 'कम ख़र्च वाला निफ़्टी 50 इंडेक्स फ़ंड या ETF तुरंत विविधता देता है। चुनने से पहले ख़र्च की तुलना करें।'));
  suggestions.push(t(lang, 'Keep an emergency fund (several months of expenses) outside the market before adding more risk.', 'बाज़ार में और जोखिम लेने से पहले आपातकालीन फ़ंड (कई महीनों का ख़र्च) बाज़ार से बाहर रखें।'));

  return {
    asOf, score, label,
    concentration: { topHoldingPct: r2(topHoldingPct), top3Pct: r2(top3Pct), hhi, sectorWeights },
    issues, suggestions, empty: false, disclaimer,
  };
}

export async function getPortfolioHealth(userId: string, lang?: Lang): Promise<PortfolioHealth> {
  const l: Lang = lang ?? (await getProfile(userId)).language;
  const view = await getPortfolioView(userId);
  const items: HealthHolding[] = view.holdings.map((h) => ({ name: h.name, type: h.type, sector: h.sector, weight: h.value ?? h.invested, pnlPct: h.pnlPct }));
  return computeHealth(items, l);
}
