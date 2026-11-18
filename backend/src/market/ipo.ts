import type { IpoFeed, IpoItem, IpoCheck, Lang } from '../../../shared/contract';
import { fetchIpos, NSE_SOURCE, type NseIpoRow } from './providers/nse';
import { iso } from './http';

export const IPO_CHECKLIST: Record<Lang, { title: string; body: string }[]> = {
  en: [
    { title: 'Read the prospectus (RHP)', body: 'The Red Herring Prospectus is the company\'s official document. Read the "Risk factors" and "Objects of the issue" sections first. It is free on the company, SEBI and NSE/BSE websites.' },
    { title: 'Understand how the company earns', body: 'Can you explain in one sentence what the company sells and who pays for it? If not, it is safer to skip.' },
    { title: 'Look at profit and debt history', body: 'Check 3 to 5 years of sales, profit and debt. Steady profits are a better sign than a one-year jump just before the IPO.' },
    { title: 'Where will the money go?', body: 'A "fresh issue" brings money into the company. An "offer for sale" gives money to existing owners. Mostly offer-for-sale means the company itself gets little.' },
    { title: 'Compare the price with similar listed companies', body: 'Compare the P/E (price compared to yearly profit) with listed peers in the same business. Much higher needs a strong reason.' },
    { title: 'Check the promoters', body: 'Look at promoter holding after the IPO, any pledged shares, and any past legal cases listed in the prospectus.' },
    { title: 'SME IPOs carry extra risk', body: 'Companies on the SME board are smaller, trade in thin volumes and their prices can swing sharply or become hard to sell. Many beginners prefer to skip them.' },
    { title: 'Do not chase listing-day gains', body: 'Listing-day prices can go either way. Apply only if you are happy to hold the shares for years, with money you will not need soon.' },
    { title: 'Subscription numbers are not a guarantee', body: 'A heavily subscribed IPO can still fall after listing, and an under-subscribed one can still do well. Treat it as one clue, not proof.' },
  ],
  hi: [
    { title: 'प्रॉस्पेक्टस (RHP) पढ़ें', body: 'रेड हेरिंग प्रॉस्पेक्टस कंपनी का आधिकारिक दस्तावेज़ है। पहले "जोखिम कारक" और "इश्यू का उद्देश्य" वाले हिस्से पढ़ें। यह कंपनी, सेबी और NSE/BSE की वेबसाइट पर मुफ़्त मिलता है।' },
    { title: 'समझें कि कंपनी कमाती कैसे है', body: 'क्या आप एक वाक्य में बता सकते हैं कि कंपनी क्या बेचती है और कौन ख़रीदता है? अगर नहीं, तो छोड़ देना ज़्यादा सुरक्षित है।' },
    { title: 'मुनाफ़े और कर्ज़ का इतिहास देखें', body: '3 से 5 साल की बिक्री, मुनाफ़ा और कर्ज़ देखें। IPO से ठीक पहले एक साल की छलाँग से ज़्यादा भरोसेमंद है लगातार मुनाफ़ा।' },
    { title: 'पैसा कहाँ जाएगा?', body: '"फ्रेश इश्यू" का पैसा कंपनी में आता है। "ऑफ़र फ़ॉर सेल" का पैसा पुराने मालिकों को जाता है। अगर ज़्यादातर ऑफ़र फ़ॉर सेल है तो कंपनी को ख़ुद बहुत कम मिलता है।' },
    { title: 'मिलती-जुलती सूचीबद्ध कंपनियों से भाव की तुलना करें', body: 'उसी कारोबार की सूचीबद्ध कंपनियों के P/E (भाव और सालाना मुनाफ़े का अनुपात) से तुलना करें। बहुत ज़्यादा हो तो उसके पीछे ठोस वजह होनी चाहिए।' },
    { title: 'प्रमोटरों को जाँचें', body: 'IPO के बाद प्रमोटर की हिस्सेदारी, गिरवी रखे शेयर और प्रॉस्पेक्टस में लिखे पुराने कानूनी मामले देखें।' },
    { title: 'SME IPO में जोखिम ज़्यादा है', body: 'SME बोर्ड की कंपनियाँ छोटी होती हैं, कम मात्रा में ख़रीद-बिक्री होती है और भाव तेज़ी से ऊपर-नीचे हो सकता है या बेचना मुश्किल हो सकता है। कई शुरुआती निवेशक इन्हें छोड़ना बेहतर समझते हैं।' },
    { title: 'लिस्टिंग के दिन के मुनाफ़े के पीछे न भागें', body: 'लिस्टिंग के दिन भाव किसी भी तरफ़ जा सकता है। तभी आवेदन करें जब आप शेयर सालों तक रखने को तैयार हों और वह पैसा जल्द काम न आने वाला हो।' },
    { title: 'सब्सक्रिप्शन का आँकड़ा गारंटी नहीं है', body: 'बहुत ज़्यादा सब्सक्राइब हुआ IPO भी लिस्टिंग के बाद गिर सकता है और कम सब्सक्राइब हुआ भी अच्छा चल सकता है। इसे एक संकेत मानें, सबूत नहीं।' },
  ],
};
const GMP: Record<Lang, string> = {
  en: 'Grey-market premium (GMP) is an unofficial, unregulated number traded on word of mouth. It can vanish overnight, so we do not show it and you should not rely on it.',
  hi: 'ग्रे-मार्केट प्रीमियम (GMP) एक अनौपचारिक, अनियमित आँकड़ा है जो सिर्फ़ ज़ुबानी लेन-देन पर चलता है। यह रातों-रात ग़ायब हो सकता है, इसलिए हम इसे नहीं दिखाते और आपको भी इस पर भरोसा नहीं करना चाहिए।',
};

