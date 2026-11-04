/** Legal documents. Bump LEGAL_VERSION / LEGAL_UPDATED whenever the text changes in a way users should know about. */
export const LEGAL_VERSION = '2026-11-03';
export const LEGAL_UPDATED = { en: '3 November 2026', hi: '3 नवंबर 2026' };

export type LegalSection = { id: string; h: string; p?: string[]; list?: string[]; after?: string[] };
export type LegalDoc = { intro: string; sections: LegalSection[] };
// Placeholders: {company} operator name, {email} support email (or fallback text), {city} jurisdiction.

const PRIVACY_EN: LegalDoc = {
  intro: 'Khatafy ("we", "us") is a shared-expense diary for flatmates, families and friends. This Privacy Policy explains what personal data we collect, why, who can see it, how long we keep it and the choices you have. It is written to be read, so we have kept it plain.',
  sections: [
    { id: 'who', h: '1. Who we are', p: ['Khatafy is operated by {company}. We decide why and how your personal data is processed (in data-protection language, the "data fiduciary" or "controller").', 'This policy applies to the Khatafy website and installable web app.'] },
    { id: 'collect', h: '2. What we collect', p: ['We collect only what is needed to run the service:'], list: [
      'Account data: your name, email address and a password (stored only as a salted hash by our authentication provider — we cannot read it). If you sign in with Google, we receive your name, email address and profile picture from Google.',
      'Optional profile data: phone number and photo. Your phone number is visible only to you.',
      'Group data you enter: group names, members, expenses, split details, payments, notes, notices, shopping lists and receipt images.',
      'Records of changes: an audit trail of who created, edited or cancelled an entry and when, so that every group member can trust the history.',
      'Technical data: sign-in session tokens, IP address and device/browser information in server and security logs, and notification records.',
      'Consent record: the time and version of the Terms and Privacy Policy you accepted when registering.',
    ], after: ['We do not collect your bank, card or UPI credentials, your contacts, your precise location or your SMS. Khatafy never asks for them.'] },
    { id: 'use', h: '3. How and why we use it', list: [
      'To provide the service: calculate balances, show group history, record payments, send in-app notifications. (Needed to perform our agreement with you.)',
      'To keep accounts and groups secure, prevent abuse and fix errors. (Our legitimate interest in running a safe service.)',
      'To send service emails such as verification, password reset and security notices. We do not send marketing email.',
      'To meet legal obligations and respond to lawful requests.',
    ], after: ['We do not sell your personal data, we do not show advertising and we do not use your data to train AI models.'] },
    { id: 'consent', h: '4. Consent and your choices', p: ['By creating an account you consent to this processing for the purposes above. You can withdraw consent at any time by deleting your account from Profile; withdrawal does not affect processing that already happened lawfully. Some features cannot work without the data they need (for example, a group cannot calculate balances without expense records).'] },
    { id: 'share', h: '5. Who can see your data', list: [
      `Members of your group can see that group's expenses, balances, notices, receipts and member names. Pending join requests are visible to group admins.`,
      `Khatafy platform administrators (the people who maintain the app) can see only totals and technical information: for example the number of users, groups and expenses, group IDs, member counts and dates. They cannot see names, emails, phone numbers, expenses, amounts, notes, receipts or payments. Administrator actions, such as archiving a group after a valid legal notice or complaint, need a written reason and are logged.`,
      `Service providers who process data on our behalf: our database, authentication and file-storage provider (Supabase), our web hosting provider (Vercel), our email-delivery provider (Brevo) for verification and reset emails and, if you choose it, Google for sign-in. Fonts are loaded from Google Fonts, so Google may receive your IP address and browser details when you open the app. These providers may only use the data to provide their service to us.`,
      `Anyone who has the exact link to your profile photo: profile photos are kept in a public location so that they can be shown to your group. Do not upload a photo you do not want to be reachable by its link.`,
      `Authorities, when we are legally required to disclose information.`,
    ], after: [`We never publish your data and we never sell it.`] },
    { id: 'storage', h: '6. Cookies and local storage', p: [`Khatafy does not use advertising or tracking cookies. Your browser's local storage is used for essential functions only: keeping you signed in, remembering your language and theme, remembering that you have seen the welcome screens, a short email-resend timer, and offline expense drafts waiting to sync (these drafts are removed when you log out). You can clear this at any time from your browser; you will be signed out.`] },
    { id: 'retention', h: '7. How long we keep data', list: [
      `Account and group data are kept while your account is active.`,
      `Settle & close (optional): when everyone has settled, a group admin can close the books up to a date. All members are notified and have 3 days to review, download a PDF or object. After that, the detailed expenses, payments, receipts and related notifications and logs up to that date are permanently deleted for all members. A short summary stays in the group's "Settled history": the period, the total, the per-head amount, how much each person paid and owed, and who paid whom. Any amount still unpaid is carried forward as a balance, so dues are never lost. Deleted details cannot be recovered.`,
      `You can delete your own notifications at any time.`,
      `When you delete your account, your profile and sign-in are removed. Expense and payment records that other group members rely on are kept (until the group closes that period), with your name replaced by "Deleted user".`,
      `If a group is deleted, its data is removed from our live systems; backups may keep a copy for a limited period, set by our provider's backup schedule, before they expire. Receipt files of closed periods are deleted from storage by a scheduled clean-up job.`,
      `Security logs are kept for a limited period and then deleted.`,
    ] },
    { id: 'rights', h: '8. Your rights', p: [`Under applicable law, including India's Digital Personal Data Protection Act, 2023, you can:`], list: [
      `Access your data: you can see it in the app and download PDF statements of your group's records (Statement page). To get a copy of other personal data we hold about you, email us and we will respond within 30 days.`,
      `Correct your name, phone number and photo (Profile).`,
      `Erase your account and personal data (Profile menu → Delete account).`,
      `Withdraw consent, and nominate another person to exercise your rights in the event of your death or incapacity.`,
      `Raise a grievance (section 12). We aim to reply within 7 days and resolve within 30 days.`,
    ] },
    { id: 'security', h: '9. How we protect data', p: ['Data is sent over encrypted HTTPS connections. Access to every table is restricted by row-level security so that you can only reach groups you belong to. Receipts are kept in private storage, invitation codes are stored only as hashes and financial records are append-only with an audit trail. No online service is perfectly secure; if a breach affecting your data occurs we will notify affected users and the authorities as the law requires.'] },
    { id: 'children', h: '10. Children', p: ['Khatafy is meant for people aged 18 and over. We do not knowingly collect data from children. If you believe a child has registered, contact us and we will delete the account.'] },
    { id: 'transfer', h: '11. Where data is processed', p: ['Our providers may store and process data on servers outside your country. Where this happens we rely on providers that apply appropriate safeguards.'] },
    { id: 'contact', h: '12. Contact, grievances and changes', p: ['Questions, requests and complaints: {email}. {grievance}', 'We may update this policy. If a change is significant we will tell you in the app or by email before it applies. The date at the top shows the latest version.'] },
  ],
};

