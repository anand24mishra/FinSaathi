// IPO guide: what is coming, how to follow it, how to apply, what to read and what to avoid.
// Served by the backend (not bundled in the app) so wording can be corrected without a new app release.
// Figures below were checked against SEBI's investor pages and press coverage in Nov 2026; every section tells the reader
// to confirm the current rule in the offer document or on sebi.gov.in because IPO rules change.
import type { IpoGuide, Lang } from '../../../shared/contract';

type L<T> = { en: T; hi: T };
interface Sec { id: string; title: L<string>; steps: L<string[]>; tip?: L<string> }

const SECTIONS: Sec[] = [
  {
    id: 'track',
    title: { en: "What's coming, and how to follow it", hi: 'क्या आने वाला है और उसे कैसे देखें' },
    steps: {
      en: [
        'Open the Upcoming tab here: it lists IPOs that are open now, opening soon, awaiting allotment or just listed.',
        'Mainboard IPOs are larger companies. SME IPOs are small companies on the SME platform and carry much higher risk.',
        'The official source is the offer document (called DRHP, then RHP). Find it on sebi.gov.in under Filings → Public Issues, or on the NSE and BSE IPO pages.',
        'Note three dates for each IPO: opening date, closing date and listing date.',
      ],
      hi: [
        'यहाँ "आने वाले" टैब में देखें: कौन से IPO अभी खुले हैं, जल्द खुलने वाले हैं, आवंटन के इंतज़ार में हैं या अभी लिस्ट हुए हैं।',
        'मेनबोर्ड IPO बड़ी कंपनियों के होते हैं। SME IPO छोटी कंपनियों के होते हैं और उनमें जोखिम काफ़ी ज़्यादा होता है।',
        'सबसे भरोसेमंद स्रोत ऑफ़र डॉक्यूमेंट (पहले DRHP, फिर RHP) है। इसे sebi.gov.in पर Filings → Public Issues में, या NSE और BSE के IPO पेज पर देखें।',
        'हर IPO की तीन तारीख़ें लिख लें: खुलने की, बंद होने की और लिस्टिंग की।',
      ],
    },
  },
  {
    id: 'apply',
    title: { en: 'How to apply, step by step', hi: 'आवेदन कैसे करें, क़दम-दर-क़दम' },
    steps: {
      en: [
        'You need a demat account, a PAN linked to it and a UPI ID linked to your bank account.',
        "Open the IPO section of your broker's app (or your bank's net-banking ASBA option) and pick the IPO.",
        'Choose the number of lots. One lot is the minimum. Retail investors can bid up to ₹2 lakh per IPO.',
        'Tick "cut-off price" so your bid is valid at the final price, then enter your UPI ID.',
        'Approve the payment request in your UPI app before the closing time shown on the IPO page. The money is only blocked in your account (ASBA); it is not paid until shares are allotted.',
        'Apply once per PAN. Family members can apply from their own PANs and demat accounts. Duplicate bids on one PAN are rejected.',
        'UPI allows up to ₹5 lakh per application for retail investors.',
      ],
      hi: [
        'आपके पास डीमैट खाता, उससे जुड़ा PAN और बैंक खाते से जुड़ी UPI ID होनी चाहिए।',
        'अपने ब्रोकर ऐप का IPO सेक्शन (या बैंक की नेट-बैंकिंग में ASBA) खोलें और IPO चुनें।',
        'कितने लॉट चाहिए, यह चुनें। कम से कम एक लॉट लेना होता है। खुदरा निवेशक एक IPO में ₹2 लाख तक की बोली लगा सकते हैं।',
        '"कट-ऑफ़ प्राइस" पर टिक करें ताकि आपकी बोली अंतिम भाव पर मान्य रहे, फिर अपनी UPI ID डालें।',
        'IPO पेज पर दिए बंद होने के समय से पहले अपने UPI ऐप में पैसे रोकने का अनुरोध मंज़ूर करें। पैसा सिर्फ़ आपके खाते में रोका जाता है (ASBA); शेयर मिलने तक कटता नहीं।',
        'एक PAN से एक ही आवेदन करें। परिवार के सदस्य अपने PAN और डीमैट खाते से अलग आवेदन कर सकते हैं। एक PAN से दोहरी बोली रद्द हो जाती है।',
        'खुदरा निवेशकों के लिए UPI से एक आवेदन में ₹5 लाख तक की सीमा है।',
      ],
    },
    tip: {
      en: 'Do it a day early. Last-hour UPI approvals often fail because of busy servers.',
      hi: 'एक दिन पहले ही कर दें। आख़िरी घंटे में सर्वर व्यस्त होने से UPI मंज़ूरी अक्सर फ़ेल हो जाती है।',
    },
  },
  {
    id: 'timeline',
    title: { en: 'What happens after you apply (T+3)', hi: 'आवेदन के बाद क्या होता है (T+3)' },
    steps: {
      en: [
        'T = the day the IPO closes.',
        'T+1: shares are allotted. If the IPO is oversubscribed, retail allotment is by lottery and each applicant can get at most 1 lot.',
        'T+2: shares reach your demat account, or the blocked money is released if you got nothing.',
        'T+3: the shares list and start trading on the exchange. This T+3 schedule has applied to IPOs since December 2023.',
      ],
      hi: [
        'T = वह दिन जब IPO बंद होता है।',
        'T+1: शेयरों का आवंटन। अगर IPO में माँग ज़्यादा रही तो खुदरा आवंटन लॉटरी से होता है और हर आवेदक को ज़्यादा से ज़्यादा 1 लॉट मिल सकता है।',
        'T+2: शेयर आपके डीमैट खाते में आते हैं, या कुछ न मिला तो रुका हुआ पैसा छूट जाता है।',
        'T+3: शेयर एक्सचेंज पर लिस्ट होकर ट्रेड होने लगते हैं। यह T+3 समय-सारणी दिसंबर 2023 से लागू है।',
      ],
    },
  },
  {
    id: 'allotment',
    title: { en: 'How to check your allotment', hi: 'आवंटन कैसे देखें' },
    steps: {
      en: [
        'Each IPO has a registrar (for example KFin Technologies, MUFG Intime India or Bigshare). The name is in the offer document and on the IPO page.',
        "On the registrar's website choose the IPO, then enter your PAN or application number.",
        "You can also check on the NSE or BSE allotment status page, or in your broker app.",
        'No allotment is normal in a popular IPO. Your blocked money is released automatically.',
      ],
      hi: [
        'हर IPO का एक रजिस्ट्रार होता है (जैसे KFin Technologies, MUFG Intime India या Bigshare)। नाम ऑफ़र डॉक्यूमेंट और IPO पेज पर मिलता है।',
        'रजिस्ट्रार की वेबसाइट पर IPO चुनें और अपना PAN या आवेदन संख्या डालें।',
        'आप NSE या BSE के आवंटन-स्थिति पेज पर, या अपने ब्रोकर ऐप में भी देख सकते हैं।',
        'लोकप्रिय IPO में कुछ न मिलना आम बात है। आपका रुका हुआ पैसा अपने-आप छूट जाता है।',
      ],
    },
  },
  {
    id: 'read',
    title: { en: 'What to look at, and where', hi: 'क्या देखें और कहाँ देखें' },
    steps: {
      en: [
        'Objects of the Issue → is it a fresh issue (money goes into the company) or an offer for sale (money goes to existing owners)? A mostly-OFS IPO gives the company nothing new to grow with.',
        'Financial Information → read 3 years of revenue, profit and debt. Look for steady growth, not one lucky year.',
        'Basis for Offer Price → compare the IPO P/E with listed peers. Much higher than peers needs a strong reason.',
        'Capital Structure → promoter holding after the IPO, and how much they are selling.',
        'Risk Factors and Legal Proceedings → read the first ten risks and any big court cases.',
        'Anchor investors and lock-in → large funds bidding a day before opening is a mild positive sign, not a guarantee.',
        'Subscription on the last day → demand from QIBs (big institutions) matters more than hype from small bidders.',
        'Ask the app: type "Is this IPO risky?" or tap any IPO below for the checklist.',
      ],
      hi: [
        'Objects of the Issue → यह नया निर्गम है (पैसा कंपनी में जाएगा) या ऑफ़र फ़ॉर सेल (पैसा पुराने मालिकों को जाएगा)? ज़्यादातर OFS वाले IPO से कंपनी को बढ़ने के लिए नया पैसा नहीं मिलता।',
        'Financial Information → 3 साल की बिक्री, मुनाफ़ा और क़र्ज़ देखें। लगातार बढ़त देखें, सिर्फ़ एक अच्छा साल नहीं।',
        'Basis for Offer Price → IPO का P/E लिस्टेड साथी कंपनियों से मिलाएँ। बहुत ज़्यादा हो तो मज़बूत वजह चाहिए।',
        'Capital Structure → IPO के बाद प्रमोटर की हिस्सेदारी और वे कितना बेच रहे हैं।',
        'Risk Factors और Legal Proceedings → शुरू के दस जोखिम और बड़े अदालती मामले पढ़ें।',
        'एंकर निवेशक और लॉक-इन → खुलने से एक दिन पहले बड़े फ़ंड का पैसा लगाना हल्का सकारात्मक संकेत है, गारंटी नहीं।',
        'आख़िरी दिन की सब्सक्रिप्शन → छोटे बोलीदाताओं के शोर से ज़्यादा बड़े संस्थानों (QIB) की माँग मायने रखती है।',
        'ऐप से पूछें: "क्या यह IPO जोखिम भरा है?" लिखें, या नीचे किसी भी IPO पर टैप करके चेकलिस्ट देखें।',
      ],
    },
  },
  {
    id: 'sme',
    title: { en: 'SME IPOs: extra care', hi: 'SME IPO: ज़्यादा सावधानी' },
    steps: {
      en: [
        'SME companies are small. Their shares can be hard to sell and their prices can swing sharply after listing.',
        'The minimum application is much bigger than for a mainboard IPO (often above ₹2 lakh), so one wrong bet costs more.',
        'SEBI has tightened SME rules (a profit requirement and a limit on offer-for-sale) and in October 2026 proposed further changes. Rules may change, so check the offer document.',
        'If you are new to IPOs, start with mainboard issues.',
      ],
      hi: [
        'SME कंपनियाँ छोटी होती हैं। उनके शेयर बेचना मुश्किल हो सकता है और लिस्टिंग के बाद भाव तेज़ी से ऊपर-नीचे हो सकते हैं।',
        'न्यूनतम आवेदन राशि मेनबोर्ड IPO से काफ़ी बड़ी होती है (अक्सर ₹2 लाख से ऊपर), इसलिए एक ग़लत दाँव ज़्यादा महँगा पड़ता है।',
        'सेबी ने SME नियम सख़्त किए हैं (मुनाफ़े की शर्त और ऑफ़र-फ़ॉर-सेल पर सीमा) और अक्टूबर 2026 में और बदलाव प्रस्तावित किए हैं। नियम बदल सकते हैं, इसलिए ऑफ़र डॉक्यूमेंट देखें।',
        'अगर आप IPO में नए हैं, तो पहले मेनबोर्ड IPO से शुरुआत करें।',
      ],
    },
  },
  {
    id: 'scams',
    title: { en: 'Red flags and scams', hi: 'ख़तरे के संकेत और ठगी' },
    steps: {
      en: [
        'GMP (grey market premium) is unofficial and unregulated. It is gossip, not data. Never treat it as a promise of listing gains.',
        'Nobody can guarantee allotment or listing gains. Anyone who asks for money to "get you shares" is a fraudster.',
        'WhatsApp and Telegram IPO tip groups are a common scam route.',
        'Be careful if a large part of the issue is an offer for sale while profits are weak.',
        'Never apply with a UPI approval request you did not start yourself.',
      ],
      hi: [
        'GMP (ग्रे मार्केट प्रीमियम) अनौपचारिक और बिना नियमन का है। यह अफ़वाह है, आँकड़ा नहीं। इसे लिस्टिंग मुनाफ़े का वादा न मानें।',
        'आवंटन या लिस्टिंग मुनाफ़े की गारंटी कोई नहीं दे सकता। "शेयर दिलाने" के नाम पर पैसे माँगने वाला ठग है।',
        'WhatsApp और Telegram के IPO टिप ग्रुप ठगी का आम रास्ता हैं।',
        'अगर मुनाफ़ा कमज़ोर है और निर्गम का बड़ा हिस्सा ऑफ़र फ़ॉर सेल है तो सावधान रहें।',
        'ऐसी UPI मंज़ूरी कभी न दें जो आपने ख़ुद शुरू नहीं की।',
      ],
    },
  },
  {
    id: 'listing',
    title: { en: 'Listing day', hi: 'लिस्टिंग का दिन' },
    steps: {
      en: [
        'The first price is set in a short pre-open session, so the opening can differ a lot from the issue price.',
        'Decide your plan before listing: sell for a quick gain, or hold because you liked the business. Do not decide in the heat of the moment.',
        'Not every IPO lists above its issue price. Some list below it.',
      ],
      hi: [
        'पहला भाव एक छोटे प्री-ओपन सत्र में तय होता है, इसलिए खुलने का भाव इश्यू प्राइस से काफ़ी अलग हो सकता है।',
        'लिस्टिंग से पहले तय कर लें: जल्दी मुनाफ़ा लेकर बेचना है, या कारोबार पसंद आया इसलिए रखना है। जोश में फ़ैसला न लें।',
        'हर IPO इश्यू प्राइस से ऊपर लिस्ट नहीं होता। कुछ नीचे भी लिस्ट होते हैं।',
      ],
    },
  },
];

