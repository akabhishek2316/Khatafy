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
add('close.new_title', 'Close a period', 'एक अवधि बंद करें');
add('close.end_date', 'Close up to (date)', 'इस तारीख़ तक बंद करें');
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
add('close.prev_balance', 'Includes earlier balance {amount}', 'पिछला बकाया शामिल: {amount}');
add('err.INVALID_CLOSE_DATE', 'Choose a date that is not in the future and is after the last closed period.', 'ऐसी तारीख़ चुनें जो भविष्य की न हो और पिछली बंद अवधि के बाद की हो।');
add('err.NOTHING_TO_CLOSE', 'There are no expenses up to that date.', 'उस तारीख़ तक कोई खर्च नहीं है।');
add('err.PERIOD_CLOSED', 'This date falls in a closed period. Use a later date.', 'यह तारीख़ बंद हो चुकी अवधि में है। बाद की तारीख़ चुनें।');
add('help.q10', 'What does "Close & history" do?', '"हिसाब बंद और इतिहास" क्या करता है?');

// ---- v1.6 close = save summary (nothing deleted); 12-month monthly cleanup
add('close.intro', 'Close the books up to a date. A summary is saved in History and you can download its PDF any time. Closed expenses stop showing in Expenses, and dates up to the close cannot be changed. Any amount still unpaid stays in Balances as an earlier balance.', 'किसी तारीख़ तक हिसाब बंद करें। सारांश इतिहास में सेव हो जाता है और उसका PDF कभी भी डाउनलोड कर सकते हैं। बंद खर्च अब खर्च वाले पेज में नहीं दिखते, और बंद तारीख़ों तक कुछ बदला नहीं जा सकता। जो रकम अभी बाक़ी है वह बैलेंस में पिछले बकाए के रूप में रहती है।');
add('close.preview_title', 'What will be closed', 'क्या बंद होगा');
add('close.request', 'Close now', 'अभी बंद करें');
add('close.confirm_title', 'Close the books?', 'हिसाब बंद करें?');
add('close.confirm_text', 'Everything up to {date} will be closed and saved in History. It will no longer show in Expenses and nothing can be added or changed for those dates. This cannot be undone.', '{date} तक सब कुछ बंद होकर इतिहास में सेव हो जाएगा। वह खर्च वाले पेज में नहीं दिखेगा और उन तारीख़ों के लिए कुछ जोड़ा या बदला नहीं जा सकेगा। यह वापस नहीं होगा।');
add('close.final_note', 'Saved summary of this closed period.', 'इस बंद अवधि का सेव किया हुआ सारांश।');
add('close.closed_on', 'Closed on {date} by {name}', '{date} को {name} ने बंद किया');
add('close.keep_note', 'Closed periods are kept for the last 12 months, then removed in the monthly cleanup.', 'बंद अवधियाँ पिछले 12 महीने तक रखी जाती हैं, फिर मासिक सफ़ाई में हट जाती हैं।');
add('notif.close_done', '{name} closed the books up to {date}. The summary is in Close & history.', '{name} ने {date} तक हिसाब बंद कर दिया। सारांश "हिसाब बंद और इतिहास" में है।');
add('bal.lifetime', 'Current', 'अभी का');
add('bal.lifetime_hint', 'What each person gets or owes now, after the last close. Earlier unpaid amounts are shown separately.', 'हर किसी को अभी कितना मिलना या देना है, पिछले क्लोज़ के बाद। पहले का बाक़ी अलग से दिखता है।');
add('stmt.limit_hint', 'Statements are available for the last 12 months only. Older data is removed in the monthly cleanup.', 'स्टेटमेंट सिर्फ़ पिछले 12 महीनों के मिलते हैं। उससे पुराना डेटा मासिक सफ़ाई में हट जाता है।');
add('help.a10', 'An admin closes the books up to a date after a confirmation. A summary (total, per-head, who paid whom) is saved in History with a PDF. Closed expenses leave the Expenses page, but nothing is deleted at that time. Data older than the last 12 months is removed on the last day of each month.', 'एडमिन पुष्टि के बाद किसी तारीख़ तक हिसाब बंद करता है। सारांश (कुल, प्रति व्यक्ति, किसने किसे चुकाया) PDF के साथ इतिहास में सेव होता है। बंद खर्च खर्च वाले पेज से हट जाते हैं, पर उस समय कुछ डिलीट नहीं होता। पिछले 12 महीनों से पुराना डेटा हर महीने की आख़िरी तारीख़ को हट जाता है।');

