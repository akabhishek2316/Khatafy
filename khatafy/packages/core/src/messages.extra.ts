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

// ---- v1.3 auto-delete (retention)

// ---- v1.4 settle & close (replaces auto-delete)
add('nav.close', 'Close & history', 'हिसाब बंद और इतिहास');
add('close.title', 'Settle & close', 'हिसाब बंद करें');
add('close.intro', 'After everyone has settled, close the books up to a date. The detailed expenses are deleted and only a short summary stays: total, per-head, who paid what and who paid whom. Anything still unpaid is carried forward, never lost.', 'सबके हिसाब चुकाने के बाद एक तारीख़ तक हिसाब बंद करें। खर्च के ब्योरे हट जाते हैं और सिर्फ़ छोटा सारांश रहता है: कुल, प्रति व्यक्ति, किसने कितना दिया और किसने किसे चुकाया। जो बकाया है वह आगे जुड़ जाता है, खोता नहीं।');
add('close.new_title', 'Close a period', 'एक अवधि बंद करें');
add('close.end_date', 'Close up to (date)', 'इस तारीख़ तक बंद करें');
add('close.request', 'Request close', 'बंद करने का अनुरोध');
add('close.confirm_title', 'Request to close?', 'बंद करने का अनुरोध करें?');
add('close.confirm_text', 'All members are notified and can review for 3 days. After that, expenses and payments up to {date} are permanently deleted and only the summary stays. Unpaid dues are carried forward.', 'सभी सदस्यों को सूचना जाएगी और वे 3 दिन तक देख सकते हैं। उसके बाद {date} तक के खर्च और भुगतान हमेशा के लिए हट जाएँगे और सिर्फ़ सारांश रहेगा। बकाया आगे जुड़ जाएगा।');
add('close.pending_title', 'Close waiting for review', 'बंद करना समीक्षा के इंतज़ार में');
add('close.pending_text', 'Up to {date}. Will be finalised on {final} if nobody objects. Download your PDF before then.', '{date} तक। किसी ने आपत्ति न की तो {final} को पूरा होगा। उससे पहले अपना PDF डाउनलोड कर लें।');
add('close.preview', 'Preview (final numbers are taken when the close is finalised)', 'पूर्वावलोकन (अंतिम आँकड़े बंद होते समय लिए जाते हैं)');
add('close.requested_by', 'Requested by {name}', '{name} ने अनुरोध किया');
add('close.objections', 'Objections', 'आपत्तियाँ');
add('close.object', 'I object', 'मुझे आपत्ति है');
add('close.object_reason', 'Why do you object?', 'आपत्ति का कारण क्या है?');
add('close.withdraw', 'Withdraw my objection', 'मेरी आपत्ति वापस लें');
add('close.cancel', 'Cancel close', 'बंद करना रद्द करें');
add('close.blocked', 'Waiting: an objection must be withdrawn or the close cancelled.', 'रुका हुआ: आपत्ति वापस ली जाए या बंद करना रद्द किया जाए।');
add('close.history', 'Settled history', 'हिसाब का इतिहास');
add('close.none', 'No closed periods yet.', 'अभी कोई अवधि बंद नहीं हुई।');
add('close.period', 'Period', 'अवधि');
add('close.total', 'Total spent', 'कुल खर्च');
add('close.count', 'Expenses', 'खर्च');
add('close.per_head', 'Per head (average)', 'प्रति व्यक्ति (औसत)');
add('close.col_member', 'Member', 'सदस्य');
add('close.col_paid', 'Paid', 'दिया');
add('close.col_share', 'Share', 'हिस्सा');
add('close.col_net', 'Balance', 'बाक़ी');
add('close.payments', 'Payments made', 'किए गए भुगतान');
add('close.dues', 'Dues carried forward', 'आगे जुड़ा बकाया');
add('close.no_dues', 'Everyone was settled.', 'सब बराबर था।');
add('close.pays', '{from} to pay {to}: {amount}', '{from} को {to} को {amount} देने हैं');
add('close.pdf', '⬇ PDF', '⬇ PDF');
add('close.final_note', 'Individual expense details are deleted after closing; this summary stays.', 'बंद होने के बाद अलग-अलग खर्च का ब्योरा हट जाता है; यह सारांश रहता है।');
add('close.closed_on', 'Closed on {date}', '{date} को बंद हुआ');
add('close.prev_balance', 'Includes earlier balance {amount}', 'पिछला बकाया शामिल: {amount}');
add('notif.close_requested', '{name} asked to close the books up to {date}. Review and download your statement within 3 days.', '{name} ने {date} तक हिसाब बंद करने को कहा है। 3 दिन में देखें और अपना स्टेटमेंट डाउनलोड कर लें।');
add('notif.close_objection', '{name} objected to closing the period.', '{name} ने हिसाब बंद करने पर आपत्ति की है।');
add('notif.close_cancelled', '{name} cancelled the period close.', '{name} ने हिसाब बंद करना रद्द कर दिया।');
add('notif.close_done', 'The period up to {date} was closed. The summary is in Settled history.', '{date} तक की अवधि बंद हो गई। सारांश "हिसाब का इतिहास" में है।');
add('err.INVALID_CLOSE_DATE', 'Choose a date that is not in the future and is after the last closed period.', 'ऐसी तारीख़ चुनें जो भविष्य की न हो और पिछली बंद अवधि के बाद की हो।');
add('err.CLOSE_ALREADY_PENDING', 'A close is already waiting for review.', 'एक बंद करना पहले से समीक्षा में है।');
add('err.NOTHING_TO_CLOSE', 'There are no expenses up to that date.', 'उस तारीख़ तक कोई खर्च नहीं है।');
add('err.CLOSE_NOT_FOUND', 'Close request not found.', 'बंद करने का अनुरोध नहीं मिला।');
add('err.CLOSE_NOT_PENDING', 'This close is no longer pending.', 'यह अनुरोध अब लंबित नहीं है।');
add('err.PERIOD_CLOSED', 'This date falls in a closed period. Use a later date.', 'यह तारीख़ बंद हो चुकी अवधि में है। बाद की तारीख़ चुनें।');
add('help.q10', 'What does "Close & history" do?', '"हिसाब बंद और इतिहास" क्या करता है?');
add('help.a10', 'When everyone has settled, an admin can close the books up to a date. Members get 3 days to review or object. Then detailed expenses are deleted and a summary (total, per-head, who paid whom) stays. Unpaid dues are carried forward.', 'सबके हिसाब चुकाने पर एडमिन किसी तारीख़ तक हिसाब बंद कर सकता है। सदस्यों को देखने या आपत्ति करने के 3 दिन मिलते हैं। फिर खर्च का ब्योरा हट जाता है और सारांश (कुल, प्रति व्यक्ति, किसने किसे चुकाया) रहता है। जो बकाया है वह आगे जुड़ता है।');

export const extraMessages = d;
