import { useMemo, useState } from 'react';
import { monthKey, monthToDate, suggestSettlements } from '@khatafy/core';
import { api } from '../lib/supabase';
import { useQuery } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useGroup } from '../lib/group';
import { Link } from '../lib/router';
import { Badge, Button, Card, Empty, ErrorBox, NetAmount, Skeleton } from '../components/ui';
import { ExpenseRow } from './diary';
import { PaymentModal } from './money';

export function DashboardPage() {
  const { t, money, errorText } = useT();
  const { expireSession } = useAuth();
  const { group, me, nameOf, archived, isAdmin } = useGroup();
  const gid = group.id;
  const month = monthKey(new Date(), group.timezone);
  const bal = useQuery(`g:${gid}:balances`, () => api.getBalances(gid), { onSessionExpired: expireSession });
  const rep = useQuery(`g:${gid}:report:${month}`, () => api.getReport(gid, monthToDate(month)), { onSessionExpired: expireSession });
  const recent = useQuery(`g:${gid}:recent`, () => api.listExpenses(gid, { limit: 3 }), { onSessionExpired: expireSession });
  const pend = useQuery(`g:${gid}:pending-pay`, () => api.listPayments(gid, { status: 'pending', limit: 50 }), { onSessionExpired: expireSession });
  const notices = useQuery(`g:${gid}:notices`, () => api.listNotices(gid), { onSessionExpired: expireSession });
  const cats = useQuery('cats', () => api.listCategories());
  const [payFor, setPayFor] = useState<{ from: string; to: string; amountPaise: number } | null>(null);

  const mine = bal.data?.find((b) => b.user_id === me);
  const mineMonth = rep.data?.by_member.find((b) => b.user_id === me);
  const suggestions = useMemo(
    () => suggestSettlements((bal.data ?? []).map((b) => ({ userId: b.user_id, netPaise: b.net_paise }))).filter((s) => s.from === me || s.to === me),
    [bal.data, me],
  );
  const toConfirm = (pend.data?.items ?? []).filter((p) => p.to_user === me || (isAdmin && !p.receiver_active));
  const pinned = notices.data?.find((n) => n.pinned);

  return (
    <>
      <div className="page-head"><h1>{group.name}</h1>{!archived && <Link to={`/g/${gid}/expense/new`} className="btn btn-primary">＋ {t('expense.add')}</Link>}</div>
      {(bal.error || rep.error) && <ErrorBox message={errorText(bal.error ?? rep.error)} onRetry={() => { bal.reload(); rep.reload(); }} />}

      <Card className="stat stat-main" title={t('dash.my_balance')}>
        {bal.data ? <NetAmount paise={mine?.net_paise ?? 0} big /> : <Skeleton lines={1} />}
        <p className="muted small">{t('dash.lifetime')}</p>
        <div className="stat-grid">
          <div><span className="muted small">{t('dash.month_total')}</span>{rep.data ? <strong>{money(rep.data.total_paise)}</strong> : <Skeleton lines={1} />}<span className="muted small">{t('dash.expenses_n', { n: rep.data?.expense_count ?? 0 })}</span></div>
          <div><span className="muted small">{t('dash.my_month')}</span>{rep.data ? <strong>{money(mineMonth?.share_paise ?? 0)}</strong> : <Skeleton lines={1} />}<span className="muted small">{t('dash.i_paid', { amount: money(mineMonth?.paid_paise ?? 0) })}</span></div>
        </div>
      </Card>

      {pinned && <Card title={`📌 ${pinned.title}`}><p className="prewrap">{pinned.body}</p><Link to={`/g/${gid}/notices`}>{t('nav.notices')} →</Link></Card>}

      {toConfirm.length > 0 && (
        <Card title={t('dash.to_confirm')}>
          <ul className="list">
            {toConfirm.map((p) => (
              <li key={p.id} className="row"><span>{t('pay.line', { from: p.from_name, to: p.to_name, amount: money(p.amount_paise) })}</span><Link to={`/g/${gid}/settlements`} className="btn btn-secondary">{t('dash.review')}</Link></li>
            ))}
          </ul>
        </Card>
      )}
      {isAdmin && group.pending_requests > 0 && (
        <Card><div className="row"><span>🙋 {t('dash.requests_n', { n: group.pending_requests })}</span><Link to={`/g/${gid}/requests`} className="btn btn-secondary">{t('dash.review')}</Link></div></Card>
      )}

      {suggestions.length > 0 && !archived && (
        <Card title={t('dash.settle_up')}>
          <ul className="list">
            {suggestions.map((s) => (
              <li key={s.from + s.to} className="row">
                <span>{s.from === me ? t('dash.you_pay', { to: nameOf(s.to), amount: money(s.amountPaise) }) : t('dash.pays_you', { from: nameOf(s.from), amount: money(s.amountPaise) })}</span>
                <Button variant="secondary" onClick={() => setPayFor({ from: s.from, to: s.to, amountPaise: s.amountPaise })}>{t('pay.record')}</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={t('dash.recent')} action={<Link to={`/g/${gid}/diary`}>{t('common.view_all')} →</Link>}>
        {recent.loading && !recent.data ? <Skeleton lines={3} /> : recent.data?.items.length ? (
          <ul className="list">{recent.data.items.map((e) => <ExpenseRow key={e.id} e={e} groupId={gid} cats={cats.data ?? []} />)}</ul>
        ) : <Empty icon="🧾" title={t('diary.empty')} hint={t('diary.empty_hint')} action={!archived ? <Link to={`/g/${gid}/expense/new`} className="btn btn-primary">{t('expense.add')}</Link> : undefined} />}
      </Card>

      {payFor && <PaymentModal groupId={gid} initial={payFor} onClose={() => setPayFor(null)} />}
    </>
  );
}
