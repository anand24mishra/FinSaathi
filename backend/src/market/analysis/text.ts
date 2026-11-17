// Localised (en/hi) plain-language templates for the rules-based analysis. Written for a 55-year-old beginner:
// short sentences, jargon explained in brackets. Never says buy/sell.
import type { Lang, Stance } from '../../../../shared/contract';
import { inr, spct, pct } from '../format';

export const STANCE_LABEL: Record<Lang, Record<Stance, string>> = {
  en: { favourable: 'Looks favourable', neutral: 'Neutral', cautious: 'Be cautious' },
  hi: { favourable: 'अनुकूल दिख रहा है', neutral: 'तटस्थ (न तेज़ी, न मंदी)', cautious: 'सावधानी रखें' },
};
export const CONF_LABEL: Record<Lang, Record<'low' | 'medium' | 'high', string>> = {
  en: { low: 'low', medium: 'medium', high: 'high' },
  hi: { low: 'कम', medium: 'मध्यम', high: 'अधिक' },
};

export interface Facts {
  name: string; price: number; sma50: number | null; sma200: number | null; rsi: number | null;
  macdHist: number | null; pos52: number | null; low52: number | null; high52: number | null;
  vol: number | null; dd: number | null; perf1y: number | null; atr: number | null;
  pe: number | null; roe: number | null; de: number | null; deApplicable: boolean;
  trend: 'up' | 'down' | 'sideways'; bars: number; hasFundamentals: boolean; score: number; stance: Stance;
}

const rsiWord = (lang: Lang, r: number) =>
  lang === 'en' ? (r >= 70 ? 'running hot (may be stretched)' : r >= 55 ? 'positive' : r >= 45 ? 'balanced' : r >= 30 ? 'weak' : 'very weak (heavily sold)')
    : (r >= 70 ? 'काफ़ी तेज़ चढ़ चुका है (खिंचा हुआ हो सकता है)' : r >= 55 ? 'सकारात्मक' : r >= 45 ? 'संतुलित' : r >= 30 ? 'कमज़ोर' : 'बहुत कमज़ोर (काफ़ी बिकवाली हुई है)');

