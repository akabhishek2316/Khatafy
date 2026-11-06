import { useMemo, useRef, useState } from 'react';
import { localInputToIso, monthKey, monthToDate, newId, parseRupeesToPaise, paiseToPlain, suggestSettlements, toLocalInput, type Payment, type PaymentMethod, type PaymentStatus } from '@khatafy/core';
import { api } from '../lib/supabase';
import { invalidate, usePaged, useQuery } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useGroup } from '../lib/group';
import { useToast } from '../lib/toast';
import { Link } from '../lib/router';
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Field, Modal, NetAmount, Select, Skeleton } from '../components/ui';

export function PaymentModal({ groupId, initial, onClose }: { groupId: string; initial?: { from?: string; to?: string; amountPaise?: number }; onClose: () => void }) {
  const { t, errorText } = useT();
  const toast = useToast();
  const { activeMembers, me, isAdmin } = useGroup();
  const key = useRef(newId());
  const [from, setFrom] = useState(initial?.from ?? me);
  const [to, setTo] = useState(initial?.to ?? activeMembers.find((m) => m.user_id !== me)?.user_id ?? '');
  const [amount, setAmount] = useState(initial?.amountPaise ? paiseToPlain(initial.amountPaise) : '');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [paidAt, setPaidAt] = useState(toLocalInput());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [aErr, setAErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null); setAErr(null);
    const paise = parseRupeesToPaise(amount);
    if (!paise) return setAErr(t('err.INVALID_AMOUNT'));
    if (!from || !to || from === to) return setErr(t('err.INVALID_PAYMENT_PARTIES'));
    if (!isAdmin && from !== me && to !== me) return setErr(t('pay.must_involve_you'));
    setBusy(true);
    try {
      await api.recordPayment(groupId, key.current, { fromUser: from, toUser: to, amountPaise: paise, method, paidAt: new Date().toISOString(), reference: reference.trim() || null, note: note.trim() || null });
      invalidate(`g:${groupId}`);
      toast.push('success', to === me ? t('pay.recorded_confirmed') : t('pay.recorded_pending'));
      onClose();
    } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  const label = (id: string) => { const m = activeMembers.find((x) => x.user_id === id); return m ? `${m.full_name}${id === me ? ` (${t('common.you')})` : ''}` : id; };
  return (
    <Modal title={t('pay.record')} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={busy} onClick={submit}>{t('pay.record_btn')}</Button></>}>
      <div className="banner banner-info small">{t('pay.manual_note')}</div>
      <div className="grid grid-2">
        <Select label={t('pay.from')} value={from} onChange={(e) => setFrom(e.target.value)}>{activeMembers.map((m) => <option key={m.user_id} value={m.user_id}>{label(m.user_id)}</option>)}</Select>
        <Select label={t('pay.to')} value={to} onChange={(e) => setTo(e.target.value)}>{activeMembers.map((m) => <option key={m.user_id} value={m.user_id}>{label(m.user_id)}</option>)}</Select>
      </div>
      <Field label={`${t('expense.amount')} (₹)`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={aErr} placeholder="0.00" />
      <div className="grid grid-2">
        <Select label={t('pay.method')} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {(['upi', 'cash', 'bank', 'other'] as const).map((m) => <option key={m} value={m}>{t(`pay.method.${m}`)}</option>)}
        </Select>
        <Field label={t('expense.date')} value={t('expense.date_now')} readOnly disabled hint={t('expense.date_hint')} />
      </div>
      <Field label={t('pay.reference')} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} hint={t('pay.reference_hint')} />
      <Field label={t('expense.note')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      {err && <p className="field-error" role="alert">{err}</p>}
    </Modal>
  );
}

import { MemberShares } from '../components/shares';
import { EarlierDues } from '../components/earlier';
import { PeriodPicker, periodBounds } from '../components/period';

