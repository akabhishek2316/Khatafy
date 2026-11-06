import type { Dict } from './i18n';
import type { AppNotification, ActivityItem } from './types';
import type { Translator } from './i18n';
import { formatPaise } from './money';

export const notificationMessages: Dict = {
  'notif.expense_added': { en: '{name} added "{title}" ({amount}). Your share: {share}.', hi: '{name} ने "{title}" ({amount}) जोड़ा। आपका हिस्सा: {share}।' },
  'notif.expense_edited': { en: '{name} corrected "{title}".', hi: '{name} ने "{title}" में सुधार किया।' },
  'notif.expense_voided': { en: '{name} cancelled (voided) "{title}".', hi: '{name} ने "{title}" रद्द (void) किया।' },
  'notif.payment_pending': { en: '{name} recorded a payment of {amount} to you. Please confirm if you received it.', hi: '{name} ने आपको {amount} के पेमेंट की एंट्री की है। मिल गया हो तो कन्फ़र्म करें।' },
  'notif.payment_recorded': { en: '{name} recorded a payment of {amount} from you ({status}).', hi: '{name} ने आपकी तरफ़ से {amount} के पेमेंट की एंट्री की ({status})।' },
  'notif.payment_confirmed': { en: '{name} confirmed the payment of {amount}.', hi: '{name} ने {amount} का पेमेंट कन्फ़र्म किया।' },
  'notif.payment_rejected': { en: '{name} rejected the payment of {amount}.', hi: '{name} ने {amount} का पेमेंट अस्वीकार किया।' },
  'notif.payment_cancelled': { en: '{name} cancelled the payment of {amount}.', hi: '{name} ने {amount} का पेमेंट रद्द किया।' },
  'notif.payment_reversed': { en: '{name} reversed the payment of {amount}.', hi: '{name} ने {amount} का पेमेंट रिवर्स किया।' },
  'notif.payment_reminder': { en: '{name} reminded you: you need to pay {amount} in "{group_name}".', hi: '{name} की याद दिलाई: "{group_name}" में आपको {amount} देने हैं।' },
  'notif.join_request': { en: '{name} wants to join "{group_name}".', hi: '{name} "{group_name}" में जुड़ना चाहते हैं।' },
  'notif.join_approved': { en: 'You are now a member of "{group_name}".', hi: 'अब आप "{group_name}" के सदस्य हैं।' },
  'notif.join_rejected': { en: 'Your request to join "{group_name}" was declined.', hi: '"{group_name}" में जुड़ने का आपका अनुरोध अस्वीकार हुआ।' },
  'notif.admin_granted': { en: '{name} made you an admin of "{group_name}".', hi: '{name} ने आपको "{group_name}" का एडमिन बना दिया।' },
  'notif.budget_alert_80': { en: 'Budget alert: {what} reached 80% ({spent} of {budget}) in {month}.', hi: 'बजट अलर्ट: {month} में {what} 80% तक पहुँच गया ({spent} / {budget})।' },
  'notif.budget_alert_100': { en: 'Budget exceeded: {what} is at {spent} of {budget} in {month}.', hi: 'बजट पार: {month} में {what} {spent} हो गया, बजट {budget} था।' },
  'notif.notice_posted': { en: '{name} posted a notice: {title}', hi: '{name} ने नोटिस डाला: {title}' },
  'notif.unknown': { en: 'You have a new update.', hi: 'आपके लिए नया अपडेट है।' },

  'act.expense.created': { en: '{actor} added expense "{title}" ({amount})', hi: '{actor} ने खर्च "{title}" ({amount}) जोड़ा' },
  'act.expense.edited': { en: '{actor} corrected "{title}" - reason: {reason}', hi: '{actor} ने "{title}" में सुधार किया - कारण: {reason}' },
  'act.expense.voided': { en: '{actor} voided "{title}" - reason: {reason}', hi: '{actor} ने "{title}" रद्द किया - कारण: {reason}' },
  'act.expense.receipt_added': { en: '{actor} attached a receipt', hi: '{actor} ने रसीद जोड़ी' },
  'act.expense.receipt_removed': { en: '{actor} removed a receipt', hi: '{actor} ने रसीद हटाई' },
  'act.payment.recorded': { en: '{actor} recorded a payment of {amount} ({status})', hi: '{actor} ने {amount} का पेमेंट दर्ज किया ({status})' },
  'act.payment.confirm': { en: '{actor} confirmed a payment of {amount}', hi: '{actor} ने {amount} का पेमेंट कन्फ़र्म किया' },
  'act.payment.reject': { en: '{actor} rejected a payment of {amount}', hi: '{actor} ने {amount} का पेमेंट अस्वीकार किया' },
  'act.payment.cancel': { en: '{actor} cancelled a payment of {amount}', hi: '{actor} ने {amount} का पेमेंट रद्द किया' },
  'act.payment.reverse': { en: '{actor} reversed a payment of {amount}', hi: '{actor} ने {amount} का पेमेंट रिवर्स किया' },
  'act.invitation.created': { en: '{actor} created an invitation', hi: '{actor} ने इनविटेशन बनाया' },
  'act.invitation.revoked': { en: '{actor} revoked an invitation', hi: '{actor} ने इनविटेशन रद्द किया' },
  'act.budget.set': { en: '{actor} changed a budget', hi: '{actor} ने बजट बदला' },
  'act.member.joined': { en: 'A new member joined', hi: 'नया सदस्य जुड़ा' },
  'act.member.left': { en: 'A member left the group', hi: 'एक सदस्य ने ग्रुप छोड़ा' },
  'act.member.removed': { en: '{actor} removed a member', hi: '{actor} ने एक सदस्य को हटाया' },
  'act.member.role': { en: '{actor} changed a member role to {role}', hi: '{actor} ने एक सदस्य का रोल {role} किया' },
  'act.request.created': { en: 'A join request was sent', hi: 'जॉइन अनुरोध भेजा गया' },
  'act.request.approved': { en: '{actor} approved a join request', hi: '{actor} ने जॉइन अनुरोध मंज़ूर किया' },
  'act.request.rejected': { en: '{actor} declined a join request', hi: '{actor} ने जॉइन अनुरोध अस्वीकार किया' },
  'act.group.created': { en: 'Group created', hi: 'ग्रुप बनाया गया' },
  'act.period_closed': { en: '{actor} closed the books (period closed)', hi: '{actor} ने हिसाब बंद किया (अवधि बंद)' },
  'act.group.updated': { en: '{actor} updated the group', hi: '{actor} ने ग्रुप अपडेट किया' },
  'act.group.archived': { en: '{actor} archived the group', hi: '{actor} ने ग्रुप आर्काइव किया' },
  'act.unknown': { en: 'Group activity', hi: 'ग्रुप की गतिविधि' },
};