export function evidenceText(lang: Lang, f: Facts): {
  key: string; label: string; value: string; direction: 'positive' | 'negative' | 'neutral'; detail: string;
}[] {
  const en = lang === 'en';
  const out: ReturnType<typeof evidenceText> = [];
  if (f.sma50 != null) {
    const above50 = f.price > f.sma50;
    const s200 = f.sma200 != null ? (f.price > f.sma200 ? (en ? 'above' : 'ऊपर') : (en ? 'below' : 'नीचे')) : null;
    out.push({
      key: 'trend',
      label: en ? 'Price trend' : 'भाव का रुझान',
      value: en ? `${inr(f.price)} vs 50-day average ${inr(f.sma50)}${f.sma200 != null ? `, 200-day average ${inr(f.sma200)}` : ''}` : `भाव ${inr(f.price)}; 50 दिन का औसत ${inr(f.sma50)}${f.sma200 != null ? `; 200 दिन का औसत ${inr(f.sma200)}` : ''}`,
      direction: f.trend === 'up' ? 'positive' : f.trend === 'down' ? 'negative' : 'neutral',
      detail: en
        ? `The price is ${above50 ? 'above' : 'below'} its 50-day average${s200 ? ` and ${s200} its 200-day average` : ''}. An average of past closing prices shows the usual direction: ${f.trend === 'up' ? 'rising' : f.trend === 'down' ? 'falling' : 'mixed'}.`
        : `भाव अपने 50 दिन के औसत से ${above50 ? 'ऊपर' : 'नीचे'} है${s200 ? ` और 200 दिन के औसत से ${s200}` : ''}। बीते दिनों के औसत भाव से पता चलता है कि आम दिशा ${f.trend === 'up' ? 'ऊपर की ओर' : f.trend === 'down' ? 'नीचे की ओर' : 'मिली-जुली'} है।`,
    });
  }
  if (f.rsi != null) {
    out.push({
      key: 'rsi', label: en ? 'Recent momentum (RSI)' : 'हाल की रफ़्तार (RSI)',
      value: `RSI ${f.rsi.toFixed(0)}`,
      direction: f.rsi >= 70 ? 'neutral' : f.rsi >= 50 ? 'positive' : f.rsi >= 30 ? 'negative' : 'neutral',
      detail: en ? `RSI is a 0 to 100 meter of recent buying versus selling. It reads ${rsiWord(lang, f.rsi)}. Above 70 can mean a stock has run up too fast; below 30 can mean it has been sold heavily.`
        : `RSI हाल की ख़रीद और बिकवाली को 0 से 100 के पैमाने पर दिखाता है। अभी यह ${rsiWord(lang, f.rsi)} है। 70 से ऊपर का मतलब भाव बहुत तेज़ी से चढ़ा हो सकता है; 30 से नीचे का मतलब काफ़ी बिकवाली हुई है।`,
    });
  }
  if (f.macdHist != null) {
    const pos = f.macdHist > 0;
    out.push({
      key: 'macd', label: en ? 'Trend strength (MACD)' : 'रुझान की ताक़त (MACD)',
      value: `MACD ${f.macdHist >= 0 ? '+' : ''}${f.macdHist.toFixed(2)}`, direction: pos ? 'positive' : 'negative',
      detail: en ? `MACD compares a short-term and a longer-term average of price. It is ${pos ? 'positive: short-term price is gaining on the longer-term' : 'negative: short-term price is lagging the longer-term'}.`
        : `MACD कम समय और लंबे समय के औसत भाव की तुलना करता है। अभी यह ${pos ? 'सकारात्मक है: कम समय का भाव आगे बढ़ रहा है' : 'नकारात्मक है: कम समय का भाव पीछे चल रहा है'}।`,
    });
  }
  if (f.pos52 != null && f.low52 != null && f.high52 != null) {
    const p = Math.round(f.pos52 * 100);
    out.push({
      key: 'range', label: en ? 'Place in 1-year range' : '1 साल की सीमा में स्थान',
      value: en ? `${p}% of the way up (${inr(f.low52)} to ${inr(f.high52)})` : `${p}% ऊपर (${inr(f.low52)} से ${inr(f.high52)})`,
      direction: f.pos52 > 0.85 ? 'neutral' : f.pos52 >= 0.5 ? 'positive' : f.pos52 >= 0.25 ? 'neutral' : 'negative',
      detail: en ? 'Where today\'s price sits between the lowest and highest price of the past year. Near the top means strength but also less cushion; near the bottom means weakness.'
        : 'आज का भाव पिछले साल के सबसे निचले और सबसे ऊँचे भाव के बीच कहाँ है। ऊपर के पास होना ताक़त दिखाता है, पर गिरावट में बचाव कम रहता है; नीचे के पास होना कमज़ोरी दिखाता है।',
    });
  }
  if (f.perf1y != null) {
    out.push({
      key: 'perf', label: en ? 'Change over 1 year' : '1 साल में बदलाव', value: spct(f.perf1y, 1),
      direction: f.perf1y > 5 ? 'positive' : f.perf1y < -5 ? 'negative' : 'neutral',
      detail: en ? 'How much the price moved over the past year. Past moves do not promise future moves.' : 'पिछले एक साल में भाव कितना बदला। बीता हुआ प्रदर्शन आगे की गारंटी नहीं है।',
    });
  }
  if (f.vol != null) {
    out.push({
      key: 'vol', label: en ? 'Ups and downs (volatility)' : 'उतार-चढ़ाव (वोलैटिलिटी)', value: en ? `${f.vol.toFixed(0)}% a year` : `साल में ${f.vol.toFixed(0)}%`,
      direction: f.vol > 40 ? 'negative' : f.vol < 25 ? 'positive' : 'neutral',
      detail: en ? 'Volatility shows how widely the price swings. Higher numbers mean bumpier rides and bigger possible losses in a short time.' : 'वोलैटिलिटी बताती है कि भाव कितना ऊपर-नीचे होता है। संख्या जितनी बड़ी, सफ़र उतना झटकेदार और कम समय में नुकसान की संभावना उतनी ज़्यादा।',
    });
  }
  if (f.dd != null) {
    out.push({
      key: 'dd', label: en ? 'Worst fall in past year' : 'पिछले साल की सबसे बड़ी गिरावट', value: `-${f.dd.toFixed(0)}%`,
      direction: f.dd > 30 ? 'negative' : f.dd < 15 ? 'positive' : 'neutral',
      detail: en ? 'The biggest drop from a peak to a low in the past year. It shows how much a holder had to sit through.' : 'पिछले साल सबसे ऊँचे भाव से सबसे निचले भाव तक की सबसे बड़ी गिरावट। इससे पता चलता है कि निवेशक को कितना नुकसान झेलना पड़ा।',
    });
  }
  if (f.pe != null && f.pe > 0) {
    out.push({
      key: 'pe', label: en ? 'Price versus profit (P/E)' : 'भाव और मुनाफ़े का अनुपात (P/E)', value: `P/E ${f.pe.toFixed(1)}`,
      direction: f.pe <= 25 ? 'positive' : f.pe > 40 ? 'negative' : 'neutral',
      detail: en ? 'P/E tells how many rupees investors pay for each rupee of yearly profit. Lower can mean cheaper, but fast-growing companies often have higher P/E. Compare only within the same industry.'
        : 'P/E बताता है कि कंपनी के सालाना ₹1 मुनाफ़े के लिए निवेशक कितने रुपये दे रहे हैं। कम का मतलब सस्ता हो सकता है, पर तेज़ी से बढ़ती कंपनियों का P/E अक्सर ज़्यादा होता है। तुलना सिर्फ़ उसी उद्योग की कंपनियों से करें।',
    });
  }
  if (f.roe != null) {
    out.push({
      key: 'roe', label: en ? 'Return on equity (ROE)' : 'शेयरधारकों के पैसे पर कमाई (ROE)', value: pct(f.roe, 1),
      direction: f.roe >= 15 ? 'positive' : f.roe < 8 ? 'negative' : 'neutral',
      detail: en ? 'How much profit the company earns on the owners\' money each year. Steady, higher numbers usually mean a better-run business.' : 'कंपनी मालिकों के पैसे पर साल में कितना मुनाफ़ा कमाती है। लगातार ऊँचा आँकड़ा आम तौर पर बेहतर चल रहे कारोबार की निशानी है।',
    });
  }
  if (f.de != null && f.deApplicable) {
    out.push({
      key: 'de', label: en ? 'Debt compared to own money' : 'कर्ज़ बनाम अपनी पूँजी', value: `${f.de.toFixed(2)}x`,
      direction: f.de <= 0.5 ? 'positive' : f.de > 1.5 ? 'negative' : 'neutral',
      detail: en ? 'Debt-to-equity: rupees of debt for every rupee of the company\'s own money. Lower usually means less risk if business slows.' : 'डेट-टू-इक्विटी: कंपनी की अपनी पूँजी के हर ₹1 पर कितना कर्ज़ है। कम होने पर कारोबार धीमा पड़ने पर जोखिम कम रहता है।',
    });
  }
  return out;
}

