import { useMemo, useState } from 'react';
import { suggestSettlements } from '@khatafy/core';
import { api } from '../lib/supabase';
import { useQuery } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useGroup } from '../lib/group';
import { Link } from '../lib/router';
import { Badge, Button, Card, Empty, ErrorBox, NetAmount, Skeleton } from '../components/ui';
import { ExpenseRow } from './diary';
import { PaymentModal } from './money';
import { EarlierDues } from '../components/earlier';

export function DashboardPage() {
  const { t, money, errorText, date } = useT();
  const { expireSession } = useAuth();
  const { group, me, nameOf, archived, isAdmin } = useGroup();
  const gid = group.id;
  const bal = useQuery(`g:${gid}:balances`, () => api.getBalances(gid), { onSessionExpired: expireSession });
  const ov = useQuery(`g:${gid}:overview`, () => api.getPeriodOverview(gid), { onSessionExpired: expireSession });
  const recent = useQuery(`g:${gid}:recent`, () => api.listExpenses(gid, { limit: 3 }), { onSessionExpired: expireSession });
  const pend = useQuery(`g:${gid}:pending-pay`, () => api.listPayments(gid, { status: 'pending', limit: 50 }), { onSessionExpired: expireSession });
  const notices = useQuery(`g:${gid}:notices`, () => api.listNotices(gid), { onSessionExpired: expireSession });
  const cats = useQuery('cats', () => api.listCategories());
  const [payFor, setPayFor] = useState<{ from: string; to: string; amountPaise: number } | null>(null);

  const mine = bal.data?.find((b) => b.user_id === me);
  const cur = ov.data?.current;
  const last = ov.data?.last;
  const myCur = cur?.members.find((m) => m.user_id === me);
  const myLast = last?.summary?.members.find((m) => m.user_id === me);
  const day = (d: string) => date(`${d}T12:00:00Z`);
  const suggestions = useMemo(
    () => suggestSettlements((bal.data ?? []).map((b) => ({ userId: b.user_id, netPaise: b.current_paise ?? b.net_paise }))).filter((s) => s.from === me || s.to === me),
    [bal.data, me],
  );
  const toConfirm = (pend.data?.items ?? []).filter((p) => p.to_user === me || (isAdmin && !p.receiver_active));
  const pinned = notices.data?.find((n) => n.pinned);

  return (
    <>
      <div className="page-head"><h1>{group.name}</h1>{!archived && <Link to={`/g/${gid}/expense/new`} className="btn btn-primary">＋ {t('expense.add')}</Link>}</div>
      {(bal.error || ov.error) && <ErrorBox message={errorText(bal.error ?? ov.error)} onRetry={() => { bal.reload(); ov.reload(); }} />}

      <div className="home-cards">
        <Card className="stat stat-main" title={t('dash.my_balance')}>
          {bal.data ? <NetAmount paise={mine?.current_paise ?? mine?.net_paise ?? 0} big /> : <Skeleton lines={1} />}
          <p className="muted small">{t('dash.lifetime')}</p>
          {!!mine?.carry_paise && <p className="small">{t('earlier.balance_line', { amount: money(mine.carry_paise, { sign: true }) })}</p>}
        </Card>

        <Card className="stat period-card" title={`📍 ${t('home.current_title')}`}>
          {!ov.data || !cur ? <Skeleton lines={4} /> : (
            <>
              <p className="muted small">{ov.data.since ? t('home.since', { date: date(ov.data.since) }) : t('home.since_start')}</p>
              <dl className="kv">
                <div><dt>{t('home.current_total')}</dt><dd><strong>{money(cur.total_paise)}</strong></dd></div>
                <div><dt>{t('close.count')}</dt><dd>{cur.expense_count}</dd></div>
                <div><dt>{t('home.my_share')}</dt><dd><strong>{money(myCur?.share_paise ?? 0)}</strong></dd></div>
                <div><dt>{t('home.i_paid')}</dt><dd>{money(myCur?.paid_paise ?? 0)}</dd></div>
                <div><dt>{t('close.per_head')}</dt><dd>{money(cur.per_head_paise)}</dd></div>
              </dl>
            </>
          )}
          <Link to={`/g/${gid}/diary`} className="small">{t('home.view_expenses')}</Link>
        </Card>

        <Card className="stat period-card" title={`🔒 ${t('home.last_title')}`}>
          {!ov.data ? <Skeleton lines={4} /> : !last || !last.summary ? (
            <><p className="muted small">{t('home.last_none')}</p><p className="muted small">{t('home.last_none_hint')}</p></>
          ) : (
            <>
              <p className="muted small">{t('home.last_period', { from: last.summary.from_date ? day(last.summary.from_date.slice(0, 10)) : '…', to: day(last.period_end) })}</p>
              <dl className="kv">
                <div><dt>{t('home.current_total')}</dt><dd><strong>{money(last.summary.total_paise)}</strong></dd></div>
                <div><dt>{t('close.per_head')}</dt><dd>{money(last.summary.per_head_paise)}</dd></div>
                <div><dt>{t('home.my_share')}</dt><dd><strong>{money(myLast?.share_paise ?? 0)}</strong></dd></div>
                <div><dt>{t('home.i_paid')}</dt><dd>{money(myLast?.paid_paise ?? 0)}</dd></div>
                <div><dt>{t('home.last_my_balance')}</dt><dd className={(myLast?.net_paise ?? 0) >= 0 ? 'pos-text' : 'neg-text'}>{money(myLast?.net_paise ?? 0, { sign: true })}</dd></div>
                {!!mine?.carry_paise && <div><dt>{t('home.last_still')}</dt><dd className={mine.carry_paise >= 0 ? 'pos-text' : 'neg-text'}>{money(mine.carry_paise, { sign: true })}</dd></div>}
              </dl>
            </>
          )}
          <Link to={`/g/${gid}/close`} className="small">{t('home.view_history')}</Link>
        </Card>
      </div>

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

      {bal.data && <EarlierDues rows={bal.data} me={me} nameOf={nameOf} archived={archived} isAdmin={isAdmin} mine onPay={setPayFor} />}

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