export function notificationText(n: AppNotification, t: Translator): { text: string; path: string | null } {
  const p = n.params ?? {};
  const money = (v: unknown) => formatPaise(Number(v ?? 0));
  const g = n.group_id;
  const base: Record<string, string | number> = {
    name: String(p.name ?? ''), title: String(p.title ?? ''), group_name: String(p.group_name ?? ''),
    amount: money(p.amount_paise), share: money(p.share_paise),
    status: p.status ? t(`pay.status.${String(p.status)}`) : '',
  };
  switch (n.type) {
    case 'budget_alert': {
      const level = Number(p.level) === 100 ? 100 : 80;
      const what = p.category_key ? t(`cat.${String(p.category_key)}`) : t('budget.overall');
      return {
        text: t(`notif.budget_alert_${level}`, { what, spent: money(p.spent_paise), budget: money(p.budget_paise), month: String(p.month ?? '') }),
        path: g ? `/g/${g}/reports` : null,
      };
    }
    case 'expense_added': case 'expense_edited': case 'expense_voided':
      return { text: t(`notif.${n.type}`, base), path: g && p.expense_id ? `/g/${g}/expense/${p.expense_id}` : g ? `/g/${g}/diary` : null };
    case 'payment_pending': case 'payment_recorded': case 'payment_confirmed': case 'payment_rejected':
    case 'payment_cancelled': case 'payment_reversed': case 'payment_reminder':
      return { text: t(`notif.${n.type}`, { ...base, amount: n.type === 'payment_reminder' ? money(p.owed_paise) : base.amount! }), path: g ? `/g/${g}/${n.type === 'payment_reminder' ? 'balances' : 'settlements'}` : null };
    case 'close_done':
      return { text: t(`notif.${n.type}`, { ...base, date: String(p.period_end ?? '') }), path: g ? `/g/${g}/close` : null };
    case 'join_request':
      return { text: t('notif.join_request', base), path: g ? `/g/${g}/requests` : null };
    case 'join_approved': case 'admin_granted':
      return { text: t(`notif.${n.type}`, base), path: g ? `/g/${g}` : null };
    case 'join_rejected':
      return { text: t('notif.join_rejected', base), path: '/groups' };
    case 'notice_posted':
      return { text: t('notif.notice_posted', base), path: g ? `/g/${g}/notices` : null };
    default:
      return { text: t('notif.unknown'), path: null };
  }
}

export function activityText(a: ActivityItem, t: Translator): string {
  const m = a.metadata ?? {};
  const actor = a.actor_name ?? '';
  const money = (v: unknown) => formatPaise(Number(v ?? 0));
  const key = a.entity_type === 'group_members'
    ? m.operation === 'insert' ? 'act.member.joined'
      : m.changes?.status?.new === 'left' ? 'act.member.left'
      : m.changes?.status?.new === 'removed' ? 'act.member.removed'
      : m.changes?.role ? 'act.member.role' : 'act.unknown'
    : a.entity_type === 'join_requests'
      ? m.operation === 'insert' ? 'act.request.created'
        : m.changes?.status?.new === 'approved' ? 'act.request.approved'
        : m.changes?.status?.new === 'rejected' ? 'act.request.rejected' : 'act.unknown'
      : a.entity_type === 'groups'
        ? m.operation === 'insert' ? 'act.group.created'
          : m.changes?.status?.new === 'archived' ? 'act.group.archived'
          : m.changes ? 'act.group.updated' : 'act.unknown'
        : `act.${a.action}`;
  const amount = m.amount_paise ?? m.new_amount_paise;
  return t(key, {
    actor, title: String(m.title ?? m.new_title ?? ''), amount: money(amount), reason: String(m.reason ?? m.note ?? ''),
    status: m.status ? t(`pay.status.${String(m.status)}`) : '', role: String(m.changes?.role?.new ?? ''),
  });
}
