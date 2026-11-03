import { useState } from 'react';
import { suggestSettlements, type CloseSummary, type PeriodClose } from '@khatafy/core';
import { api } from '../lib/supabase';
import { invalidate, useQuery } from '../lib/data';
import { useGroup } from '../lib/group';
import { useT } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { Button, Card, ConfirmModal, ErrorBox, Field, Skeleton, TextArea } from '../components/ui';

function Summary({ s }: { s: CloseSummary }) {
  const { t, money, date } = useT();
  const dues = suggestSettlements(s.members.map((m) => ({ userId: m.user_id, netPaise: m.net_paise })));
  const name = (id: string) => s.members.find((m) => m.user_id === id)?.name ?? '?';
  return (
    <>
      <div className="stat-grid">
        <div><span className="muted small">{t('close.total')}</span><strong>{money(s.total_paise)}</strong></div>
        <div><span className="muted small">{t('close.count')}</span><strong>{s.expense_count}</strong></div>
        <div><span className="muted small">{t('close.per_head')}</span><strong>{money(s.per_head_paise)}</strong></div>
      </div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>{t('close.col_member')}</th><th className="num">{t('close.col_paid')}</th><th className="num">{t('close.col_share')}</th><th className="num">{t('close.col_net')}</th></tr></thead>
        <tbody>{s.members.map((m) => (
          <tr key={m.user_id}><td>{m.name}</td><td className="num">{money(m.paid_paise)}</td><td className="num"><strong>{money(m.share_paise)}</strong></td>
            <td className={`num ${m.net_paise >= 0 ? 'pos-text' : 'neg-text'}`}>{money(m.net_paise, { sign: true })}</td></tr>
        ))}</tbody>
      </table></div>
      <h3>{t('close.payments')}</h3>
      {s.payments.length === 0 ? <p className="muted">—</p> : (
        <ul className="list">{s.payments.map((p, i) => <li key={i} className="row"><span>{p.from_name} → {p.to_name}</span><span><strong>{money(p.amount_paise)}</strong> <span className="muted small">{date(p.paid_at)}</span></span></li>)}</ul>
      )}
      <h3>{t('close.dues')}</h3>
      {dues.length === 0 ? <p className="muted">{t('close.no_dues')}</p> : (
        <ul className="list">{dues.map((d, i) => <li key={i} className="row"><span>{t('close.pays', { from: name(d.from), to: name(d.to), amount: money(d.amountPaise) })}</span></li>)}</ul>
      )}
    </>
  );
}

export function ClosePage() {
  const { t, errorText, date } = useT();
  const toast = useToast();
  const { group, isAdmin, archived } = useGroup();
  const gid = group.id;
  const q = useQuery(`g:${gid}:closes`, () => api.listPeriodCloses(gid));
  const today = new Date().toISOString().slice(0, 10);
  const [end, setEnd] = useState(today);
  const [confirm, setConfirm] = useState(false);
  const [objecting, setObjecting] = useState<PeriodClose | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const day = (d: string) => date(`${d}T12:00:00Z`);
  const run = async (f: () => Promise<unknown>, done = true) => {
    setBusy(true);
    try { await f(); invalidate(`g:${gid}:closes`); invalidate('notifs'); setConfirm(false); setObjecting(null); setReason(''); void done; }
    catch (x) { toast.push('error', errorText(x)); } finally { setBusy(false); }
  };
  if (q.error) return <ErrorBox message={errorText(q.error)} onRetry={q.reload} />;
  if (!q.data) return <Skeleton lines={6} />;
  const pending = q.data.find((c) => c.status === 'pending');
  const closed = q.data.filter((c) => c.status === 'closed');
  return (
    <>
      <div className="page-head no-print"><h1>{t('close.title')}</h1></div>
      <p className="muted small no-print">{t('close.intro')}</p>

      {pending && (
        <Card title={t('close.pending_title')}>
          <p>{t('close.pending_text', { date: day(pending.period_end), final: date(pending.effective_at) })}</p>
          <p className="muted small">{t('close.requested_by', { name: pending.requested_by_name })}</p>
          {pending.objection_count > 0 && <div className="banner banner-warn" role="status">{t('close.blocked')} ({pending.objection_count})</div>}
          {isAdmin && pending.objections.length > 0 && (
            <><h3>{t('close.objections')}</h3><ul className="list">{pending.objections.map((o, i) => <li key={i} className="row"><span><strong>{o.name}</strong> — {o.reason}</span></li>)}</ul></>
          )}
          <div className="btn-row no-print">
            {pending.my_objection
              ? <Button variant="secondary" loading={busy} onClick={() => run(() => api.withdrawPeriodObjection(pending.id))}>{t('close.withdraw')}</Button>
              : <Button variant="secondary" onClick={() => setObjecting(pending)}>{t('close.object')}</Button>}
            {isAdmin && <Button variant="danger" loading={busy} onClick={() => run(() => api.cancelPeriodClose(pending.id))}>{t('close.cancel')}</Button>}
            <Button variant="ghost" onClick={() => window.print()}>{t('close.pdf')}</Button>
          </div>
          <h3>{t('close.preview')}</h3>
          {pending.summary && <Summary s={pending.summary} />}
        </Card>
      )}

      {isAdmin && !pending && !archived && (
        <Card title={t('close.new_title')}>
          <Field label={t('close.end_date')} type="date" max={today} value={end} onChange={(e) => setEnd(e.target.value)} />
          <Button disabled={!end} onClick={() => setConfirm(true)}>{t('close.request')}</Button>
        </Card>
      )}

      <h2>{t('close.history')}</h2>
      {closed.length === 0 ? <p className="muted">{t('close.none')}</p> : closed.map((c) => (
        <Card key={c.id} title={`${t('close.period')}: ${c.summary?.from_date ? day(c.summary.from_date.slice(0, 10)) + ' – ' : '… '}${day(c.period_end)}`}>
          <p className="muted small">{t('close.closed_on', { date: c.closed_at ? date(c.closed_at) : '' })} · {t('close.final_note')}</p>
          {c.summary && <Summary s={c.summary} />}
          <div className="btn-row no-print"><Button variant="ghost" onClick={() => window.print()}>{t('close.pdf')}</Button></div>
        </Card>
      ))}

      {confirm && <ConfirmModal title={t('close.confirm_title')} text={t('close.confirm_text', { date: day(end) })} confirmLabel={t('close.request')} danger busy={busy} onClose={() => setConfirm(false)} onConfirm={() => run(() => api.requestPeriodClose(gid, end), false)} />}
      {objecting && (
        <ConfirmModal title={t('close.object')} confirmLabel={t('close.object')} busy={busy} disabled={reason.trim().length < 3} onClose={() => setObjecting(null)} onConfirm={() => run(() => api.objectPeriodClose(objecting.id, reason.trim()), false)}>
          <TextArea label={t('close.object_reason')} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </ConfirmModal>
      )}
    </>
  );
}