function checksFor(r: NseIpoRow, lang: Lang): IpoCheck[] {
  const en = lang === 'en'; const sme = (r.series ?? '').toUpperCase() === 'SME';
  const unk = (label: string, detail: string): IpoCheck => ({ label, status: 'unknown', detail });
  return [
    sme ? { label: en ? 'Board' : 'बोर्ड', status: 'warn', detail: en ? 'SME board: smaller company, thin trading, higher risk.' : 'SME बोर्ड: छोटी कंपनी, कम ख़रीद-बिक्री, ज़्यादा जोखिम।' }
      : { label: en ? 'Board' : 'बोर्ड', status: 'ok', detail: en ? 'Main board listing (larger disclosure norms than SME).' : 'मुख्य बोर्ड में सूचीबद्ध (SME से बड़े खुलासे के नियम)।' },
    r.priceBand ? { label: en ? 'Price band' : 'प्राइस बैंड', status: 'ok', detail: `${r.priceBand}` } : unk(en ? 'Price band' : 'प्राइस बैंड', en ? 'Not announced in this feed.' : 'इस फ़ीड में घोषित नहीं।'),
    unk(en ? 'Profit and debt history' : 'मुनाफ़े और कर्ज़ का इतिहास', en ? 'Not in our data. Check the prospectus.' : 'हमारे आँकड़ों में नहीं है। प्रॉस्पेक्टस देखें।'),
    unk(en ? 'Use of money raised' : 'जुटाए पैसे का उपयोग', en ? 'Not in our data. Check "Objects of the issue" in the prospectus.' : 'हमारे आँकड़ों में नहीं है। प्रॉस्पेक्टस के "इश्यू का उद्देश्य" में देखें।'),
  ];
}