const PRIVACY_HI: LegalDoc = {
  intro: 'Khatafy ("हम") फ्लैटमेट, परिवार और दोस्तों के लिए साझा खर्च की डायरी है। यह प्राइवेसी पॉलिसी बताती है कि हम कौन-सा निजी डेटा लेते हैं, क्यों लेते हैं, उसे कौन देख सकता है, कितने समय रखते हैं और आपके पास क्या विकल्प हैं। इसे सरल भाषा में लिखा गया है।',
  sections: [
    { id: 'who', h: '1. हम कौन हैं', p: ['Khatafy को {company} चलाता है। आपके निजी डेटा का उपयोग क्यों और कैसे होगा, यह हम तय करते हैं (कानूनी भाषा में "डेटा फिड्यूशरी")।', 'यह पॉलिसी Khatafy की वेबसाइट और इंस्टॉल होने वाले वेब ऐप पर लागू होती है।'] },
    { id: 'collect', h: '2. हम क्या जानकारी लेते हैं', p: ['सेवा चलाने के लिए जितना ज़रूरी है, उतना ही:'], list: [
      'खाते की जानकारी: नाम, ईमेल और पासवर्ड (पासवर्ड हमारे ऑथेंटिकेशन प्रदाता के पास सिर्फ़ हैश के रूप में रहता है — हम उसे पढ़ नहीं सकते)। Google से लॉगिन करने पर Google से आपका नाम, ईमेल और प्रोफ़ाइल फ़ोटो मिलती है।',
      'वैकल्पिक प्रोफ़ाइल: फ़ोन नंबर और फ़ोटो। फ़ोन नंबर सिर्फ़ आपको दिखता है।',
      'आपके डाले ग्रुप डेटा: ग्रुप के नाम, सदस्य, खर्च, बँटवारे की जानकारी, भुगतान, नोट, नोटिस, सामान की सूची और रसीद की तस्वीरें।',
      'बदलावों का रिकॉर्ड: किसने कौन-सी एंट्री कब बनाई, बदली या रद्द की — ताकि ग्रुप के हर सदस्य को इतिहास पर भरोसा रहे।',
      'तकनीकी डेटा: लॉगिन सेशन टोकन, सर्वर और सुरक्षा लॉग में IP पता व डिवाइस/ब्राउज़र की जानकारी, और सूचनाओं के रिकॉर्ड।',
      'सहमति का रिकॉर्ड: रजिस्टर करते समय आपने शर्तों और पॉलिसी का कौन-सा संस्करण कब स्वीकार किया।',
    ], after: ['हम आपके बैंक, कार्ड या UPI के विवरण, कॉन्टैक्ट, सटीक लोकेशन या SMS नहीं लेते। Khatafy कभी ये नहीं माँगता।'] },
    { id: 'use', h: '3. हम इसका उपयोग कैसे और क्यों करते हैं', list: [
      'सेवा देने के लिए: हिसाब निकालना, ग्रुप का इतिहास दिखाना, भुगतान दर्ज करना, ऐप में सूचनाएँ भेजना। (आपके साथ हुए समझौते को निभाने के लिए ज़रूरी।)',
      'खातों और ग्रुपों को सुरक्षित रखने, दुरुपयोग रोकने और गलतियाँ सुधारने के लिए। (सुरक्षित सेवा चलाना हमारा वैध हित है।)',
      'वेरिफ़िकेशन, पासवर्ड रीसेट और सुरक्षा सूचना जैसे सेवा-संबंधी ईमेल भेजने के लिए। हम मार्केटिंग ईमेल नहीं भेजते।',
      'कानूनी ज़िम्मेदारियाँ निभाने और वैध अनुरोधों का जवाब देने के लिए।',
    ], after: ['हम आपका निजी डेटा बेचते नहीं, विज्ञापन नहीं दिखाते और आपके डेटा से AI मॉडल को प्रशिक्षित नहीं करते।'] },
    { id: 'consent', h: '4. सहमति और आपके विकल्प', p: ['खाता बनाकर आप ऊपर बताए उद्देश्यों के लिए इस प्रोसेसिंग की सहमति देते हैं। आप कभी भी प्रोफ़ाइल से खाता हटाकर सहमति वापस ले सकते हैं; इससे पहले हुई वैध प्रोसेसिंग पर असर नहीं पड़ता। कुछ सुविधाएँ अपने डेटा के बिना नहीं चल सकतीं (जैसे खर्च के रिकॉर्ड के बिना हिसाब नहीं निकल सकता)।'] },
    { id: 'share', h: '5. आपका डेटा कौन देख सकता है', list: [
      `आपके ग्रुप के सदस्य उस ग्रुप के खर्च, हिसाब, नोटिस, रसीदें और सदस्यों के नाम देख सकते हैं। लंबित जॉइन अनुरोध ग्रुप के एडमिन को दिखते हैं।`,
      `Khatafy के प्लेटफ़ॉर्म एडमिन (ऐप सँभालने वाले लोग) सिर्फ़ कुल गिनती और तकनीकी जानकारी देख सकते हैं: जैसे यूज़र, ग्रुप और खर्च की संख्या, ग्रुप ID, सदस्य संख्या और तारीख़ें। वे नाम, ईमेल, फ़ोन नंबर, खर्च, रकम, नोट, रसीद या भुगतान नहीं देख सकते। एडमिन के काम, जैसे वैध कानूनी नोटिस या शिकायत के बाद किसी ग्रुप को आर्काइव करना, के लिए लिखित कारण ज़रूरी है और वे लॉग होते हैं।`,
      `हमारी ओर से डेटा प्रोसेस करने वाले सेवा प्रदाता: डेटाबेस, ऑथेंटिकेशन और फ़ाइल-स्टोरेज प्रदाता (Supabase), वेब होस्टिंग प्रदाता (Vercel), वेरिफ़िकेशन व रीसेट ईमेल भेजने वाला ईमेल प्रदाता (Brevo) और, यदि आप चुनें, Google लॉगिन। फ़ॉन्ट Google Fonts से लोड होते हैं, इसलिए ऐप खोलने पर Google को आपका IP पता और ब्राउज़र की जानकारी मिल सकती है। ये प्रदाता डेटा का उपयोग सिर्फ़ हमें सेवा देने के लिए कर सकते हैं।`,
      `वह हर व्यक्ति जिसके पास आपकी प्रोफ़ाइल फ़ोटो का सही लिंक है: प्रोफ़ाइल फ़ोटो सार्वजनिक जगह रखी जाती है ताकि आपके ग्रुप को दिखाई जा सके। ऐसी फ़ोटो न डालें जिसे आप लिंक से पहुँच योग्य नहीं रखना चाहते।`,
      `सरकारी प्राधिकरण, जब कानून हमसे जानकारी देने को कहे।`,
    ], after: [`हम आपका डेटा कभी सार्वजनिक नहीं करते और कभी बेचते नहीं।`] },
    { id: 'storage', h: '6. कुकीज़ और लोकल स्टोरेज', p: [`Khatafy विज्ञापन या ट्रैकिंग कुकीज़ का उपयोग नहीं करता। ब्राउज़र का लोकल स्टोरेज सिर्फ़ ज़रूरी कामों के लिए है: आपको लॉगिन रखना, भाषा और थीम याद रखना, यह याद रखना कि आपने वेलकम स्क्रीन देख ली है, ईमेल दोबारा भेजने का छोटा टाइमर, और सिंक के इंतज़ार में ऑफ़लाइन खर्च के ड्राफ़्ट (लॉग आउट करने पर ये हट जाते हैं)। आप इसे कभी भी ब्राउज़र से मिटा सकते हैं; तब आप लॉग आउट हो जाएँगे।`] },
    { id: 'retention', h: '7. डेटा कितने समय रखा जाता है', list: [
      `खाते और ग्रुप का डेटा आपका खाता चालू रहने तक रखा जाता है।`,
      `हिसाब बंद करना (वैकल्पिक): सबके हिसाब चुकाने के बाद ग्रुप का एडमिन किसी तारीख़ तक हिसाब बंद कर सकता है। सभी सदस्यों को सूचना जाती है और उन्हें देखने, PDF डाउनलोड करने या आपत्ति करने के 3 दिन मिलते हैं। उसके बाद उस तारीख़ तक के खर्च, भुगतान, रसीदें और उनसे जुड़ी सूचनाएँ व लॉग सभी सदस्यों के लिए हमेशा के लिए हट जाते हैं। ग्रुप के "हिसाब का इतिहास" में एक छोटा सारांश रहता है: अवधि, कुल खर्च, प्रति व्यक्ति राशि, हर व्यक्ति ने कितना दिया और कितना बनता था, और किसने किसे चुकाया। जो रकम अभी बाक़ी है वह बकाए के रूप में आगे जुड़ जाती है, इसलिए बकाया कभी नहीं खोता। हटाया गया ब्योरा वापस नहीं आता।`,
      `आप अपनी सूचनाएँ कभी भी हटा सकते हैं।`,
      `आपका खाता हटाने पर प्रोफ़ाइल और लॉगिन हट जाते हैं। जिन खर्च और भुगतान के रिकॉर्ड पर दूसरे सदस्य निर्भर हैं वे रखे जाते हैं (जब तक ग्रुप वह अवधि बंद न करे), और आपका नाम "Deleted user" से बदल दिया जाता है।`,
      `अगर कोई ग्रुप हटाया जाता है तो उसका डेटा हमारे चालू सिस्टम से हट जाता है; बैकअप में एक कॉपी सीमित समय तक रह सकती है, जो हमारे प्रदाता के बैकअप शेड्यूल से तय होता है। बंद अवधियों की रसीदों की फ़ाइलें एक निर्धारित क्लीन-अप जॉब से स्टोरेज से हटाई जाती हैं।`,
      `सुरक्षा लॉग सीमित समय तक रखकर फिर हटा दिए जाते हैं।`,
    ] },
    { id: 'rights', h: '8. आपके अधिकार', p: [`लागू कानून, जिसमें भारत का डिजिटल पर्सनल डेटा प्रोटेक्शन अधिनियम, 2023 शामिल है, के तहत आप ये कर सकते हैं:`], list: [
      `अपने डेटा तक पहुँच: आप उसे ऐप में देख सकते हैं और अपने ग्रुप के रिकॉर्ड का PDF स्टेटमेंट (स्टेटमेंट पेज) डाउनलोड कर सकते हैं। हमारे पास मौजूद आपके अन्य निजी डेटा की कॉपी के लिए हमें ईमेल करें, हम 30 दिन में जवाब देंगे।`,
      `अपना नाम, फ़ोन नंबर और फ़ोटो सुधारना (प्रोफ़ाइल)।`,
      `अपना खाता और निजी डेटा मिटाना (प्रोफ़ाइल मेन्यू → खाता हटाएँ)।`,
      `सहमति वापस लेना, और अपनी मृत्यु या अक्षमता की स्थिति में अधिकार इस्तेमाल करने के लिए किसी को नामित करना।`,
      `शिकायत दर्ज करना (धारा 12)। हम 7 दिन में जवाब और 30 दिन में समाधान की कोशिश करते हैं।`,
    ] },
    { id: 'security', h: '9. हम डेटा की सुरक्षा कैसे करते हैं', p: ['डेटा एन्क्रिप्टेड HTTPS कनेक्शन से जाता है। हर टेबल पर रो-लेवल सिक्योरिटी है, इसलिए आप सिर्फ़ अपने ग्रुप तक पहुँच सकते हैं। रसीदें निजी स्टोरेज में रहती हैं, इनवाइट कोड सिर्फ़ हैश के रूप में रखे जाते हैं और पैसे के रिकॉर्ड सिर्फ़ जोड़े जाते हैं, ऑडिट के साथ। कोई ऑनलाइन सेवा पूरी तरह सुरक्षित नहीं होती; आपके डेटा को प्रभावित करने वाला उल्लंघन होने पर हम कानून के अनुसार प्रभावित उपयोगकर्ताओं और प्राधिकरणों को बताएँगे।'] },
    { id: 'children', h: '10. बच्चे', p: ['Khatafy 18 वर्ष और उससे अधिक उम्र के लोगों के लिए है। हम जानबूझकर बच्चों का डेटा नहीं लेते। यदि आपको लगे कि किसी बच्चे ने खाता बनाया है तो हमसे संपर्क करें, हम खाता हटा देंगे।'] },
    { id: 'transfer', h: '11. डेटा कहाँ प्रोसेस होता है', p: ['हमारे सेवा प्रदाता डेटा आपके देश के बाहर के सर्वरों पर भी रख या प्रोसेस कर सकते हैं। ऐसे में हम उन्हीं प्रदाताओं पर भरोसा करते हैं जो उचित सुरक्षा उपाय अपनाते हैं।'] },
    { id: 'contact', h: '12. संपर्क, शिकायत और बदलाव', p: ['सवाल, अनुरोध और शिकायत: {email}। {grievance}', 'हम यह पॉलिसी बदल सकते हैं। बड़ा बदलाव होने पर लागू होने से पहले ऐप में या ईमेल से बताएँगे। ऊपर की तारीख़ ताज़ा संस्करण दिखाती है।'] },
  ],
};

