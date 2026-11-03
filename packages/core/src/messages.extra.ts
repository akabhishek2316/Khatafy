import type { Dict } from './i18n';

// Added in v1.1: welcome, profile menu, notification delete, per-person share, help/FAQ, admin panel.
const d: Dict = {};
const add = (k: string, en: string, hi: string) => { d[k] = { en, hi }; };

// ---- welcome
add('wel.slogan', 'Kharcha Sabka, Hisab Pakka!', 'खर्चा सबका, हिसाब पक्का!');
add('wel.s1.title', 'Welcome to Khatafy!', 'Khatafy में स्वागत है!');
add('wel.s1.text', 'Your smart companion for tracking and sharing expenses with friends, roommates and more.', 'दोस्तों, रूममेट्स और ग्रुप के साथ खर्च लिखने और बाँटने का आपका स्मार्ट साथी।');
add('wel.s2.title', 'Track & Manage Expenses Easily', 'खर्च आसानी से लिखें और सँभालें');
add('wel.s2.text', 'Add your daily expenses in seconds and keep everything organized.', 'रोज़ का खर्च कुछ ही सेकंड में जोड़ें और सब कुछ व्यवस्थित रखें।');
add('wel.s2.note', 'Keep your register digital with Khatafy!', 'अपना रजिस्टर Khatafy के साथ डिजिटल रखें!');
add('wel.s3.title', 'Split Bills Fairly & Settle Quickly', 'बिल सही बाँटें और जल्दी हिसाब चुकाएँ');
add('wel.s3.text', 'Divide expenses among your group and settle dues without any hassle.', 'ग्रुप में खर्च बाँटें और बकाया बिना झंझट चुकाएँ।');
add('wel.s3.note', 'No more awkward money talks!', 'पैसों की अटपटी बातें अब बंद!');
add('wel.next', 'Next', 'आगे');
add('wel.back', 'Back', 'पीछे');
add('wel.skip', 'Skip', 'छोड़ें');
add('wel.start', 'Get Started', 'शुरू करें');

// ---- profile menu
add('menu.open', 'Open menu', 'मेन्यू खोलें');
add('menu.profile', 'My profile', 'मेरी प्रोफ़ाइल');
add('menu.prefs', 'Language & theme', 'भाषा और थीम');
add('menu.password', 'Change password', 'पासवर्ड बदलें');
add('menu.privacy', 'Privacy & my data', 'प्राइवेसी और मेरा डेटा');
add('menu.account', 'Delete account', 'खाता हटाएँ');
add('menu.help', 'Help & FAQs', 'मदद और सवाल-जवाब');
add('menu.admin', 'Admin panel', 'एडमिन पैनल');
add('menu.logout', 'Log out', 'लॉग आउट');

// ---- notifications delete
add('notif.delete', 'Delete notification', 'सूचना हटाएँ');
add('notif.delete_all', 'Delete all', 'सभी हटाएँ');
add('notif.delete_all_confirm', 'Delete all your notifications? This cannot be undone.', 'क्या आपकी सभी सूचनाएँ हटानी हैं? यह वापस नहीं होगा।');
add('notif.deleted', 'Deleted', 'हटा दिया');

// ---- per-person share
add('share.title', 'Each person\'s share', 'हर व्यक्ति का हिस्सा');
add('share.avg', 'Equal share per person', 'हर व्यक्ति पर बराबर हिस्सा');
add('share.avg_hint', 'Total ÷ {n} members (only a guide; real shares follow each expense\'s split).', 'कुल ÷ {n} सदस्य (सिर्फ़ अंदाज़ा; असली हिस्सा हर खर्च के बँटवारे से बनता है)।');
add('share.col_share', 'Share', 'हिस्सा');
add('share.col_percent', '% of total', 'कुल का %');
add('share.col_paid', 'Paid', 'दिया');
add('share.col_diff', 'Paid − share', 'दिया − हिस्सा');
add('share.total', 'Total', 'कुल');