export function toIpoItem(r: NseIpoRow, lang: Lang): IpoItem {
  const en = lang === 'en';
  const status = r.status === 'open' && r.closeDate && r.closeDate < new Date().toISOString().slice(0, 10) ? 'closed' : r.status;
  const board = (r.series ?? '').toUpperCase() === 'SME' ? 'SME' : (en ? 'Main board' : 'मुख्य बोर्ड');
  const when = r.openDate && r.closeDate ? `${r.openDate} → ${r.closeDate}` : r.listingDate ? r.listingDate : '';
  const sub = r.subscriptionTimes != null ? (en ? ` Subscribed ${r.subscriptionTimes.toFixed(2)} times so far.` : ` अब तक ${r.subscriptionTimes.toFixed(2)} गुना सब्सक्राइब हुआ।`) : '';
  const summary = en
    ? `${board} IPO, ${status === 'open' ? 'open now' : status === 'upcoming' ? 'opening soon' : status === 'listed' ? 'already listed' : 'closed'}${when ? ` (${when})` : ''}${r.priceBand ? `, price band ${r.priceBand}` : ''}.${sub} Not a recommendation; see the checklist below.`
    : `${board} IPO, ${status === 'open' ? 'अभी खुला है' : status === 'upcoming' ? 'जल्द खुलेगा' : status === 'listed' ? 'सूचीबद्ध हो चुका' : 'बंद'}${when ? ` (${when})` : ''}${r.priceBand ? `, प्राइस बैंड ${r.priceBand}` : ''}।${sub} यह सिफ़ारिश नहीं है; नीचे की चेकलिस्ट देखें।`;
  return {
    name: r.name, status, openDate: r.openDate, closeDate: r.closeDate, listingDate: r.listingDate, priceBand: r.priceBand, lotSize: null, issueSizeCr: null, exchange: 'NSE',
    subscription: r.subscriptionTimes != null ? { total: +r.subscriptionTimes.toFixed(2), retail: null, qib: null, nii: null } : null, listingGainPct: null, checks: checksFor(r, lang), summary,
  };
}

export async function getIpoFeed(lang: Lang): Promise<IpoFeed> {
  const base = { gmpNote: GMP[lang], checklist: IPO_CHECKLIST[lang] };
  try {
    const { data, stale } = await fetchIpos();
    const order = { open: 0, upcoming: 1, closed: 2, listed: 3 } as const;
    const items = data.rows.map((r) => toIpoItem(r, lang)).sort((a, b) => order[a.status] - order[b.status]);
    return {
      ...base, available: true, asOf: iso(data.fetchedAt), source: NSE_SOURCE, delayMinutes: null, items,
      note: (data.currentCount === 0 ? (lang === 'hi' ? 'ध्यान दें: NSE की "अभी खुले इश्यू" सूची इस समय ख़ाली लौटी (बाज़ार-समय के बाद ऐसा हो सकता है), इसलिए खुले IPO यहाँ न दिखें तो nseindia.com पर जाँच लें। ' : 'Note: NSE\'s "open issues" list came back empty just now (this can happen outside market hours), so if you expect an IPO to be open, check nseindia.com. ') : '') + (lang === 'hi'
        ? `NSE के सार्वजनिक आँकड़ों से${stale ? ' (ताज़ा नहीं मिले, पुराने आँकड़े; asOf देखें)' : ''}। लॉट साइज़, इश्यू साइज़ और श्रेणीवार सब्सक्रिप्शन इस फ़ीड में नहीं हैं; BSE के IPO और GMP शामिल नहीं हैं।`
        : `From NSE's public data${stale ? ' (fresh data could not be loaded; showing older data, see asOf)' : ''}. Lot size, issue size and category-wise subscription are not in this feed; BSE-only IPOs and GMP are not included.`),
    };
  } catch {
    return {
      ...base, available: false, items: [], asOf: iso(), source: NSE_SOURCE, delayMinutes: null,
      note: lang === 'hi' ? 'IPO की सूची अभी NSE से नहीं मिल पाई। कृपया nseindia.com पर "Public Issues" देखें। तब तक नीचे की चेकलिस्ट किसी भी IPO को परखने में काम आएगी।' : 'The IPO list could not be loaded from NSE right now. Please check "Public Issues" on nseindia.com. The checklist below works for any IPO in the meantime.',
    };
  }
}
