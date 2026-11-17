// "Jhunjhunwala lens": India-growth style. Rules adapted (not copied) from the MIT-licensed virattt/ai-hedge-fund Rakesh Jhunjhunwala agent:
// earnings/revenue growth, return on capital, profitability, structural-India themes, growth-adjusted valuation, dividends as a tiebreak.
// Limits: we only have the latest year-on-year revenue growth and the current profit margin (no multi-year series), so the
// "margin trend" is a level proxy and the "PEG" uses revenue growth instead of earnings growth.
import { assemble, band, num, type Crit, type L2, type LensContext, type LensFundamentals, type LensResult } from './common';

export const JHUN_LABEL: L2 = { en: 'Jhunjhunwala lens: India growth', hi: 'झुनझुनवाला नज़रिया: भारत की ग्रोथ' };

export type Theme = 'consumption' | 'financialisation' | 'infrastructure' | 'manufacturing';
/** ASSUMPTION TABLE (editorial judgement, not data): sector label -> structural India theme. Sectors absent here get no tailwind point. */
export const SECTOR_THEME: Record<string, Theme> = {
  FMCG: 'consumption', Consumer: 'consumption', 'Consumer Internet': 'consumption', Auto: 'consumption', Telecom: 'consumption', Aviation: 'consumption', Healthcare: 'consumption',
  'Consumer Defensive': 'consumption', 'Consumer Cyclical': 'consumption', 'Communication Services': 'consumption',
  Banking: 'financialisation', 'Financial Services': 'financialisation', Insurance: 'financialisation',
  Infrastructure: 'infrastructure', Power: 'infrastructure', Cement: 'infrastructure', Utilities: 'infrastructure', 'Real Estate': 'infrastructure',
  Defence: 'manufacturing', Pharma: 'manufacturing', Industrials: 'manufacturing', 'Metals & Mining': 'manufacturing', 'Basic Materials': 'manufacturing',
};
const THEME_LABEL: Record<Theme, L2> = {
  consumption: { en: 'domestic consumption', hi: 'घरेलू खपत' }, financialisation: { en: 'financialisation of savings', hi: 'बचत का वित्तीयकरण' },
  infrastructure: { en: 'infrastructure build-out', hi: 'बुनियादी ढाँचे का विस्तार' }, manufacturing: { en: 'manufacturing and self-reliance', hi: 'विनिर्माण और आत्मनिर्भरता' },
};