export function thesisText(lang: Lang, f: Facts): string {
  const en = lang === 'en';
  const label = STANCE_LABEL[lang][f.stance];
  const parts: string[] = [];
  if (en) {
    parts.push(`${f.name}: our rule-based checks give ${f.score} out of 100, which reads as "${label}".`);
    if (f.trend === 'up') parts.push('The price has been trending upward, trading above its recent averages.');
    else if (f.trend === 'down') parts.push('The price has been trending downward, trading below its recent averages.');
    else parts.push('The price has no clear direction right now.');
    if (f.rsi != null) parts.push(f.rsi >= 70 ? 'Recent buying has been strong, so the stock may already be stretched.' : f.rsi < 30 ? 'Recent selling has been heavy.' : f.macdHist != null && f.macdHist > 0 ? 'Short-term momentum is positive.' : 'Short-term momentum is soft.');
    if (f.hasFundamentals) parts.push('Company numbers (profit, debt) were also considered.');
    else parts.push('Company profit and debt numbers were not available, so only price behaviour was used.');
    parts.push('This describes past price behaviour. It is not a prediction or advice.');
  } else {
    parts.push(`${f.name}: हमारे नियम-आधारित जाँच में इसे 100 में से ${f.score} अंक मिले, यानी "${label}"।`);
    if (f.trend === 'up') parts.push('भाव ऊपर की ओर चल रहा है और हाल के औसत भाव से ऊपर है।');
    else if (f.trend === 'down') parts.push('भाव नीचे की ओर चल रहा है और हाल के औसत भाव से नीचे है।');
    else parts.push('अभी भाव की कोई साफ़ दिशा नहीं है।');
    if (f.rsi != null) parts.push(f.rsi >= 70 ? 'हाल में ख़रीदारी काफ़ी रही है, इसलिए भाव पहले ही खिंचा हुआ हो सकता है।' : f.rsi < 30 ? 'हाल में काफ़ी बिकवाली हुई है।' : f.macdHist != null && f.macdHist > 0 ? 'कम समय की रफ़्तार सकारात्मक है।' : 'कम समय की रफ़्तार कमज़ोर है।');
    if (f.hasFundamentals) parts.push('कंपनी के आँकड़े (मुनाफ़ा, कर्ज़) भी देखे गए हैं।');
    else parts.push('कंपनी के मुनाफ़े और कर्ज़ के आँकड़े उपलब्ध नहीं थे, इसलिए सिर्फ़ भाव की चाल देखी गई है।');
    parts.push('यह बीते हुए भाव का विवरण है, भविष्य की भविष्यवाणी या सलाह नहीं।');
  }
  return parts.join(' ');
}