// ---- v1.6.1 payer is always the person adding the expense
add('expense.paid_by_hint', 'Expenses are always recorded as paid by you.', 'खर्च हमेशा आपके नाम से, यानी आपने दिया, ऐसे दर्ज होता है।');
add('err.PAYER_MUST_BE_YOU', 'You can only add expenses that you paid yourself.', 'आप सिर्फ़ वही खर्च जोड़ सकते हैं जो आपने खुद दिया हो।');
add('err.PAYER_CHANGE_NOT_ALLOWED', 'The person who paid cannot be changed.', 'किसने दिया, यह बदला नहीं जा सकता।');
add('help.q11', 'Can I add an expense on behalf of someone else?', 'क्या मैं किसी और की तरफ़ से खर्च जोड़ सकता/सकती हूँ?');
add('help.a11', 'No. Everyone adds only the expenses they paid themselves, from their own account. You choose who shares the expense, but the payer is always you.', 'नहीं। हर कोई सिर्फ़ वही खर्च अपने खाते से जोड़ता है जो उसने खुद दिया हो। खर्च में किनका हिस्सा है यह आप चुनते हैं, पर देने वाला हमेशा आप ही होते हैं।');

// ---- v1.7 earlier (closed-period) dues shown separately
add('earlier.title_pay', 'Earlier dues: you need to pay', 'पिछला बकाया: आपको देना है');
add('earlier.title_get', 'Earlier dues: you will get', 'पिछला बकाया: आपको मिलना है');
add('earlier.title_all', 'Earlier unpaid dues', 'पिछला बाक़ी बकाया');
add('earlier.hint', 'The books up to {date} were closed, but these amounts are still unpaid. They are shown separately and are NOT mixed with new expenses.', '{date} तक का हिसाब बंद हो चुका है, पर ये रकम अभी बाक़ी हैं। ये अलग दिखती हैं और नए खर्च में नहीं जुड़तीं।');
add('earlier.reason', 'To settle the period up to {date}', '{date} तक की अवधि का हिसाब चुकाने के लिए');
add('earlier.balance_line', 'Earlier unpaid (separate): {amount}', 'पिछला बाक़ी (अलग): {amount}');
add('earlier.rule', 'A payment first settles earlier dues between the same two people; the rest counts for the current period.', 'भुगतान पहले उन्हीं दो लोगों के पिछले बकाए को चुकाता है; बाक़ी रकम मौजूदा अवधि में गिनी जाती है।');

// ---- v1.7.1 date/time is automatic
add('expense.date_now', 'Now (recorded automatically)', 'अभी (अपने-आप दर्ज होगा)');
add('expense.date_hint', 'Date and time are set automatically and cannot be changed.', 'तारीख़ और समय अपने-आप लगते हैं और बदले नहीं जा सकते।');
add('help.q12', 'Can I choose a different date or time for an expense?', 'क्या मैं खर्च की तारीख़ या समय बदल सकता/सकती हूँ?');
add('help.a12', 'No. An expense is saved with the current date and time and it cannot be changed later, so records stay honest. If you made a mistake, void the expense and add it again.', 'नहीं। खर्च मौजूदा तारीख़ और समय के साथ सेव होता है और बाद में बदला नहीं जा सकता, ताकि रिकॉर्ड सही रहें। गलती हो तो खर्च रद्द करके दोबारा जोड़ें।');

