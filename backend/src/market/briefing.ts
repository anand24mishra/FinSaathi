import type { Briefing, BriefingSection, Lang } from '../../../shared/contract';
import { DISCLAIMER } from '../../../shared/contract';
import { getMarketOverview } from './overview';
import { getNews } from './news';
import { getIpoFeed } from './ipo';
import { inr, toSpeech, spct } from './format';
import { iso } from './http';
import { getPortfolioView, getPortfolioHealth } from '../core/portfolio';
import { searchTerms } from '../core/education';

const ist = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600_000);

export async function getBriefing(userId: string | null, lang: Lang): Promise<Briefing> {
  const en = lang === 'en';
  const now = new Date(); const h = ist(now).getUTCHours();
  const greeting = en ? (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') : (h < 12 ? 'सुप्रभात' : h < 17 ? 'नमस्कार' : 'शुभ संध्या');
  const sources = new Set<string>();
  const [ov, news, ipo] = await Promise.allSettled([getMarketOverview(lang), getNews(lang, 'market'), getIpoFeed(lang)]);
  const sections: BriefingSection[] = [];

  // 1. what happened
  if (ov.status === 'fulfilled' && (ov.value.india.length || ov.value.global.length)) {
    const o = ov.value;
    [...o.india, ...o.global, ...o.commodities].slice(0, 1).forEach((q) => sources.add(q.source));
    sections.push({ id: 'happened', title: en ? 'What happened' : 'क्या हुआ', body: `${o.mood.headline}${en ? '.' : '।'}`, bullets: o.mood.bullets.slice(0, 3) });
  } else sections.push({ id: 'happened', title: en ? 'What happened' : 'क्या हुआ', body: en ? 'Market data could not be loaded right now, so I will not guess. Please check again shortly.' : 'बाज़ार का डेटा अभी नहीं मिल पाया, इसलिए मैं अंदाज़ा नहीं लगाऊँगा। थोड़ी देर बाद फिर देखें।', bullets: [] });

  // 2. why it matters (headlines)
  if (news.status === 'fulfilled' && news.value.items.length) {
    sources.add(news.value.source);
    const it = news.value.items.slice(0, 3);
    sections.push({ id: 'why', title: en ? 'Why it matters' : 'यह क्यों मायने रखता है', body: en ? 'Prices move on global news, oil, the rupee and company results. Here is what is being reported:' : 'भाव वैश्विक ख़बरों, तेल, रुपये और कंपनियों के नतीजों से घटते-बढ़ते हैं। अभी ये ख़बरें चल रही हैं:', bullets: it.map((i) => `${i.title} (${i.source})`) });
  } else sections.push({ id: 'why', title: en ? 'Why it matters' : 'यह क्यों मायने रखता है', body: en ? 'Headlines could not be loaded right now.' : 'ख़बरें अभी नहीं मिल पाईं।', bullets: [] });

  // 3. what to watch
  const watch: string[] = [];
  if (ipo.status === 'fulfilled' && ipo.value.available) {
    sources.add(ipo.value.source);
    const open = ipo.value.items.filter((i) => i.status === 'open' || i.status === 'upcoming').slice(0, 3);
    if (open.length) watch.push(en ? `IPOs open or coming up: ${open.map((i) => i.name).join(', ')} (not a recommendation).` : `खुले या आने वाले IPO: ${open.map((i) => i.name).join(', ')} (सिफ़ारिश नहीं)।`);
  }
  if (ov.status === 'fulfilled') {
    const o = ov.value;
    if (o.flows.available && o.flows.fii != null) {
      const fl = (v: number) => inr(Math.abs(v), 0).replace('₹', '₹');
      watch.push(en
        ? `Foreign institutions (FII/FPI) were net ${o.flows.fii >= 0 ? 'buyers' : 'sellers'} of about ${fl(o.flows.fii)} crore${o.flows.dii != null ? `; Indian institutions (DII) net ${o.flows.dii >= 0 ? 'buyers' : 'sellers'} of about ${fl(o.flows.dii)} crore` : ''} (NSE, provisional).`
        : `विदेशी संस्थाएँ (FII/FPI) लगभग ${fl(o.flows.fii)} करोड़ की शुद्ध ${o.flows.fii >= 0 ? 'ख़रीदार' : 'विक्रेता'} रहीं${o.flows.dii != null ? `; घरेलू संस्थाएँ (DII) लगभग ${fl(o.flows.dii)} करोड़ की शुद्ध ${o.flows.dii >= 0 ? 'ख़रीदार' : 'विक्रेता'}` : ''} (NSE, अनंतिम)।`);
      sources.add('NSE India (unofficial public endpoints)');
    }
    const brent = o.commodities.find((q) => q.symbol === 'BZ=F');
    if (brent) watch.push(en ? `Crude oil (Brent) at about ${brent.price.toFixed(1)} dollars a barrel.` : `ब्रेंट कच्चा तेल लगभग ${brent.price.toFixed(1)} डॉलर प्रति बैरल।`);
    if (o.fx) watch.push(en ? `USD/INR at ${o.fx.price.toFixed(2)}.` : `डॉलर-रुपया ${o.fx.price.toFixed(2)} पर।`);
  }
  watch.push(en ? 'Interest-rate decisions: check rbi.org.in for the latest.' : 'ब्याज दर के फ़ैसले: ताज़ा जानकारी के लिए rbi.org.in देखें।');
  sections.push({ id: 'watch', title: en ? 'What to watch' : 'किन बातों पर नज़र रखें', body: en ? 'A few things that can move markets in the coming days:' : 'कुछ बातें जो आने वाले दिनों में बाज़ार को हिला सकती हैं:', bullets: watch });

  // 4. my money
  let money: BriefingSection = { id: 'money', title: en ? 'What it means for my money' : 'मेरे पैसे के लिए इसका मतलब', body: en ? 'Add your shares and funds in the Portfolio tab and this section will show how today affects you.' : 'पोर्टफ़ोलियो टैब में अपने शेयर और फ़ंड जोड़ें, फिर यहाँ दिखेगा कि आज का दिन आप पर कैसा असर डालता है।', bullets: [] };
  if (userId) {
    try {
      const v = await getPortfolioView(userId);
      if (v.holdings.length) {
        const prevVal = v.totals.value - v.totals.dayChange;
        const dayPct = prevVal ? (v.totals.dayChange / prevVal) * 100 : 0;
        const bullets: string[] = [];
        const movers = v.holdings.filter((x) => x.dayChange != null).sort((a, b) => Math.abs(b.dayChange!) - Math.abs(a.dayChange!)).slice(0, 2);
        movers.forEach((m) => bullets.push(`${m.name}: ${m.dayChange! >= 0 ? '+' : '-'}${inr(Math.abs(m.dayChange!), 0)}`));
        try { const hl = await getPortfolioHealth(userId, lang); bullets.push(en ? `Portfolio health: ${hl.score}/100 (${hl.label}).` : `पोर्टफ़ोलियो की सेहत: ${hl.score}/100 (${hl.label})।`); } catch { /* optional */ }
        money = { id: 'money', title: money.title, body: en ? `Your holdings are worth ${inr(v.totals.value, 0)}; the day's change is ${inr(v.totals.dayChange, 0)} (${spct(dayPct)}). Daily moves are normal and say little about the long run.` : `आपकी होल्डिंग का मूल्य ${inr(v.totals.value, 0)} है; आज का बदलाव ${inr(v.totals.dayChange, 0)} (${spct(dayPct)})। रोज़ के उतार-चढ़ाव सामान्य हैं और लंबे समय के बारे में कम बताते हैं।`, bullets };
        sources.add('Your portfolio');
      }
    } catch { /* keep default */ }
  }
  sections.push(money);

  // 5. learn
  try {
    const terms = searchTerms();
    if (terms.length) {
      const day = Math.floor(ist(now).getTime() / 86400_000);
      const t = terms[day % terms.length];
      sections.push({ id: 'learn', title: en ? 'One thing to learn' : 'आज की एक सीख', body: `${t.term[lang]}: ${t.simple[lang]}`, bullets: [`${en ? 'Example' : 'उदाहरण'}: ${t.example[lang]}`] });
    }
  } catch { /* education unavailable */ }
  if (!sections.find((s) => s.id === 'learn')) sections.push({ id: 'learn', title: en ? 'One thing to learn' : 'आज की एक सीख', body: en ? 'Diversification means not putting all your money in one place. If one investment falls, others may cushion the blow.' : 'विविधीकरण का मतलब है सारा पैसा एक जगह न लगाना। एक निवेश गिरे तो बाक़ी उसका झटका कम कर सकते हैं।', bullets: [] });

  const speechText = toSpeech([greeting + '.', ...sections.map((s) => `${s.title}. ${s.body} ${s.bullets.join('. ')}`), DISCLAIMER[lang]].join(' '), lang);
  return { date: ist(now).toISOString().slice(0, 10), greeting, sections, speechText, asOf: iso(), sources: [...sources], disclaimer: DISCLAIMER[lang] };
}