// ---- help & FAQ
add('help.title', 'Help & FAQs', 'मदद और सवाल-जवाब');
add('help.sub', 'Quick answers to common questions.', 'आम सवालों के आसान जवाब।');
add('help.contact', 'Still stuck? Write to us', 'अब भी दिक्कत है? हमें लिखें');
add('help.q1', 'How do I start a room?', 'रूम कैसे शुरू करें?');
add('help.a1', 'Open "Groups", create a group, then invite roommates from Invitations. They sign up, enter the code, and an admin approves the request.', '"ग्रुप" खोलें, नया ग्रुप बनाएँ, फिर "इनविटेशन" से रूममेट्स को बुलाएँ। वे साइन-अप करके कोड डालते हैं और एडमिन अनुरोध मंज़ूर करता है।');
add('help.q2', 'How is an expense split?', 'खर्च कैसे बँटता है?');
add('help.a2', 'Choose equal, exact amounts or percentages while adding an expense. Money is calculated in paise so the shares always add up to the total.', 'खर्च जोड़ते समय बराबर, तय रकम या प्रतिशत चुनें। गणना पैसे में होती है, इसलिए हिस्सों का जोड़ हमेशा कुल के बराबर रहता है।');
add('help.q3', 'Where do I see each person\'s share for the month?', 'महीने में हर किसी का हिस्सा कहाँ दिखेगा?');
add('help.a3', 'On Home, Balances (Monthly tab) and Statement. Each shows what every member\'s share was, what they paid, and the difference.', 'होम, बैलेंस (मंथली टैब) और स्टेटमेंट में। तीनों जगह हर सदस्य का हिस्सा, उसने क्या दिया और अंतर दिखता है।');
add('help.q4', 'I entered a wrong expense. What now?', 'गलत खर्च लिख दिया, अब क्या करें?');
add('help.a4', 'Open the expense and edit it within the edit window, or cancel it with a reason. Cancelled expenses stay in history but do not count.', 'खर्च खोलकर एडिट विंडो में बदलें, या कारण लिखकर रद्द करें। रद्द खर्च इतिहास में रहता है पर गिना नहीं जाता।');
add('help.q5', 'How do payments work?', 'भुगतान कैसे काम करता है?');
add('help.a5', 'You record a payment and the receiver confirms it. Khatafy does not move money or check your bank; it is a manual record.', 'आप भुगतान दर्ज करते हैं और पाने वाला उसे पक्का करता है। Khatafy पैसे नहीं भेजता और बैंक नहीं जाँचता; यह हाथ से बना रिकॉर्ड है।');
add('help.q6', 'Who can see my data?', 'मेरा डेटा कौन देख सकता है?');
add('help.a6', 'Only members of your groups. The app maintainers see only totals (like number of users) and cannot read your expenses, names or amounts.', 'सिर्फ़ आपके ग्रुप के सदस्य। ऐप सँभालने वाले सिर्फ़ कुल गिनती (जैसे यूज़र संख्या) देख पाते हैं; आपके खर्च, नाम या रकम नहीं पढ़ सकते।');
add('help.q7', 'Can I download or delete my data?', 'क्या मैं अपना डेटा डाउनलोड या डिलीट कर सकता/सकती हूँ?');
add('help.a7', 'Yes. Use the profile menu: "Privacy & my data" to export, or "Delete account" to remove your account.', 'हाँ। प्रोफ़ाइल मेन्यू में "प्राइवेसी और मेरा डेटा" से एक्सपोर्ट करें, या "खाता हटाएँ" से खाता हटाएँ।');
add('help.q8', 'How do I install the app on my phone?', 'फ़ोन में ऐप कैसे इंस्टॉल करें?');
add('help.a8', 'Chrome: menu → Install app / Add to Home screen. iPhone: Safari → Share → Add to Home Screen.', 'Chrome: मेन्यू → Install app / Add to Home screen। iPhone: Safari → Share → Add to Home Screen।');
add('help.q9', 'I forgot my password.', 'पासवर्ड भूल गया/गई।');
add('help.a9', 'On the login page tap "Forgot password" and follow the email link.', 'लॉगिन पेज पर "पासवर्ड भूल गए" दबाएँ और ईमेल का लिंक खोलें।');

