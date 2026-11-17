// "Buffett lens": quality and value. Rules ported (not code) from the MIT-licensed virattt/ai-hedge-fund Warren Buffett agent
// (durable high ROE, low debt, healthy margins, growth, sensible price, margin of safety), adapted to the fields we actually have
// (single-period ratios from Yahoo; no multi-year history, so "sustained" is approximated by the current TTM figure).
import { assemble, band, isFinancial, num, type Crit, type L2, type LensContext, type LensFundamentals, type LensResult } from './common';

/** ASSUMPTION (not live data): India 10-year government bond yield, rounded. Used only as the hurdle for the earnings-yield check. Update by hand. */
export const RISK_FREE_PCT = 7;
export const BUFFETT_LABEL: L2 = { en: 'Buffett lens: quality & value', hi: 'बफ़ेट नज़रिया: गुणवत्ता और मूल्य' };

export function buffettLens(f: LensFundamentals | null, ctx: LensContext): LensResult {
  const head: L2 = { en: 'Quality & value score', hi: 'गुणवत्ता और मूल्य स्कोर' };
  const missing: L2 = { en: 'Not enough company numbers (ROE, margins, P/E) to apply this lens.', hi: 'इस नज़रिये के लिए कंपनी के पर्याप्त आँकड़े (ROE, मार्जिन, P/E) नहीं मिले।' };
  if (!f) return assemble([], 7, 4, head, missing);
  const crits: Crit[] = [];
  if (f.roePct != null) crits.push(band({ key: 'roe', label: { en: 'ROE', hi: 'ROE' }, v: f.roePct, unit: '%', good: 15, fair: 10, max: 2,
    goodLine: { en: `ROE ${num(f.roePct)}% is above the 15% quality bar`, hi: `ROE ${num(f.roePct)}% है, जो 15% की गुणवत्ता-सीमा से ऊपर है` },
    weakLine: { en: `ROE only ${num(f.roePct)}%, below the 10% comfort level`, hi: `ROE सिर्फ़ ${num(f.roePct)}% है, 10% की आरामदायक सीमा से नीचे` },
    detail: { en: 'Return on equity: profit earned on shareholders\' money. Higher and steady is better.', hi: 'इक्विटी पर रिटर्न: शेयरधारकों के पैसे पर कमाया मुनाफ़ा। ज़्यादा और टिकाऊ बेहतर।' } }));
  if (f.debtToEquity != null && !isFinancial(ctx.sector)) crits.push(band({ key: 'de', label: { en: 'Debt/Equity', hi: 'कर्ज़/इक्विटी' }, v: f.debtToEquity, unit: '', good: 0.5, fair: 1, lowerBetter: true, max: 2, decimals: 2,
    goodLine: { en: `Debt/equity ${num(f.debtToEquity, 2)} is low (<0.5)`, hi: `कर्ज़/इक्विटी ${num(f.debtToEquity, 2)} कम है (<0.5)` },
    weakLine: { en: `Debt/equity ${num(f.debtToEquity, 2)} is heavy (above 1)`, hi: `कर्ज़/इक्विटी ${num(f.debtToEquity, 2)} भारी है (1 से ऊपर)` },
    detail: { en: 'Borrowings relative to owners\' capital. Not used for banks/insurers/lenders, where debt is part of the business.', hi: 'मालिकों की पूँजी के मुकाबले कर्ज़। बैंक/बीमा/कर्ज़ देने वाली कंपनियों के लिए इस्तेमाल नहीं, क्योंकि वहाँ कर्ज़ कारोबार का हिस्सा है।' } }));
  if (f.profitMarginPct != null) crits.push(band({ key: 'margin', label: { en: 'Net margin', hi: 'शुद्ध मार्जिन' }, v: f.profitMarginPct, unit: '%', good: 15, fair: 8, max: 2,
    goodLine: { en: `Net margin ${num(f.profitMarginPct)}% shows pricing power (>15%)`, hi: `शुद्ध मार्जिन ${num(f.profitMarginPct)}% अच्छी कमाई दिखाता है (>15%)` },
    weakLine: { en: `Net margin is thin at ${num(f.profitMarginPct)}%`, hi: `शुद्ध मार्जिन पतला है, ${num(f.profitMarginPct)}%` },
    detail: { en: 'Share of revenue left as profit.', hi: 'बिक्री का कितना हिस्सा मुनाफ़े के रूप में बचता है।' } }));
  if (f.revenueGrowthPct != null) crits.push(band({ key: 'growth', label: { en: 'Revenue growth', hi: 'बिक्री वृद्धि' }, v: f.revenueGrowthPct, unit: '%', good: 8, fair: 0, max: 2,
    goodLine: { en: `Revenue grew ${num(f.revenueGrowthPct)}% (>8%)`, hi: `बिक्री ${num(f.revenueGrowthPct)}% बढ़ी (>8%)` },
    weakLine: { en: `Revenue shrank ${num(Math.abs(f.revenueGrowthPct))}%`, hi: `बिक्री ${num(Math.abs(f.revenueGrowthPct))}% घटी` },
    detail: { en: 'Latest year-on-year revenue growth (a positive number is the minimum we want).', hi: 'सालाना आधार पर ताज़ा बिक्री वृद्धि (कम से कम सकारात्मक होनी चाहिए)।' } }));
  if (f.pe != null) {
    if (f.pe > 0) crits.push(band({ key: 'pe', label: { en: 'P/E', hi: 'P/E' }, v: f.pe, unit: '', good: 20, fair: 30, lowerBetter: true, max: 2,
      goodLine: { en: `P/E ${num(f.pe)} is reasonable (<20)`, hi: `P/E ${num(f.pe)} वाजिब है (<20)` },
      weakLine: { en: `P/E ${num(f.pe)} is expensive (above 30)`, hi: `P/E ${num(f.pe)} महँगा है (30 से ऊपर)` },
      detail: { en: 'Price paid per rupee of yearly profit.', hi: 'सालाना मुनाफ़े के हर रुपये के लिए चुकाया जा रहा भाव।' } }));
    else crits.push({ key: 'pe', label: { en: 'P/E', hi: 'P/E' }, value: `${num(f.pe)}`, rule: { en: 'loss-making', hi: 'घाटे में' }, pts: 0, max: 2, tone: 'weak',
      line: { en: `P/E ${num(f.pe)} means the company is not earning a profit`, hi: `P/E ${num(f.pe)} यानी कंपनी मुनाफ़ा नहीं कमा रही` }, detail: { en: 'Negative P/E: trailing earnings are negative.', hi: 'ऋणात्मक P/E: पिछले 12 महीनों की कमाई ऋणात्मक है।' } });
  }
  if (f.pb != null && f.pb > 0) crits.push(band({ key: 'pb', label: { en: 'P/B', hi: 'P/B' }, v: f.pb, unit: '', good: 3, fair: 6, lowerBetter: true, max: 2,
    goodLine: { en: `P/B ${num(f.pb)} is modest (<3)`, hi: `P/B ${num(f.pb)} कम है (<3)` },
    weakLine: { en: `P/B ${num(f.pb)} is rich (above 6)`, hi: `P/B ${num(f.pb)} ऊँचा है (6 से ऊपर)` },
    detail: { en: 'Price relative to the company\'s book value (net assets) per share.', hi: 'कंपनी की बही-क़ीमत (शुद्ध संपत्ति) प्रति शेयर के मुकाबले भाव।' } }));
  if (f.pe != null && f.pe > 0) {
    const ey = 100 / f.pe;
    const good = ey >= RISK_FREE_PCT, fair = !good && ey >= RISK_FREE_PCT * 0.6;
    crits.push({ key: 'mos', label: { en: 'Earnings yield', hi: 'कमाई-प्रतिफल' }, value: `${num(ey)}%`,
      rule: good ? { en: `>= ${RISK_FREE_PCT}% bond-yield assumption`, hi: `>= ${RISK_FREE_PCT}% बॉन्ड-प्रतिफल (अनुमान)` } : fair ? { en: `within 60% of the ${RISK_FREE_PCT}% bond-yield assumption`, hi: `${RISK_FREE_PCT}% बॉन्ड-प्रतिफल (अनुमान) के 60% के भीतर` } : { en: `below the ${RISK_FREE_PCT}% bond-yield assumption`, hi: `${RISK_FREE_PCT}% बॉन्ड-प्रतिफल (अनुमान) से कम` },
      pts: good ? 2 : fair ? 1 : 0, max: 2, tone: good ? 'good' : fair ? 'fair' : 'weak',
      line: good ? { en: `Earnings yield ${num(ey)}% beats the assumed ${RISK_FREE_PCT}% bond yield (margin of safety)`, hi: `कमाई-प्रतिफल ${num(ey)}% माने हुए ${RISK_FREE_PCT}% बॉन्ड-प्रतिफल से ज़्यादा है (सुरक्षा-गद्दी)` }
        : { en: `Earnings yield ${num(ey)}% is below the assumed ${RISK_FREE_PCT}% bond yield, so little margin of safety`, hi: `कमाई-प्रतिफल ${num(ey)}% माने हुए ${RISK_FREE_PCT}% बॉन्ड-प्रतिफल से कम है, यानी सुरक्षा-गद्दी कम` },
      detail: { en: `1/PE compared with a ${RISK_FREE_PCT}% bond yield. The ${RISK_FREE_PCT}% is an ASSUMPTION (approximate India 10-year government bond yield), not live data.`, hi: `1/PE की तुलना ${RISK_FREE_PCT}% बॉन्ड प्रतिफल से। ${RISK_FREE_PCT}% एक अनुमान है (भारत के 10-वर्षीय सरकारी बॉन्ड का लगभग प्रतिफल), लाइव आँकड़ा नहीं।` } });
  }
  return assemble(crits, 7, 4, head, missing);
}