const TERMS_EN: LegalDoc = {
  intro: 'These Terms of Use ("Terms") are an agreement between you and {company} ("we", "us") for using Khatafy. Please read them with our Privacy Policy. If you do not agree, please do not use Khatafy.',
  sections: [
    { id: 'accept', h: '1. Accepting these Terms', p: ['By creating an account, signing in or using Khatafy you agree to these Terms and the Privacy Policy. If you use Khatafy for a group or organisation you confirm you are allowed to do so on its behalf.'] },
    { id: 'eligibility', h: '2. Who can use Khatafy', list: [
      'You must be 18 or older and legally able to enter into a contract.',
      'You must give accurate information and keep your login details safe. You are responsible for activity under your account; tell us promptly if you think it has been compromised.',
      'One person, one account. Do not share your account or create accounts for someone else without permission.',
    ] },
    { id: 'service', h: '3. What Khatafy is — and is not', p: ['Khatafy is a record-keeping tool that helps people you trust track shared expenses and see who owes whom.'], list: [
      'Khatafy is not a bank, wallet, payment service, lender or financial adviser. We do not hold, move or guarantee money.',
      'A payment is shown as "settled" only because the people involved recorded and confirmed it. We do not verify bank or UPI transactions.',
      'Balances and statements are calculated from what you and your group enter. Nothing in the app is legal, tax or accounting advice.',
    ] },
    { id: 'groups', h: '4. Groups and shared records', list: [
      'Group admins can approve or remove members and manage group settings. Members can see the group\'s expenses, balances and member names.',
      'Entries are accountable records: they are never silently erased. An expense can be edited only within 60 minutes of being added; after that, or if it was wrong, it can be cancelled (voided). Edits and cancellations stay visible in the group history.',
      'Payments need the receiver\'s confirmation before they count towards a balance.',
      'Disagreements about money between members are between those members. We cannot decide or enforce them.',
      `A group admin may close the books up to a date once members have settled. Members get 3 days to review or object. After that the detailed expenses and payments up to that date are permanently deleted for every member, a summary stays in the group's history, and any unpaid amount is carried forward. Admins should do this only with the agreement of the group, and every member should download the statements they want to keep.`,
    ] },
    { id: 'content', h: '5. Your content', p: ['You own what you enter. You give us a limited licence to store, process and display it solely to run Khatafy for you and your group. You promise that you have the right to upload what you add (including receipts) and that it does not break anyone\'s rights or any law.'] },
    { id: 'use', h: '6. Acceptable use', p: ['You agree not to:'], list: [
      'enter false or misleading records to cheat other members;',
      'try to access other people\'s accounts or data, or probe or disrupt the service;',
      'upload unlawful, abusive, infringing or malicious content;',
      'use bots, scraping or automated means to overload or copy the service;',
      'use Khatafy for business payments, lending or any regulated financial activity.',
    ], after: ['We may suspend or remove access that breaks these rules or puts others at risk.'] },
    { id: 'availability', h: '7. Availability and changes', p: [`We work to keep Khatafy available and accurate but it is provided "as is" and "as available". There may be interruptions, bugs or maintenance. We may change or discontinue features; if we shut the service down we will give reasonable notice so you can download your records. Please download PDF statements of important records from time to time.`] },
    { id: 'termination', h: '8. Ending your use', p: [`You can stop using Khatafy and delete your account at any time from the Profile menu. We may suspend or end your access if you seriously or repeatedly break these Terms or the law. We may also archive (make read-only) a group, for example after a valid legal notice or a complaint about unlawful content; we record a reason for every such action. Sections that by nature should survive (for example liability limits and shared-record retention) continue after your account ends.`] },
    { id: 'ip', h: '9. Our rights', p: ['Khatafy, its name, logo, design and software belong to {company} or its licensors. You may use the service as intended but may not copy, resell or reverse-engineer it except as the law allows.'] },
    { id: 'liability', h: '10. Disclaimers and liability', p: ['To the fullest extent permitted by law: we give no warranty that the service will be error-free or uninterrupted or that entries made by users are accurate; and we are not liable for indirect, incidental or consequential losses, lost money owed between users, or data loss that could have been avoided by exporting your data. Our total liability for any claim relating to the service is limited to the greater of the amount you paid us in the last 12 months (if any) or INR 1,000. Nothing here limits liability that cannot be limited by law.'] },
    { id: 'law', h: '11. Governing law and disputes', p: ['These Terms are governed by the laws of India. Please contact us first so we can try to resolve a dispute informally. Subject to that, courts at {city} have exclusive jurisdiction, except where consumer-protection law gives you the right to go elsewhere.'] },
    { id: 'changes', h: '12. Changes to these Terms', p: ['We may update these Terms. For significant changes we will notify you in the app or by email before they apply. Continuing to use Khatafy after the change means you accept the updated Terms.'] },
    { id: 'contact', h: '13. Contact', p: ['Questions about these Terms: {email}. {grievance}'] },
  ],
};