export function risksText(lang: Lang, f: Facts, ctx: { fundamentalsMissing: boolean }): string[] {
  const en = lang === 'en'; const r: string[] = [];
  if (f.vol != null && f.vol > 35) r.push(en ? `The price swings a lot (about ${f.vol.toFixed(0)}% a year), so short-term losses can be sharp.` : `भाव में काफ़ी उतार-चढ़ाव है (साल में लगभग ${f.vol.toFixed(0)}%), इसलिए कम समय में तेज़ नुकसान हो सकता है।`);
  if (f.dd != null && f.dd > 20) r.push(en ? `In the past year it fell as much as ${f.dd.toFixed(0)}% from a peak.` : `पिछले साल यह ऊँचे भाव से ${f.dd.toFixed(0)}% तक गिरा था।`);
  if (f.rsi != null && f.rsi >= 70) r.push(en ? 'It has risen fast recently; such stocks can pause or fall back.' : 'हाल में यह तेज़ी से चढ़ा है; ऐसे शेयर रुक सकते हैं या वापस गिर सकते हैं।');
  if (ctx.fundamentalsMissing) r.push(en ? 'Company profit, debt and valuation numbers were unavailable, so this view rests on price behaviour only.' : 'कंपनी के मुनाफ़े, कर्ज़ और मूल्यांकन के आँकड़े उपलब्ध नहीं थे, इसलिए यह राय सिर्फ़ भाव की चाल पर टिकी है।');
  if (f.bars < 200) r.push(en ? `Only ${f.bars} days of price history were available, so long-term averages are incomplete.` : `सिर्फ़ ${f.bars} दिन का भाव-इतिहास मिला, इसलिए लंबे समय के औसत अधूरे हैं।`);
  r.push(en ? 'Market-wide events (global news, crude oil, the rupee, interest rates) can move any stock regardless of its own strength.' : 'पूरे बाज़ार की घटनाएँ (वैश्विक ख़बरें, कच्चा तेल, रुपया, ब्याज दरें) किसी भी शेयर को उसकी अपनी मज़बूती से हटकर ऊपर-नीचे कर सकती हैं।');
  return r;
}

export const uncertaintyText = (lang: Lang, f: Facts): string =>
  lang === 'en'
    ? `This view uses only past prices${f.hasFundamentals ? ' and a few company numbers' : ''}. It cannot know about results, news, rule changes or global shocks that come next. Treat it as a way to study the stock, not a forecast. Confidence is limited by the data available.`
    : `यह राय सिर्फ़ बीते भाव${f.hasFundamentals ? ' और कुछ कंपनी आँकड़ों' : ''} पर आधारित है। आगे आने वाले नतीजों, ख़बरों, नियमों या वैश्विक झटकों का इसे अंदाज़ा नहीं है। इसे शेयर को समझने का तरीक़ा मानें, भविष्यवाणी नहीं। भरोसा उपलब्ध आँकड़ों तक सीमित है।`;