// ---- admin panel
add('admin.title', 'Admin panel', 'एडमिन पैनल');
add('admin.privacy_note', 'Privacy-safe view: only counts and technical data. You cannot see names, emails, expenses, amounts, notes or receipts. Every change is logged.', 'प्राइवेसी-सुरक्षित व्यू: सिर्फ़ गिनती और तकनीकी डेटा। नाम, ईमेल, खर्च, रकम, नोट या रसीद नहीं दिखते। हर बदलाव लॉग होता है।');
add('admin.no_access', 'You do not have access to this page.', 'आपको इस पेज का एक्सेस नहीं है।');
add('admin.tab_overview', 'Overview', 'सारांश');
add('admin.tab_groups', 'Groups', 'ग्रुप');
add('admin.tab_status', 'App status', 'ऐप स्टेटस');
add('admin.tab_audit', 'Audit log', 'ऑडिट लॉग');
add('admin.users', 'Users', 'यूज़र');
add('admin.users_7d', 'New users (7 days)', 'नए यूज़र (7 दिन)');
add('admin.users_30d', 'New users (30 days)', 'नए यूज़र (30 दिन)');
add('admin.groups', 'Groups', 'ग्रुप');
add('admin.groups_active', 'Active groups', 'चालू ग्रुप');
add('admin.groups_archived', 'Archived groups', 'आर्काइव ग्रुप');
add('admin.expenses_30d', 'Expenses (30 days)', 'खर्च (30 दिन)');
add('admin.payments_30d', 'Payments (30 days)', 'भुगतान (30 दिन)');
add('admin.signups', 'Sign-ups, last 14 days', 'पिछले 14 दिन के साइन-अप');
add('admin.group_id', 'Group ID', 'ग्रुप ID');
add('admin.members', 'Members', 'सदस्य');
add('admin.archive', 'Archive', 'आर्काइव करें');
add('admin.restore', 'Restore', 'वापस चालू करें');
add('admin.reason', 'Reason (min 10 characters, logged)', 'कारण (कम से कम 10 अक्षर, लॉग होगा)');
add('admin.maintenance', 'Show maintenance notice', 'मेंटेनेंस नोटिस दिखाएँ');
add('admin.announcement', 'Announcement for all users (max 300)', 'सभी यूज़र के लिए घोषणा (अधिकतम 300)');
add('admin.save', 'Save', 'सेव करें');
add('admin.saved', 'Saved', 'सेव हो गया');
add('admin.banner_maint', 'Maintenance in progress. Some things may be slow.', 'मेंटेनेंस चल रहा है। कुछ चीज़ें धीमी हो सकती हैं।');
add('err.NOT_PLATFORM_ADMIN', 'You do not have admin access.', 'आपके पास एडमिन एक्सेस नहीं है।');
add('err.REASON_REQUIRED', 'Please write a reason (10-300 characters).', 'कृपया कारण लिखें (10-300 अक्षर)।');
add('err.INVALID_STATUS', 'Invalid status.', 'स्टेटस सही नहीं है।');
add('err.GROUP_NOT_FOUND', 'Group not found.', 'ग्रुप नहीं मिला।');

add('auth.current_password', 'Current password', 'मौजूदा पासवर्ड');
add('err.CURRENT_PASSWORD_WRONG', 'Current password is incorrect.', 'मौजूदा पासवर्ड गलत है।');
add('err.PASSWORD_SAME', 'New password must be different from the current one.', 'नया पासवर्ड मौजूदा पासवर्ड से अलग होना चाहिए।');

// ---- v1.2 wording + statement person filter
add('dash.you_pay', 'You need to pay {to} {amount}', 'आपको {to} को {amount} देने हैं');
add('dash.pays_you', '{from} needs to pay you {amount}', '{from} से आपको {amount} मिलने हैं');
add('profile.privacy_note', 'Your data is visible only to members of your groups. Use the PDF statement to keep a copy of your records.', 'आपका डेटा सिर्फ़ आपके ग्रुप के सदस्यों को दिखता है। रिकॉर्ड की कॉपी के लिए PDF स्टेटमेंट डाउनलोड करें।');
add('stmt.person', 'View for', 'किसके लिए देखें');
add('stmt.everyone', 'Everyone', 'सभी');
add('stmt.stat_daily', 'Average per day', 'रोज़ का औसत खर्च');
add('stmt.stat_biggest', 'Biggest expense', 'सबसे बड़ा खर्च');
add('stmt.stat_topcat', 'Top category', 'सबसे ज़्यादा खर्च की श्रेणी');
add('stmt.person_paid', 'Paid by {name}', '{name} ने दिया');
add('stmt.person_share', 'Share of {name}', '{name} का हिस्सा');
add('stmt.person_diff', 'Difference (paid − share)', 'अंतर (दिया − हिस्सा)');
add('stmt.person_empty', 'No expenses for this person in this period.', 'इस अवधि में इस व्यक्ति का कोई खर्च नहीं।');
add('stmt.their_share', 'Share', 'हिस्सा');
add('stmt.for_person', 'Statement for {name}', '{name} का स्टेटमेंट');

export const extraMessages = d;