export const IPO_GUIDE_AS_OF = '2026-11-22';

export function getIpoGuide(lang: Lang): IpoGuide {
  return {
    asOf: IPO_GUIDE_AS_OF,
    lang,
    note: lang === 'hi'
      ? 'यह सामान्य जानकारी है, निवेश की सलाह नहीं। IPO के नियम बदलते रहते हैं, इसलिए आवेदन से पहले ऑफ़र डॉक्यूमेंट और sebi.gov.in देखें।'
      : 'This is general information, not investment advice. IPO rules change, so check the offer document and sebi.gov.in before you apply.',
    sections: SECTIONS.map((s) => ({ id: s.id, title: s.title[lang], steps: s.steps[lang], ...(s.tip ? { tip: s.tip[lang] } : {}) })),
  };
}

/** Plain text of the guide for the chat tool (no numbers beyond what the guide itself states). */
export function ipoGuideText(lang: Lang, sectionId?: string): string {
  const g = getIpoGuide(lang);
  const secs = sectionId ? g.sections.filter((s) => s.id === sectionId) : g.sections;
  return secs.map((s) => `${s.title}\n${s.steps.map((x, i) => `${i + 1}. ${x}`).join('\n')}${s.tip ? `\n${s.tip}` : ''}`).join('\n\n');
}