export const horizonLabel = (lang: Lang) => (lang === 'en' ? 'Next few months (about 3 to 6 months)' : 'अगले कुछ महीने (लगभग 3 से 6 महीने)');

export function levelsBasis(lang: Lang, d: { support: number | null; resistance: number | null; atr: number; usedSupport: boolean; usedResistance: boolean }): string {
  const en = lang === 'en';
  return en
    ? `ILLUSTRATIVE study levels, not instructions. Entry zone sits ${d.usedSupport ? `near the closest recent support (${inr(d.support!)}), a price where it has paused before` : 'a little below the current price (no clear support found)'}. Target range uses ${d.usedResistance ? `the nearest recent resistance (${inr(d.resistance!)}), a price where it has stalled before, ` : ''}plus 1.5 times the typical daily price range (ATR, ${inr(d.atr)}). The protective level sits one ATR below the entry zone. Prices can gap past any level.`
    : `ये केवल समझने के लिए उदाहरण-स्तर हैं, निर्देश नहीं। प्रवेश-क्षेत्र ${d.usedSupport ? `हाल के नज़दीकी सहारे (${inr(d.support!)}) के पास है, जहाँ भाव पहले रुका है` : 'मौजूदा भाव से थोड़ा नीचे है (कोई साफ़ सहारा नहीं मिला)'}। लक्ष्य-सीमा ${d.usedResistance ? `हाल के नज़दीकी अवरोध (${inr(d.resistance!)}), जहाँ भाव पहले अटका है, ` : ''}और रोज़ की सामान्य चाल (ATR, ${inr(d.atr)}) के 1.5 गुना पर आधारित है। बचाव-स्तर प्रवेश-क्षेत्र से एक ATR नीचे रखा है। भाव किसी भी स्तर को लाँघकर आगे-पीछे जा सकता है।`;
}

export const ideaOneLiner = (lang: Lang, f: Facts): string => {
  const en = lang === 'en';
  if (f.stance === 'favourable') return en ? `${f.trend === 'up' ? 'Uptrend with positive momentum' : 'Healthy price signals'}; score ${f.score}/100.` : `${f.trend === 'up' ? 'ऊपर का रुझान और सकारात्मक रफ़्तार' : 'भाव के संकेत अच्छे हैं'}; स्कोर ${f.score}/100।`;
  if (f.stance === 'cautious') return en ? `${f.trend === 'down' ? 'Downtrend with weak momentum' : 'Weak price signals'}; score ${f.score}/100.` : `${f.trend === 'down' ? 'नीचे का रुझान और कमज़ोर रफ़्तार' : 'भाव के संकेत कमज़ोर हैं'}; स्कोर ${f.score}/100।`;
  return en ? `Mixed signals; score ${f.score}/100.` : `मिले-जुले संकेत; स्कोर ${f.score}/100।`;
};

export const METHODOLOGY: Record<Lang, string> = {
  en: 'Every stock in our large-cap universe is scored 0 to 100 with a fixed rulebook: price trend (vs 50 and 200 day averages), momentum (RSI, MACD), place in its 1-year range, and a deduction for big swings and deep falls. Company numbers (P/E, ROE, debt) are added only when available. 65 or more reads "Looks favourable", 40 or less reads "Be cautious". It uses only past prices, so it is a study aid, not a forecast.',
  hi: 'हमारे बड़ी कंपनियों के समूह में हर शेयर को एक तय नियमावली से 0 से 100 अंक मिलते हैं: भाव का रुझान (50 और 200 दिन के औसत से तुलना), रफ़्तार (RSI, MACD), 1 साल की सीमा में स्थान, और ज़्यादा उतार-चढ़ाव व गहरी गिरावट पर कटौती। कंपनी के आँकड़े (P/E, ROE, कर्ज़) सिर्फ़ उपलब्ध होने पर जुड़ते हैं। 65 या अधिक पर "अनुकूल दिख रहा है", 40 या कम पर "सावधानी रखें"। यह सिर्फ़ बीते भाव पर आधारित है, इसलिए समझने का साधन है, भविष्यवाणी नहीं।',
};
