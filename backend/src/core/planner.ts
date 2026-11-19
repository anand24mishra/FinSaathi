import { z } from 'zod';
import { DISCLAIMER, type Goal, type Lang, type Plan, type PlanInstrument, type PlanLine, type PlanRequest, type Quote, type RiskLevel } from '../../../shared/contract';
import { getQuotes, getSeries } from '../market/service';

export const planRequestSchema = z.object({
  capital: z.number().min(1000, 'Capital should be at least ₹1,000').max(1e10),
  monthlySip: z.number().min(0).max(1e9).optional(),
  riskLevel: z.enum(['conservative', 'balanced', 'growth']),
  horizonYears: z.number().int().min(1).max(50),
  goal: z.enum(['retirement', 'child_education', 'house', 'emergency', 'wealth', 'regular_income']),
});

/** Split an integer total proportionally to weights; result is whole numbers that sum exactly to total. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || !weights.length) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k]!.i]!++;
  return out;
}

const EQUITY_TABLE: { maxYears: number; eq: Record<RiskLevel, number> }[] = [
  { maxYears: 1, eq: { conservative: 0, balanced: 5, growth: 10 } },
  { maxYears: 3, eq: { conservative: 10, balanced: 25, growth: 35 } },
  { maxYears: 5, eq: { conservative: 20, balanced: 40, growth: 55 } },
  { maxYears: 10, eq: { conservative: 30, balanced: 55, growth: 70 } },
  { maxYears: Infinity, eq: { conservative: 40, balanced: 65, growth: 80 } },
];

export function targetAllocation(req: PlanRequest): { equity: number; gold: number; silver: number; debt: number; liquid: number } {
  const row = EQUITY_TABLE.find((r) => req.horizonYears <= r.maxYears)!;
  let equity = row.eq[req.riskLevel];
  const { goal, horizonYears } = req;
  if ((goal === 'retirement' || goal === 'wealth') && horizonYears >= 7) equity += 5;
  if ((goal === 'child_education' || goal === 'house') && horizonYears <= 5) equity -= 5;
  if (goal === 'regular_income') equity -= 10;
  if (goal === 'emergency') equity = Math.min(equity, 10);
  equity = Math.max(0, Math.min(85, equity));

  let gold = req.riskLevel === 'growth' ? 8 : 10;
  let silver = req.riskLevel === 'growth' && horizonYears >= 5 && goal !== 'emergency' ? 3 : 0;
  if (goal === 'emergency') { gold = 5; silver = 0; }
  gold = Math.max(5, Math.min(15, gold));

  const rest = 100 - equity - gold - silver;
  const liquidShare = horizonYears <= 3 || goal === 'emergency' ? 0.6 : 0.3;
  const liquid = Math.round(rest * liquidShare);
  return { equity, gold, silver, debt: rest - liquid, liquid };
}

type Txt = { en: string; hi: string };
const T = (en: string, hi: string): Txt => ({ en, hi });

const LINE_WHY: Record<PlanLine['assetClass'], Txt> = {
  equity: T('Shares and equity index funds have historically grown more than other options over long periods, but they can fall sharply in the short term.', 'शेयर और इक्विटी इंडेक्स फ़ंड लंबे समय में आम तौर पर बाक़ी विकल्पों से ज़्यादा बढ़े हैं, पर छोटी अवधि में तेज़ गिर भी सकते हैं।'),
  debt: T('Debt options (bond funds, FDs, PPF/NPS) aim for steadier, lower-risk growth and cushion the ups and downs of shares.', 'डेट विकल्प (बॉन्ड फ़ंड, FD, PPF/NPS) अपेक्षाकृत स्थिर और कम जोखिम वाली बढ़त का लक्ष्य रखते हैं और शेयरों के उतार-चढ़ाव को सँभालते हैं।'),
  gold: T('Gold often behaves differently from shares, so a small slice can soften bad periods. Its price can also stay flat for years.', 'सोना अक्सर शेयरों से अलग चलता है, इसलिए छोटा हिस्सा बुरे दौर को हल्का कर सकता है। इसका भाव सालों तक स्थिर भी रह सकता है।'),
  silver: T('Silver is a small diversifier. It is more volatile than gold, so the slice is kept small.', 'चाँदी एक छोटा विविधीकरण है। यह सोने से ज़्यादा ऊपर-नीचे होती है, इसलिए हिस्सा छोटा रखा गया है।'),
  liquid: T('Money you may need soon should sit somewhere safe and easy to withdraw, such as a liquid fund.', 'जिस पैसे की जल्दी ज़रूरत पड़ सकती है, उसे सुरक्षित और आसानी से निकलने वाली जगह, जैसे लिक्विड फ़ंड, में रखें।'),
  international: T('Spreads risk outside India.', 'जोखिम को भारत के बाहर भी बाँटता है।'),
};

interface InstrDef {
  key: string; name: Txt; kind: PlanInstrument['kind']; symbol?: string; weight: number; why: Txt;
}
const QUOTED = {
  nifty50: { symbol: 'NIFTYBEES.NS', name: T('Nifty 50 index ETF (NIFTYBEES)', 'निफ़्टी 50 इंडेक्स ETF (NIFTYBEES)'), why: T('Holds India\'s 50 largest listed companies in one purchase, with a low running cost. A simple core holding.', 'भारत की 50 सबसे बड़ी सूचीबद्ध कंपनियाँ एक ही ख़रीद में, कम ख़र्च के साथ। एक सरल मुख्य निवेश।') },
  next50: { symbol: 'JUNIORBEES.NS', name: T('Nifty Next 50 index ETF (JUNIORBEES)', 'निफ़्टी नेक्स्ट 50 इंडेक्स ETF (JUNIORBEES)'), why: T('Next 50 large companies after the Nifty 50. Can grow faster but also swings more.', 'निफ़्टी 50 के बाद की 50 बड़ी कंपनियाँ। तेज़ बढ़ सकती हैं, पर ज़्यादा उतार-चढ़ाव भी होता है।') },
  midcap: { symbol: 'MID150BEES.NS', name: T('Nifty Midcap 150 index ETF (MID150BEES)', 'निफ़्टी मिडकैप 150 इंडेक्स ETF (MID150BEES)'), why: T('Mid-sized companies. Higher growth potential, higher risk; suitable only for money you will not need for many years.', 'मध्यम आकार की कंपनियाँ। बढ़त की संभावना ज़्यादा, जोखिम भी ज़्यादा; केवल उस पैसे के लिए जो कई साल नहीं चाहिए।') },
  gold: { symbol: 'GOLDBEES.NS', name: T('Gold ETF (GOLDBEES)', 'गोल्ड ETF (GOLDBEES)'), why: T('Tracks the domestic gold price and trades like a share, so no physical storage is needed.', 'घरेलू सोने के भाव का अनुसरण करता है और शेयर की तरह ख़रीदा-बेचा जाता है; भौतिक सोना रखने की ज़रूरत नहीं।') },
  silver: { symbol: 'SILVERBEES.NS', name: T('Silver ETF (SILVERBEES)', 'सिल्वर ETF (SILVERBEES)'), why: T('Tracks the silver price. Volatile, so keep it small.', 'चाँदी के भाव का अनुसरण करता है। काफ़ी उतार-चढ़ाव वाली है, इसलिए छोटा रखें।') },
};
const RATES = T('Check current interest rates and returns from the provider before investing; we do not quote them here.', 'निवेश से पहले ब्याज दरें और रिटर्न सीधे प्रदाता से जाँचें; हम यहाँ इन्हें नहीं बताते।');
const NONQ = {
  liquid: { name: T('Liquid mutual fund (or a bank sweep / savings account)', 'लिक्विड म्यूचुअल फ़ंड (या बैंक स्वीप / बचत खाता)'), why: T('Easy to withdraw and low risk, though not risk-free. ', 'निकालना आसान और जोखिम कम, पर बिल्कुल जोखिम-रहित नहीं। ') },
  debtFund: { name: T('Short-duration / debt mutual fund', 'शॉर्ट-ड्यूरेशन / डेट म्यूचुअल फ़ंड'), why: T('Invests in bonds; value can move a little when interest rates change. ', 'बॉन्ड में निवेश करता है; ब्याज दरें बदलने पर मूल्य थोड़ा ऊपर-नीचे हो सकता है। ') },
  fd: { name: T('Bank fixed deposit (FD)', 'बैंक फ़िक्स्ड डिपॉज़िट (FD)'), why: T('Fixed term and predictable payout from the bank. Early withdrawal may carry a penalty. ', 'तय अवधि और बैंक से पहले से पता भुगतान। समय से पहले निकालने पर जुर्माना लग सकता है। ') },
  ppf: { name: T('PPF / NPS (long-term retirement-style savings)', 'PPF / NPS (लंबी अवधि की सेवानिवृत्ति-शैली बचत)'), why: T('Government-backed long-term savings with lock-ins and tax rules that change. ', 'सरकार समर्थित लंबी अवधि की बचत, जिसमें लॉक-इन है और कर-नियम बदलते रहते हैं। ') },
};

function cagrFrom(points: { t: number; c: number }[]): { years: number; cagrPct: number } | null {
  const p = points.filter((x) => Number.isFinite(x.t) && Number.isFinite(x.c) && x.c > 0);
  if (p.length < 2) return null;
  const first = p[0]!, last = p[p.length - 1]!;
  const years = (last.t - first.t) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return null;
  const cagr = (Math.pow(last.c / first.c, 1 / years) - 1) * 100;
  if (!Number.isFinite(cagr)) return null;
  return { years: Math.round(years * 10) / 10, cagrPct: Math.round(cagr * 10) / 10 };
}

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export async function buildPlan(req: PlanRequest, lang: Lang): Promise<Plan> {
  const L = (x: Txt) => x[lang];
  const tgt = targetAllocation(req);
  const cap = Math.round(req.capital);
  const tiny = cap < 25000;
  const small = cap < 100000;

  // Market data (best effort).
  const wanted = [QUOTED.nifty50.symbol, QUOTED.gold.symbol, ...(tgt.silver ? [QUOTED.silver.symbol] : []), QUOTED.next50.symbol, QUOTED.midcap.symbol];
  let quotes: Record<string, Quote> = {};
  try { quotes = (await getQuotes(wanted)) ?? {}; } catch { quotes = {}; }

  // Allocation lines (integer pcts; amounts sum to capital).
  const lineDefs: { assetClass: PlanLine['assetClass']; pct: number }[] = [
    { assetClass: 'equity', pct: tgt.equity }, { assetClass: 'debt', pct: tgt.debt }, { assetClass: 'liquid', pct: tgt.liquid },
    { assetClass: 'gold', pct: tgt.gold }, { assetClass: 'silver', pct: tgt.silver },
  ];
  let active = lineDefs.filter((l) => l.pct > 0);
  // Tiny capital: drop silver (fold into gold) to keep few instruments.
  if (tiny) {
    const s = active.find((l) => l.assetClass === 'silver');
    if (s) { active = active.filter((l) => l !== s); active.find((l) => l.assetClass === 'gold')!.pct += s.pct; }
  }
  const lineAmounts = allocate(cap, active.map((l) => l.pct));
  const allocation: PlanLine[] = active.map((l, i) => ({ assetClass: l.assetClass, pct: l.pct, amount: lineAmounts[i]!, why: L(LINE_WHY[l.assetClass]) }));

  // Instruments per line.
  const defsFor = (cls: PlanLine['assetClass']): InstrDef[] => {
    if (cls === 'equity') {
      const optionalOk = !tiny && !small && tgt.equity >= 30 && req.riskLevel !== 'conservative';
      const defs: InstrDef[] = [{ key: 'n50', ...QUOTED.nifty50, kind: 'index-etf', weight: 100, why: QUOTED.nifty50.why }];
      if (optionalOk && quotes[QUOTED.next50.symbol]) { defs[0]!.weight = 70; defs.push({ key: 'n2', ...QUOTED.next50, kind: 'index-etf', weight: 15, why: QUOTED.next50.why }); }
      if (optionalOk && req.riskLevel === 'growth' && quotes[QUOTED.midcap.symbol]) {
        const base = defs.find((d) => d.key === 'n50')!;
        base.weight = defs.length > 1 ? 60 : 85;
        if (defs.length > 1) defs.find((d) => d.key === 'n2')!.weight = 15;
        defs.push({ key: 'mid', ...QUOTED.midcap, kind: 'index-etf', weight: defs.length > 1 ? 25 : 15, why: QUOTED.midcap.why });
      }
      return defs;
    }
    if (cls === 'gold') return [{ key: 'gold', ...QUOTED.gold, kind: 'gold-etf', weight: 100, why: QUOTED.gold.why }];
    if (cls === 'silver') return [{ key: 'silver', ...QUOTED.silver, kind: 'silver-etf', weight: 100, why: QUOTED.silver.why }];
    if (cls === 'liquid') return [{ key: 'liq', name: NONQ.liquid.name, kind: 'liquid-fund', weight: 100, why: T(NONQ.liquid.why.en + RATES.en, NONQ.liquid.why.hi + RATES.hi) }];
    // debt
    const mk = (k: keyof typeof NONQ, kind: PlanInstrument['kind'], key: string, weight: number): InstrDef => ({ key, name: NONQ[k].name, kind, weight, why: T(NONQ[k].why.en + RATES.en, NONQ[k].why.hi + RATES.hi) });
    if (tiny) return [mk('debtFund', 'debt-fund', 'debt', 100)];
    if ((req.goal === 'retirement' || req.horizonYears >= 10) && !small) return [mk('debtFund', 'debt-fund', 'debt', 60), mk('ppf', 'ppf-nps', 'ppf', 40)];
    if (req.riskLevel === 'conservative' || req.horizonYears <= 3) return [mk('fd', 'fd', 'fd', 50), mk('debtFund', 'debt-fund', 'debt', 50)];
    return [mk('debtFund', 'debt-fund', 'debt', 100)];
  };

  const planned: { def: InstrDef; amount: number; pct: number }[] = [];
  for (const line of allocation) {
    const defs = defsFor(line.assetClass);
    const amounts = allocate(line.amount, defs.map((d) => d.weight));
    const pcts = allocate(line.pct * 10, defs.map((d) => d.weight)); // tenths of a percent
    defs.forEach((def, i) => planned.push({ def, amount: amounts[i]!, pct: pcts[i]! / 10 }));
  }

  // Real 5y history for quoted instruments.
  const quotedDefs = planned.filter((p) => p.def.symbol);
  const histories = await Promise.all(quotedDefs.map(async (p) => {
    try {
      const s = await getSeries(p.def.symbol!, '5y');
      const c = cagrFrom(s.points ?? []);
      return c ? { years: c.years, cagrPct: c.cagrPct, source: s.source, asOf: s.asOf } : null;
    } catch { return null; }
  }));
  const histBySymbol = new Map(quotedDefs.map((p, i) => [p.def.symbol!, histories[i]!]));

  const instruments: PlanInstrument[] = planned.map(({ def, amount, pct }) => {
    const q = def.symbol ? quotes[def.symbol] ?? null : null;
    let why = L(def.why);
    if (q && amount > 0 && amount < q.price) {
      why += lang === 'hi'
        ? ` ध्यान दें: एक यूनिट की क़ीमत लगभग ${inr(q.price)} है, जो इस हिस्से (${inr(amount)}) से ज़्यादा है। इन्हें पूरी यूनिट में ख़रीदा जाता है, इसलिए अगली किस्तों में जोड़ें या इस हिस्से को किसी म्यूचुअल फ़ंड SIP में लगाने पर विचार करें।`
        : ` Note: one unit costs about ${inr(q.price)}, more than this slice (${inr(amount)}). ETFs are bought in whole units, so consider topping up over time or using a mutual fund SIP for this slice.`;
    } else if (q && amount > 0 && amount < 4 * q.price) {
      why += lang === 'hi' ? ` ETF पूरी यूनिट में ख़रीदे जाते हैं (एक यूनिट लगभग ${inr(q.price)}), इसलिए असली राशि थोड़ी कम-ज़्यादा हो सकती है।` : ` ETFs are bought in whole units (about ${inr(q.price)} each), so the amount actually invested may differ slightly.`;
    }
    const inst: PlanInstrument = { name: L(def.name), kind: def.kind, pct, amount, why };
    if (def.symbol) { inst.symbol = def.symbol; inst.price = q; inst.pastReturn = histBySymbol.get(def.symbol) ?? null; }
    return inst;
  }).filter((i) => i.amount > 0);

  // SIP note
  let sip: Plan['sip'] = null;
  if (req.monthlySip && req.monthlySip > 0) {
    const m = Math.round(req.monthlySip);
    const eq = Math.round((m * tgt.equity) / 100);
    sip = {
      monthly: m,
      note: lang === 'hi'
        ? `हर महीने ${inr(m)} को इसी बँटवारे के अनुपात में लगाने पर विचार करें, यानी लगभग ${inr(eq)} इक्विटी में। SIP आपके पैसे को अलग-अलग समय पर लगाता है, पर मुनाफ़े की गारंटी नहीं देता। म्यूचुअल फ़ंड SIP अपने-आप कटती है; ETF आपको हर महीने ख़ुद ख़रीदने होंगे।`
        : `Consider investing ${inr(m)} each month in the same proportions, which puts about ${inr(eq)} into equity. A SIP spreads your buying over time but does not guarantee gains. Mutual fund SIPs debit automatically; ETFs you buy yourself each month.`,
    };
  }

  const horizonWord = lang === 'hi' ? `${req.horizonYears} साल` : `${req.horizonYears} year${req.horizonYears === 1 ? '' : 's'}`;
  const risks: string[] = lang === 'hi'
    ? [
        'शेयर और इक्विटी फ़ंड का मूल्य गिर सकता है, और कभी-कभी कई महीनों या सालों तक कम रह सकता है।',
        'पिछला प्रदर्शन भविष्य के रिटर्न की गारंटी नहीं है।',
        'महँगाई (मुद्रास्फीति) आपके पैसे की क्रय-शक्ति घटा सकती है, ख़ासकर बहुत सुरक्षित विकल्पों में।',
        'यह योजना सामान्य नियमों पर आधारित है; आपकी आय, क़र्ज़ और पारिवारिक ज़रूरतें इसमें शामिल नहीं हैं।',
      ]
    : [
        'Shares and equity funds can fall in value, sometimes staying low for months or years.',
        'Past performance does not guarantee future returns.',
        'Inflation can reduce what your money can buy, especially in very safe options.',
        'This plan follows general rules; it does not know your income, debts or family needs.',
      ];
  if (req.horizonYears <= 3 && tgt.equity > 0) risks.unshift(lang === 'hi' ? `आपका समय ${horizonWord} है, जो शेयरों के लिए छोटा है; इसी कारण इक्विटी का हिस्सा कम रखा गया है।` : `Your time frame is ${horizonWord}, which is short for shares, so the equity share is kept low.`);
  if (tiny) risks.push(lang === 'hi' ? 'छोटी राशि में ETF की पूरी यूनिट और ब्रोकरेज़/शुल्क कुल रकम का बड़ा हिस्सा हो सकते हैं।' : 'With a small amount, whole-unit ETF prices and fees can take a bigger bite of the total.');

  const emergencyFundNote = lang === 'hi'
    ? 'निवेश शुरू करने से पहले कम से कम 6 महीने का ज़रूरी ख़र्च बचत खाते या लिक्विड फ़ंड में अलग रखें। इस योजना का लिक्विड हिस्सा उस आपातकालीन फ़ंड की जगह नहीं लेता।'
    : 'Before you invest, keep at least 6 months of essential expenses aside in a savings account or liquid fund. The liquid slice in this plan is not a substitute for that emergency fund.';
  const rebalanceRule = lang === 'hi'
    ? 'साल में एक बार जाँचें। अगर कोई हिस्सा योजना से लगभग 5 प्रतिशत-अंक से ज़्यादा हट जाए, तो बेचने के बजाय नया पैसा कम पड़े हिस्से में लगाने पर विचार करें।'
    : 'Review once a year. If any part drifts more than about 5 percentage points from the plan, consider directing new money to the part that fell behind instead of selling.';
  const hasEtf = instruments.some((i) => i.symbol);
  const stepsToStart: string[] = lang === 'hi'
    ? [
        'KYC पूरा करें (आधार, पैन, बैंक खाता)।',
        ...(hasEtf ? ['ETF के लिए किसी सेबी-पंजीकृत ब्रोकर के साथ डीमैट खाता खोलें। शुल्क की तुलना करें।'] : []),
        'म्यूचुअल फ़ंड के लिए "डायरेक्ट" प्लान देखें, जिसमें आम तौर पर ख़र्च कम होता है।',
        'पहले आपातकालीन फ़ंड अलग करें, फिर बाक़ी राशि चरणों में लगाने पर विचार करें।',
        'सभी निवेश का रिकॉर्ड इस ऐप के पोर्टफ़ोलियो में रखें और साल में एक बार जाँचें।',
        'बड़ी राशि लगाने से पहले किसी सेबी-पंजीकृत सलाहकार से बात करें।',
      ]
    : [
        'Complete KYC (Aadhaar, PAN, bank account).',
        ...(hasEtf ? ['For ETFs, open a demat account with a SEBI-registered broker. Compare charges.'] : []),
        'For mutual funds, look at "Direct" plans, which usually have lower costs.',
        'Set aside the emergency fund first, then consider investing the rest in stages rather than all at once.',
        'Record every investment in this app\'s Portfolio and review once a year.',
        'Talk to a SEBI-registered adviser before committing a large amount.',
      ];

  return { asOf: new Date().toISOString(), request: req, allocation, instruments, sip, emergencyFundNote, rebalanceRule, risks, stepsToStart, disclaimer: DISCLAIMER[lang] };
}

export type { Goal };