function BalanceTabs({ active }: { active: 'balances' | 'payments' }) {
  const { t } = useT();
  const { group } = useGroup();
  return (
    <nav className="subnav" aria-label={t('nav.balances')}>
      <Link to={`/g/${group.id}/balances`} className={active === 'balances' ? 'on' : ''} aria-current={active === 'balances' ? 'page' : undefined}>⚖️ {t('nav.balances')}</Link>
      <Link to={`/g/${group.id}/settlements`} className={active === 'payments' ? 'on' : ''} aria-current={active === 'payments' ? 'page' : undefined}>💸 {t('nav.settlements')}</Link>
    </nav>
  );
}

export function BalancesPage() {
  const { t, money, errorText } = useT();
  const toast = useToast();
  const { expireSession } = useAuth();
  const { group, me, nameOf, archived, isAdmin } = useGroup();
  const gid = group.id;
  const thisMonth = monthKey(new Date(), group.timezone);
  const [month, setMonth] = useState<string | null>(null); // null = lifetime
  const life = useQuery(`g:${gid}:balances`, () => api.getBalances(gid), { onSessionExpired: expireSession });
  const rep = useQuery(month ? `g:${gid}:report:${month}` : null, () => api.getReport(gid, monthToDate(month!)), { onSessionExpired: expireSession });
  const [pid, setPid] = useState<string | null>(null); // closed-period / current-period view
  const closes = useQuery(`g:${gid}:closes`, () => api.listPeriodCloses(gid));
  const pb = pid !== null && closes.data ? periodBounds(closes.data, pid) : null;
  const per = useQuery(pid !== null && pb ? `g:${gid}:balances:p:${pid}:${closes.data?.length}` : null, () => api.getBalances(gid, pb!.from, pb!.to), { onSessionExpired: expireSession });
  const periodMode = pid !== null;
  const isCurrent = !month && !periodMode;
  const [pay, setPay] = useState<{ from: string; to: string; amountPaise: number } | null>(null);

  const rows = periodMode
    ? (per.data ?? []).map((r) => ({ user_id: r.user_id, name: r.is_deleted ? t('common.deleted_user') : r.full_name, status: r.status, paid: r.paid_paise, share: r.share_paise, net: r.net_paise, carry: 0 }))
    : month
    ? (rep.data?.by_member ?? []).map((r) => ({ user_id: r.user_id, name: nameOf(r.user_id), status: r.status, paid: r.paid_paise, share: r.share_paise, net: r.net_paise, carry: 0 }))
    : (life.data ?? []).map((r) => ({ user_id: r.user_id, name: r.is_deleted ? t('common.deleted_user') : r.full_name, status: r.status, paid: r.paid_paise, share: r.share_paise, net: r.current_paise ?? r.net_paise, carry: r.carry_paise ?? 0 }));
  const loading = periodMode ? per.loading && !per.data : month ? rep.loading && !rep.data : life.loading && !life.data;
  const error = periodMode ? per.error : month ? rep.error : life.error;
  const suggestions = useMemo(() => suggestSettlements((life.data ?? []).map((b) => ({ userId: b.user_id, netPaise: b.current_paise ?? b.net_paise }))), [life.data]);

  const remind = async (uid: string) => {
    try { await api.sendReminder(gid, uid); toast.push('success', t('bal.reminded')); } catch (x) { toast.push('error', errorText(x)); }
  };
  return (
    <>
      <BalanceTabs active="balances" />
      <h1>{t('nav.balances')}</h1>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={isCurrent} className={isCurrent ? 'on' : ''} onClick={() => { setMonth(null); setPid(null); }}>{t('bal.lifetime')}</button>
        <button role="tab" aria-selected={month !== null} className={month !== null ? 'on' : ''} onClick={() => { setPid(null); setMonth(thisMonth); }}>{t('bal.monthly')}</button>
        <button role="tab" aria-selected={periodMode} className={periodMode ? 'on' : ''} onClick={() => { setMonth(null); setPid('current'); }}>{t('period.tab')}</button>
      </div>
      {periodMode && <PeriodPicker closes={closes.data ?? []} value={pid ?? 'current'} onChange={setPid} />}
      {month !== null && <Field label={t('report.month')} type="month" value={month} max={thisMonth} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
      <p className="muted small">{periodMode ? t('period.bal_hint') : month ? t('bal.monthly_hint') : t('bal.lifetime_hint')}</p>
      {error && <ErrorBox message={errorText(error)} onRetry={() => (periodMode ? per.reload() : month ? rep.reload() : life.reload())} />}
      {isCurrent && life.data && <EarlierDues rows={life.data} me={me} nameOf={nameOf} archived={archived} isAdmin={isAdmin} mine={false} onPay={setPay} />}
      {loading ? <Skeleton lines={4} /> : rows.length === 0 ? <Empty icon="⚖️" title={t('bal.empty')} /> : (
        <Card>
          <ul className="list">
            {rows.map((r) => (
              <li key={r.user_id} className="bal-row">
                <Avatar name={r.name} size={34} />
                <span className="grow">
                  <Link to={`/g/${gid}/members/${r.user_id}`}><strong>{r.name}</strong></Link>{r.user_id === me && <> <Badge>{t('common.you')}</Badge></>}{r.status !== 'active' && <> <Badge tone="warn">{t('member.left')}</Badge></>}
                  <span className="muted small block">{t('bal.paid_share', { paid: money(r.paid), share: money(r.share) })}</span>
                </span>
                <NetAmount paise={r.net} />
                {isCurrent && !!r.carry && <span className="muted small block">{t('earlier.balance_line', { amount: money(r.carry, { sign: true }) })}</span>}
                {isCurrent && r.net < 0 && r.user_id !== me && r.status === 'active' && !archived && <Button variant="ghost" onClick={() => remind(r.user_id)}>🔔 {t('bal.remind')}</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {!loading && rows.length > 0 && <MemberShares me={me} total={rows.reduce((a, r) => a + r.share, 0)} rows={rows.map((r) => ({ id: r.user_id, name: r.name, share: r.share, paid: r.paid, status: r.status }))} />}
      {isCurrent && suggestions.length > 0 && !archived && (
        <Card title={t('bal.suggestions')}>
          <p className="muted small">{t('bal.suggestions_hint')}</p>
          <ul className="list">
            {suggestions.map((s) => (
              <li key={s.from + s.to} className="row">
                <span>{t('pay.line', { from: nameOf(s.from), to: nameOf(s.to), amount: money(s.amountPaise) })}</span>
                {(isAdmin || s.from === me || s.to === me) && <Button variant="secondary" onClick={() => setPay({ from: s.from, to: s.to, amountPaise: s.amountPaise })}>{t('pay.record')}</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {isCurrent && suggestions.length === 0 && life.data && life.data.length > 0 && <Card><p>✅ {t('bal.all_settled')}</p></Card>}
      {pay && <PaymentModal groupId={gid} initial={pay} onClose={() => setPay(null)} />}
    </>
  );
}

const STATUS_TONE: Record<PaymentStatus, 'warn' | 'good' | 'bad' | 'neutral' | 'info'> = { pending: 'warn', confirmed: 'good', rejected: 'bad', cancelled: 'neutral', reversed: 'bad' };

export function SettlementsPage() {
  const { t, money, date, errorText } = useT();
  const toast = useToast();
  const { expireSession } = useAuth();
  const { group, me, isAdmin, archived } = useGroup();
  const gid = group.id;
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<{ p: Payment; action: 'reject' | 'reverse' } | null>(null);
  const [reason, setReason] = useState('');
  const [rErr, setRErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const list = usePaged<Payment>(`g:${gid}:payments:${status}`, (cursor) => api.listPayments(gid, { status: status || null, before: cursor }), { onSessionExpired: expireSession });

  const act = async (p: Payment, action: 'confirm' | 'cancel' | 'reject' | 'reverse', note?: string) => {
    setBusyId(p.id); setRErr(null);
    try {
      await api.updatePaymentStatus(p.id, action, note ?? null);
      invalidate(`g:${gid}`);
      setAsk(null); setReason('');
      toast.push('success', t(`pay.done.${action}`));
    } catch (x) { if (ask) setRErr(errorText(x)); else toast.push('error', errorText(x)); } finally { setBusyId(null); }
  };

  return (
    <>
      <BalanceTabs active="payments" />
      <div className="page-head"><h1>{t('nav.settlements')}</h1>{!archived && <Button onClick={() => setOpen(true)}>＋ {t('pay.record')}</Button>}</div>
      <div className="banner banner-info small">{t('pay.manual_note')}</div>
      <Select label={t('pay.status_filter')} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">{t('common.all')}</option>
        {(['pending', 'confirmed', 'rejected', 'cancelled', 'reversed'] as const).map((s) => <option key={s} value={s}>{t(`pay.status.${s}`)}</option>)}
      </Select>
      {list.error && <ErrorBox message={errorText(list.error)} onRetry={list.reload} />}
      {list.loading && !list.items.length ? <Skeleton lines={4} /> : list.items.length === 0 ? <Empty icon="💸" title={t('pay.empty')} hint={t('pay.empty_hint')} /> : (
        <Card>
          <ul className="list">
            {list.items.map((p) => {
              const canDecide = p.status === 'pending' && (p.to_user === me || (isAdmin && !p.receiver_active));
              const canCancel = p.status === 'pending' && (p.created_by === me || p.from_user === me);
              const canReverse = p.status === 'confirmed' && (p.to_user === me || isAdmin);
              return (
                <li key={p.id} className="pay-row" data-testid="payment-row">
                  <div className="grow">
                    <strong>{t('pay.line', { from: p.from_name, to: p.to_name, amount: money(p.amount_paise) })}</strong>{' '}
                    <Badge tone={STATUS_TONE[p.status]}>{t(`pay.status.${p.status}`)}</Badge>
                    <span className="muted small block">{date(p.paid_at, true)} · {t(`pay.method.${p.method}`)}{p.reference ? ` · ${p.reference}` : ''}{p.note ? ` · ${p.note}` : ''}</span>
                    {p.decision_note && <span className="muted small block">{t('pay.reason_x', { reason: p.decision_note })}</span>}
                    {p.reverse_reason && <span className="muted small block">{t('pay.reason_x', { reason: p.reverse_reason })}</span>}
                  </div>
                  {!archived && (
                    <div className="btn-row">
                      {canDecide && <Button loading={busyId === p.id} onClick={() => act(p, 'confirm')}>{t('pay.confirm')}</Button>}
                      {canDecide && <Button variant="ghost" onClick={() => { setAsk({ p, action: 'reject' }); setReason(''); setRErr(null); }}>{t('pay.reject')}</Button>}
                      {canCancel && <Button variant="ghost" loading={busyId === p.id} onClick={() => act(p, 'cancel')}>{t('common.cancel')}</Button>}
                      {canReverse && <Button variant="ghost" onClick={() => { setAsk({ p, action: 'reverse' }); setReason(''); setRErr(null); }}>{t('pay.reverse')}</Button>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {list.next && <Button variant="secondary" loading={list.loadingMore} onClick={list.loadMore}>{t('common.load_more')}</Button>}
        </Card>
      )}
      {open && <PaymentModal groupId={gid} onClose={() => setOpen(false)} />}
      {ask && (
        <Modal title={ask.action === 'reject' ? t('pay.reject') : t('pay.reverse')} onClose={() => setAsk(null)} footer={<><Button variant="ghost" onClick={() => setAsk(null)}>{t('common.cancel')}</Button><Button variant="danger" loading={busyId === ask.p.id} onClick={() => act(ask.p, ask.action, reason)}>{ask.action === 'reject' ? t('pay.reject') : t('pay.reverse')}</Button></>}>
          <p>{ask.action === 'reverse' ? t('pay.reverse_text') : t('pay.reject_text')}</p>
          <Field label={t('expense.reason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} error={rErr} />
        </Modal>
      )}
    </>
  );
}