export function jhunjhunwalaLens(f: LensFundamentals | null, ctx: LensContext): LensResult {
  const head: L2 = { en: 'India-growth score', hi: 'भारत-ग्रोथ स्कोर' };
  const missing: L2 = { en: 'Not enough company numbers (growth, ROE, margins) to apply this lens.', hi: 'इस नज़रिये के लिए कंपनी के पर्याप्त आँकड़े (ग्रोथ, ROE, मार्जिन) नहीं मिले।' };
  if (!f) return assemble([], 7, 3, head, missing);
  const crits: Crit[] = [];
  if (f.revenueGrowthPct != null) {
    const v = f.revenueGrowthPct;
    const pts = v >= 15 ? 4 : v >= 8 ? 2 : v > 0 ? 1 : 0, tone = v >= 15 ? 'good' : v > 0 ? 'fair' : 'weak';
    crits.push({ key: 'growth', label: { en: 'Revenue growth', hi: 'बिक्री वृद्धि' }, value: `${num(v)}%`, pts, max: 4, tone,
      rule: v >= 15 ? { en: '>15% strong', hi: '>15% मज़बूत' } : v >= 8 ? { en: '8-15% decent', hi: '8-15% ठीक' } : v > 0 ? { en: '0-8% slow', hi: '0-8% धीमी' } : { en: 'shrinking', hi: 'घट रही' },
      line: v >= 15 ? { en: `Revenue growing ${num(v)}% a year, a compounding profile`, hi: `बिक्री ${num(v)}% सालाना बढ़ रही है, यानी चक्रवृद्धि वाली चाल` } : { en: `Revenue growth is only ${num(v)}%, weak for a growth style`, hi: `बिक्री वृद्धि सिर्फ़ ${num(v)}% है, ग्रोथ-शैली के लिए कमज़ोर` },
      detail: { en: 'Latest year-on-year revenue growth; the heaviest weight in this lens.', hi: 'ताज़ा सालाना बिक्री वृद्धि; इस नज़रिये में सबसे ज़्यादा वज़न।' } });
  }
  if (f.roePct != null) crits.push(band({ key: 'roe', label: { en: 'ROE', hi: 'ROE' }, v: f.roePct, unit: '%', good: 18, fair: 12, max: 2,
    goodLine: { en: `ROE ${num(f.roePct)}% means capital is used well (>18%)`, hi: `ROE ${num(f.roePct)}% यानी पूँजी का अच्छा इस्तेमाल (>18%)` },
    weakLine: { en: `ROE is low at ${num(f.roePct)}% (<12%)`, hi: `ROE कम है, ${num(f.roePct)}% (<12%)` },
    detail: { en: 'Return on equity.', hi: 'इक्विटी पर रिटर्न।' } }));
  if (f.profitMarginPct != null) crits.push(band({ key: 'margin', label: { en: 'Profit margin (trend proxy)', hi: 'मुनाफ़ा मार्जिन (रुझान का अंदाज़ा)' }, v: f.profitMarginPct, unit: '%', good: 15, fair: 8, max: 2,
    goodLine: { en: `Profit margin ${num(f.profitMarginPct)}% leaves room to reinvest (>15%)`, hi: `मुनाफ़ा मार्जिन ${num(f.profitMarginPct)}% है, दोबारा निवेश की गुंजाइश (>15%)` },
    weakLine: { en: `Profit margin ${num(f.profitMarginPct)}% is thin`, hi: `मुनाफ़ा मार्जिन ${num(f.profitMarginPct)}% पतला है` },
    detail: { en: 'We only have the current margin, not its multi-year trend, so the level is used as a proxy.', hi: 'हमारे पास सिर्फ़ मौजूदा मार्जिन है, कई सालों का रुझान नहीं, इसलिए स्तर को अंदाज़े के तौर पर लिया है।' } }));
  const theme = ctx.sector ? SECTOR_THEME[ctx.sector] : undefined;
  if (ctx.sector) {
    const tl = theme ? THEME_LABEL[theme] : null;
    crits.push({ key: 'sector', label: { en: 'Sector theme', hi: 'सेक्टर थीम' }, value: ctx.sector, pts: theme ? 2 : 0, max: 2, tone: theme ? 'good' : 'fair',
      rule: tl ? { en: `${tl.en} tailwind (assumption)`, hi: `${tl.hi} का सहारा (अनुमान)` } : { en: 'no structural-theme flag (assumption)', hi: 'कोई ढाँचागत थीम नहीं (अनुमान)' },
      line: tl ? { en: `${ctx.sector} sits on the ${tl.en} theme (editorial assumption)`, hi: `${ctx.sector} सेक्टर ${tl.hi} की थीम पर है (संपादकीय अनुमान)` } : { en: '', hi: '' },
      detail: { en: 'Sector-to-theme mapping is a documented editorial assumption, not data.', hi: 'सेक्टर और थीम का मेल एक दर्ज किया हुआ संपादकीय अनुमान है, आँकड़ा नहीं।' } });
  }
  if (f.pe != null && f.pe > 0 && f.revenueGrowthPct != null) {
    if (f.revenueGrowthPct > 0) {
      const peg = f.pe / f.revenueGrowthPct;
      const good = peg <= 1.5, fair = !good && peg <= 2.5;
      crits.push({ key: 'peg', label: { en: 'P/E to growth', hi: 'P/E बनाम ग्रोथ' }, value: num(peg), pts: good ? 3 : fair ? 1.5 : 0, max: 3, tone: good ? 'good' : fair ? 'fair' : 'weak',
        rule: good ? { en: '<=1.5 not stretched', hi: '<=1.5 खिंचा नहीं' } : fair ? { en: '1.5-2.5 fair', hi: '1.5-2.5 ठीक' } : { en: '>2.5 stretched', hi: '>2.5 खिंचा हुआ' },
        line: good ? { en: `P/E ${num(f.pe)} against ${num(f.revenueGrowthPct)}% growth (ratio ${num(peg)}) is not stretched`, hi: `P/E ${num(f.pe)} और ${num(f.revenueGrowthPct)}% ग्रोथ (अनुपात ${num(peg)}) खिंचा हुआ नहीं` }
          : { en: `P/E ${num(f.pe)} for only ${num(f.revenueGrowthPct)}% growth (ratio ${num(peg)}) looks stretched`, hi: `सिर्फ़ ${num(f.revenueGrowthPct)}% ग्रोथ पर P/E ${num(f.pe)} (अनुपात ${num(peg)}) खिंचा हुआ लगता है` },
        detail: { en: 'PEG-like ratio: P/E divided by revenue growth % (revenue is used because earnings growth is not available).', hi: 'PEG जैसा अनुपात: P/E को बिक्री वृद्धि % से भाग (कमाई की वृद्धि उपलब्ध नहीं, इसलिए बिक्री ली है)।' } });
    } else {
      crits.push({ key: 'peg', label: { en: 'P/E to growth', hi: 'P/E बनाम ग्रोथ' }, value: `P/E ${num(f.pe)}`, pts: 0, max: 3, tone: 'weak', rule: { en: 'no growth to justify P/E', hi: 'P/E को सही ठहराने वाली ग्रोथ नहीं' },
        line: { en: `P/E ${num(f.pe)} with revenue growth of ${num(f.revenueGrowthPct)}% has no growth to justify it`, hi: `${num(f.revenueGrowthPct)}% बिक्री वृद्धि पर P/E ${num(f.pe)} को सही ठहराने वाली ग्रोथ नहीं` },
        detail: { en: 'Growth is zero or negative, so a growth-adjusted valuation cannot pass.', hi: 'ग्रोथ शून्य या ऋणात्मक है, इसलिए ग्रोथ-समायोजित मूल्यांकन पास नहीं होता।' } });
    }
  }
  if (f.dividendYieldPct != null) {
    const y = f.dividendYieldPct;
    crits.push({ key: 'div', label: { en: 'Dividend yield (tiebreak)', hi: 'डिविडेंड यील्ड (टाई-ब्रेक)' }, value: `${num(y)}%`, pts: y >= 1 ? 1 : 0, max: 1, tone: y >= 1 ? 'good' : 'fair',
      rule: y >= 1 ? { en: '>=1% pays out', hi: '>=1% डिविडेंड देती है' } : { en: '<1% little payout', hi: '<1% कम डिविडेंड' },
      line: { en: `Dividend yield ${num(y)}% adds a small cushion`, hi: `डिविडेंड यील्ड ${num(y)}% थोड़ी गद्दी देती है` },
      detail: { en: 'Used only as a tiebreak (max 1 point).', hi: 'सिर्फ़ टाई-ब्रेक के लिए (अधिकतम 1 अंक)।' } });
  }
  if (ctx.trend) {
    const up = ctx.trend === 'up';
    crits.push({ key: 'trend', label: { en: 'Price trend', hi: 'भाव का रुझान' }, value: ctx.trend === 'up' ? 'up' : ctx.trend === 'down' ? 'down' : 'sideways', pts: up ? 1 : 0, max: 1, tone: up ? 'good' : ctx.trend === 'down' ? 'weak' : 'fair',
      rule: up ? { en: 'price above its long averages', hi: 'भाव लंबी औसत से ऊपर' } : { en: 'not in an uptrend', hi: 'तेज़ी का रुझान नहीं' },
      line: up ? { en: 'Price is in an uptrend (above its 50 and 200-day averages)', hi: 'भाव तेज़ी के रुझान में है (50 और 200 दिन की औसत से ऊपर)' } : { en: 'Price is not in an uptrend (50/200-day averages)', hi: 'भाव तेज़ी के रुझान में नहीं है (50/200 दिन की औसत)' },
      detail: { en: 'He respected market trends; one point for an uptrend.', hi: 'बाज़ार के रुझान का सम्मान; तेज़ी के रुझान पर एक अंक।' } });
  }
  // The sector/trend/dividend items alone must not make a score: require at least 2 fundamentals-based criteria.
  const fundCount = crits.filter((c) => ['growth', 'roe', 'margin', 'peg'].includes(c.key)).length;
  if (fundCount < 2) return assemble([], 7, 3, head, missing);
  const out = assemble(crits, 8, 3, head, missing);
  // the neutral sector item has an empty line and is never a bull/bear point
  return { ...out, bull: out.bull.filter((l) => l.en), bear: out.bear.filter((l) => l.en) };
}