add('help.q13', 'Can I choose the date or time of a payment?', 'क्या मैं भुगतान की तारीख़ या समय चुन सकता/सकती हूँ?');
add('help.a13', 'No. A payment is saved with the current date and time and cannot be changed. This keeps the records honest and works correctly after a close.', 'नहीं। भुगतान मौजूदा तारीख़ और समय के साथ सेव होता है और बदला नहीं जा सकता। इससे रिकॉर्ड सही रहते हैं और क्लोज़ के बाद भी सही चलता है।');

// ---- v1.8 Home + Close & history: current period vs last closed period
add('home.current_title', 'Current period', 'मौजूदा अवधि');
add('home.since', 'Since {date} (after the last close)', '{date} से (पिछले क्लोज़ के बाद)');
add('home.since_start', 'Since the beginning (nothing closed yet)', 'शुरू से (अभी कुछ बंद नहीं हुआ)');
add('home.current_total', 'Total spent', 'कुल खर्च');
add('home.my_share', 'My share', 'मेरा हिस्सा');
add('home.i_paid', 'I paid', 'मैंने दिया');
add('home.view_expenses', 'View expenses →', 'खर्च देखें →');
add('home.last_title', 'Last closed period', 'पिछली बंद अवधि');
add('home.last_period', '{from} – {to}', '{from} – {to}');
add('home.last_none', 'No period has been closed yet.', 'अभी कोई अवधि बंद नहीं हुई।');
add('home.last_none_hint', 'When an admin closes the books, the summary of that period shows here.', 'जब एडमिन हिसाब बंद करेगा, तो उस अवधि का सारांश यहाँ दिखेगा।');
add('home.last_my_balance', 'My balance at close', 'क्लोज़ पर मेरा बाक़ी');
add('home.last_still', 'Still unpaid from then', 'तब का अभी भी बाक़ी');
add('home.view_history', 'Close & history →', 'हिसाब बंद और इतिहास →');
add('close.current_title', 'Current period (open)', 'मौजूदा अवधि (चालू)');
add('close.current_hint', 'Everything after the last close. This is the live record and it keeps changing until the next close.', 'पिछले क्लोज़ के बाद का सब कुछ। यह चालू रिकॉर्ड है और अगले क्लोज़ तक बदलता रहेगा।');
add('close.current_bal', 'Balance (this period)', 'बाक़ी (इस अवधि का)');
add('close.earlier_title', 'Earlier record: unpaid from closed periods', 'पिछला रिकॉर्ड: बंद अवधियों का बाक़ी');
add('close.earlier_hint', 'These are kept separate from the current period.', 'ये मौजूदा अवधि से अलग रखे जाते हैं।');
add('close.latest', 'Latest', 'सबसे नया');
add('close.compact_preview', 'If you close now: total {total}, {count} expenses, {head} per head', 'अभी बंद करने पर: कुल {total}, {count} खर्च, प्रति व्यक्ति {head}');
add('close.dues_at_close', 'Dues at close', 'क्लोज़ पर बाक़ी');
add('close.no_payments', 'No payments in this period.', 'इस अवधि में कोई भुगतान नहीं।');

// ---- v1.9 period-wise (close-wise) views
add('period.current', 'Current period (open)', 'मौजूदा अवधि (चालू)');
add('period.pick', 'Period', 'अवधि');
add('period.tab', 'Period', 'अवधि');
add('period.hint', 'A period runs from one close to the next. Pick the current one or any closed period.', 'एक अवधि एक क्लोज़ से अगले क्लोज़ तक चलती है। मौजूदा या कोई भी बंद अवधि चुनें।');
add('period.bal_hint', 'Balances for this period only: what each person paid, their share and the net for that period.', 'सिर्फ़ इस अवधि का हिसाब: हर किसी ने कितना दिया, उसका हिस्सा और इस अवधि का बाक़ी।');
add('report.mode_month', 'Month', 'महीना');
add('report.mode_period', 'Period', 'अवधि');

export const extraMessages = d;
