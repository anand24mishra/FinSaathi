// "Someone told me to buy X." Many of our users already invest through their own demat accounts but have no way to judge a stock,
// so they follow a boss, a friend or a broker. We never tell them to ignore that person; we give them the few questions that
// separate a considered tip from a blind one, next to FinSaathi's own numbers for the stock.
import type { ReplyStyle } from '../../../shared/contract';

const SOURCE = /(boss|sir ne|saheb|sahab|manager|seth|malik|friend|dost|broker|relative|rishtedar|colleague|neighbou?r|padosi|someone|kisi ne|group|\btips?\b|advice|advise|suggest|recommend|told me|asked me|said to|bola|bole|batay|bataya|kaha|kahte|salah|sujhav|बॉस|साहब|मालिक|दोस्त|ब्रोकर|रिश्तेदार|पड़ोसी|किसी ने|ग्रुप|टिप|सलाह|सुझाव|कहा|बोला|बोले|बताया)/;
const BUY = /(\bbuy|purchase|invest|get in|\blena\b|le lu|le lun|le lo\b|lelo\b|le lijiye|le lena|leni\b|kharid|khareed|lagau|lagana|लेना|लेने|ले लो|ले लें|लूँ|लूं|खरीद|लगाऊँ|लगाऊं|लगाना)/;

/** Input is expected normalised (lower-case, no nukta), like the rest of the assistant. */
export const isTip = (t: string): boolean => SOURCE.test(t) && BUY.test(t);

const NAME = (n: string | undefined, s: ReplyStyle) => n ?? (s === 'hi' ? 'यह शेयर' : s === 'hinglish' ? 'ye share' : 'this share');

export function tipChecklist(style: ReplyStyle, stockName?: string): string {
  const n = NAME(stockName, style);
  if (style === 'hi') return [
    `किसी के कहने पर ${n} लेने से पहले ये 5 बातें पूछ लें:`,
    '1. उन्होंने कारण बताया, या सिर्फ़ "चढ़ेगा" कहा? कारोबार से जुड़ा कारण माँगें: कंपनी क्या बनाती या बेचती है, और कमाई कैसी है।',
    '2. किस भाव पर लेना है? ऊपर दी गई राय के स्तरों से मिलाएँ। भाव पहले ही बहुत चढ़ चुका हो तो जल्दबाज़ी न करें।',
    '3. आपकी कुल जमा-पूँजी का कितना हिस्सा लग रहा है? एक शेयर में बहुत बड़ा हिस्सा न लगाएँ; थोड़ा लेकर शुरू करना सुरक्षित है।',
    '4. नुक़सान हो तो कहाँ निकलेंगे और मुनाफ़ा हो तो कहाँ? यह पहले से तय कर लें और उनसे भी पूछें।',
    '5. क्या उनको इससे कोई फ़ायदा है (कमीशन, या वे ख़ुद यही शेयर रखे हैं)? "पक्का मुनाफ़ा" कहने वाली बात पर कभी भरोसा न करें।',
    'यह कहना बिल्कुल ठीक है: "मैं पहले जाँच लेता हूँ।" अच्छी सलाह जाँच से नहीं डरती। आप मुझसे शेयर का नाम बताकर और जानकारी भी माँग सकते हैं।',
  ].join('\n');
  if (style === 'hinglish') return [
    `Kisi ke kehne par ${n} lene se pehle ye 5 baatein pooch lein:`,
    '1. Unhone wajah batayi, ya sirf "chadhega" bola? Business wali wajah maangein: company kya banati ya bechti hai, aur kamai kaisi hai.',
    '2. Kis bhaav par lena hai? Upar di gayi raay ke levels se milaayein. Bhaav pehle hi bahut chadh chuka ho to jaldbaazi na karein.',
    '3. Aapki kul jama-poonji ka kitna hissa lag raha hai? Ek share mein bahut bada hissa na lagayein; thoda lekar shuru karna safe hai.',
    '4. Nuksan ho to kahan nikalenge aur munafa ho to kahan? Ye pehle se tay kar lein aur unse bhi poochein.',
    '5. Kya unko isse koi fayda hai (commission, ya woh khud yehi share rakhe hain)? "Pakka munafa" kehne wali baat par kabhi bharosa na karein.',
    'Ye kehna bilkul theek hai: "Main pehle check kar leta hoon." Achhi salah jaanch se nahi darti. Aap share ka naam batakar mujhse aur jaankari bhi maang sakte hain.',
  ].join('\n');
  return [
    `Before you buy ${n} because someone told you to, ask these 5 things:`,
    '1. Did they give a reason, or only say "it will go up"? Ask for a business reason: what the company sells and how its earnings look.',
    '2. At what price would you buy? Compare it with the levels in the call above. If the price has already run up a lot, do not rush.',
    '3. How much of your total savings is this? Do not put a big share of your money into one stock; starting small is safer.',
    '4. Where will you sell if it falls, and where if it rises? Decide that now, and ask them too.',
    '5. Does the person gain from your buying (a commission, or they hold the same share)? Never trust anyone who says "sure profit".',
    'It is perfectly fine to say, "Let me check first." A good tip does not mind being checked. You can also tell me the share name and ask for more details.',
  ].join('\n');
}