const TERMS_HI: LegalDoc = {
  intro: 'ये उपयोग की शर्तें ("शर्तें") आपके और {company} ("हम") के बीच Khatafy के उपयोग का समझौता हैं। कृपया इन्हें हमारी प्राइवेसी पॉलिसी के साथ पढ़ें। सहमत न हों तो Khatafy का उपयोग न करें।',
  sections: [
    { id: 'accept', h: '1. शर्तें स्वीकार करना', p: ['खाता बनाकर, लॉगिन करके या Khatafy का उपयोग करके आप इन शर्तों और प्राइवेसी पॉलिसी से सहमत होते हैं। किसी ग्रुप या संस्था के लिए उपयोग करने पर आप पुष्टि करते हैं कि आपको उसकी ओर से ऐसा करने का अधिकार है।'] },
    { id: 'eligibility', h: '2. कौन उपयोग कर सकता है', list: [
      'आपकी उम्र 18 वर्ष या अधिक होनी चाहिए और आप कानूनन अनुबंध करने योग्य हों।',
      'सही जानकारी दें और अपना लॉगिन सुरक्षित रखें। अपने खाते की गतिविधि के लिए आप ज़िम्मेदार हैं; खाते से छेड़छाड़ का शक हो तो तुरंत बताएँ।',
      'एक व्यक्ति, एक खाता। अपना खाता साझा न करें और बिना अनुमति किसी और के नाम पर खाता न बनाएँ।',
    ] },
    { id: 'service', h: '3. Khatafy क्या है — और क्या नहीं', p: ['Khatafy रिकॉर्ड रखने का टूल है जो भरोसेमंद लोगों को साझा खर्च लिखने और कौन किसे कितना देगा यह देखने में मदद करता है।'], list: [
      'Khatafy बैंक, वॉलेट, पेमेंट सेवा, कर्ज़दाता या वित्तीय सलाहकार नहीं है। हम पैसा रखते, भेजते या उसकी गारंटी नहीं देते।',
      'कोई भुगतान "चुकता" तभी दिखता है जब संबंधित लोगों ने उसे दर्ज और स्वीकार किया हो। हम बैंक या UPI लेन-देन की जाँच नहीं करते।',
      'हिसाब और स्टेटमेंट आपके और ग्रुप के डाले डेटा से निकलते हैं। ऐप में कुछ भी कानूनी, कर या अकाउंटिंग सलाह नहीं है।',
    ] },
    { id: 'groups', h: '4. ग्रुप और साझा रिकॉर्ड', list: [
      'ग्रुप एडमिन सदस्यों को मंज़ूर या हटा सकते हैं और ग्रुप सेटिंग सँभाल सकते हैं। सदस्य ग्रुप के खर्च, हिसाब और सदस्यों के नाम देख सकते हैं।',
      'एंट्री जवाबदेह रिकॉर्ड हैं: वे चुपचाप मिटाई नहीं जातीं। खर्च जोड़ने के 60 मिनट के भीतर ही बदला जा सकता है; उसके बाद या गलत होने पर उसे रद्द (void) किया जा सकता है। बदलाव और रद्दीकरण ग्रुप के इतिहास में दिखते रहते हैं।',
      'भुगतान तभी हिसाब में गिना जाता है जब पाने वाला उसे स्वीकार कर ले।',
      'सदस्यों के बीच पैसों का विवाद उन्हीं के बीच का है। हम उसका फ़ैसला या पालन नहीं करवा सकते।',
      `सदस्यों के हिसाब चुकाने के बाद ग्रुप का एडमिन किसी तारीख़ तक हिसाब बंद कर सकता है। सदस्यों को देखने या आपत्ति करने के 3 दिन मिलते हैं। उसके बाद उस तारीख़ तक के खर्च और भुगतान का ब्योरा सभी सदस्यों के लिए हमेशा के लिए हट जाता है, ग्रुप के इतिहास में सारांश रहता है, और जो रकम बाक़ी है वह आगे जुड़ जाती है। एडमिन को यह ग्रुप की सहमति से ही करना चाहिए, और हर सदस्य को जो स्टेटमेंट रखना हो वह डाउनलोड कर लेना चाहिए।`,
    ] },
    { id: 'content', h: '5. आपकी सामग्री', p: ['जो आप डालते हैं उसके मालिक आप हैं। आप हमें उसे सिर्फ़ आपके और आपके ग्रुप के लिए Khatafy चलाने हेतु सहेजने, प्रोसेस करने और दिखाने का सीमित अधिकार देते हैं। आप भरोसा दिलाते हैं कि जो अपलोड करते हैं (रसीदें सहित) उसका आपको अधिकार है और वह किसी के अधिकार या कानून का उल्लंघन नहीं करता।'] },
    { id: 'use', h: '6. सही उपयोग', p: ['आप सहमत हैं कि आप:'], list: [
      'दूसरे सदस्यों को धोखा देने के लिए झूठे या भ्रामक रिकॉर्ड नहीं डालेंगे;',
      'दूसरों के खाते या डेटा तक पहुँचने या सेवा को परखने/बाधित करने की कोशिश नहीं करेंगे;',
      'गैरकानूनी, अपमानजनक, उल्लंघनकारी या हानिकारक सामग्री अपलोड नहीं करेंगे;',
      'बॉट, स्क्रैपिंग या स्वचालित तरीकों से सेवा पर बोझ नहीं डालेंगे या उसकी नकल नहीं करेंगे;',
      'Khatafy को व्यावसायिक भुगतान, उधार या किसी नियंत्रित वित्तीय गतिविधि के लिए इस्तेमाल नहीं करेंगे।',
    ], after: ['इन नियमों को तोड़ने या दूसरों को जोखिम में डालने वाली पहुँच को हम रोक या हटा सकते हैं।'] },
    { id: 'availability', h: '7. उपलब्धता और बदलाव', p: [`हम Khatafy को उपलब्ध और सही रखने की कोशिश करते हैं, लेकिन यह "जैसा है" और "जैसा उपलब्ध है" के आधार पर दिया जाता है। रुकावट, बग या मेंटेनेंस हो सकता है। हम फ़ीचर बदल या बंद कर सकते हैं; सेवा बंद करने पर हम उचित नोटिस देंगे ताकि आप अपने रिकॉर्ड डाउनलोड कर सकें। कृपया ज़रूरी रिकॉर्ड के PDF स्टेटमेंट समय-समय पर डाउनलोड करते रहें।`] },
    { id: 'termination', h: '8. उपयोग समाप्त करना', p: [`आप कभी भी Khatafy का उपयोग बंद कर सकते हैं और प्रोफ़ाइल मेन्यू से अपना खाता हटा सकते हैं। अगर आप इन शर्तों या कानून का गंभीर या बार-बार उल्लंघन करें तो हम आपकी पहुँच रोक या समाप्त कर सकते हैं। हम किसी ग्रुप को आर्काइव (सिर्फ़-पढ़ने योग्य) भी कर सकते हैं, जैसे वैध कानूनी नोटिस या गैरकानूनी सामग्री की शिकायत के बाद; ऐसी हर कार्रवाई का कारण दर्ज किया जाता है। जो धाराएँ स्वभाव से जारी रहनी चाहिए (जैसे ज़िम्मेदारी की सीमाएँ और साझा रिकॉर्ड का रखरखाव) वे खाता बंद होने के बाद भी लागू रहती हैं।`] },
    { id: 'ip', h: '9. हमारे अधिकार', p: ['Khatafy, उसका नाम, लोगो, डिज़ाइन और सॉफ़्टवेयर {company} या उसके लाइसेंसदाताओं का है। आप सेवा को तय तरीके से इस्तेमाल कर सकते हैं, पर कानून जितनी छूट दे उसके अलावा उसकी नकल, पुनर्विक्रय या रिवर्स-इंजीनियरिंग नहीं कर सकते।'] },
    { id: 'liability', h: '10. अस्वीकरण और ज़िम्मेदारी', p: ['कानून जितनी अनुमति दे, उस सीमा तक: हम इसकी गारंटी नहीं देते कि सेवा त्रुटि-रहित या निर्बाध होगी, या उपयोगकर्ताओं की डाली एंट्री सही होंगी; और हम अप्रत्यक्ष, आकस्मिक या परिणामी नुकसान, उपयोगकर्ताओं के बीच बकाया पैसे की हानि, या ऐसे डेटा-नुकसान के लिए ज़िम्मेदार नहीं हैं जो डेटा एक्सपोर्ट करके टाला जा सकता था। सेवा से जुड़े किसी भी दावे पर हमारी कुल ज़िम्मेदारी पिछले 12 महीनों में आपके हमें दिए पैसे (यदि कोई हो) या ₹1,000, जो अधिक हो, तक सीमित है। यहाँ कुछ भी वह ज़िम्मेदारी सीमित नहीं करता जो कानून से सीमित नहीं हो सकती।'] },
    { id: 'law', h: '11. लागू कानून और विवाद', p: ['ये शर्तें भारत के कानूनों के अधीन हैं। कृपया पहले हमसे संपर्क करें ताकि हम विवाद आपसी बातचीत से सुलझाने की कोशिश कर सकें। इसके बाद {city} की अदालतों को विशेष क्षेत्राधिकार होगा, सिवाय वहाँ जहाँ उपभोक्ता-संरक्षण कानून आपको कहीं और जाने का अधिकार देता है।'] },
    { id: 'changes', h: '12. शर्तों में बदलाव', p: ['हम इन शर्तों को बदल सकते हैं। बड़े बदलाव लागू होने से पहले ऐप में या ईमेल से बताएँगे। बदलाव के बाद Khatafy का उपयोग जारी रखने का मतलब है कि आप नई शर्तें स्वीकार करते हैं।'] },
    { id: 'contact', h: '13. संपर्क', p: ['इन शर्तों पर सवाल: {email}। {grievance}'] },
  ],
};

export const LEGAL: Record<'privacy' | 'terms', Record<'en' | 'hi', LegalDoc>> = {
  privacy: { en: PRIVACY_EN, hi: PRIVACY_HI },
  terms: { en: TERMS_EN, hi: TERMS_HI },
};
