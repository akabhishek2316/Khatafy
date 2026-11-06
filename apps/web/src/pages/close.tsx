import { useState } from 'react';
import { suggestSettlements, type CloseSummary } from '@khatafy/core';
import { api } from '../lib/supabase';
import { invalidate, useQuery } from '../lib/data';
import { useGroup } from '../lib/group';
import { useT } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { Badge, Button, Card, ConfirmModal, ErrorBox, Field, Logo, Skeleton } from '../components/ui';
import { EarlierDues } from '../components/earlier';
import { PaymentModal } from './money';

function Summary({ s }: { s: CloseSummary }) {
  const { t, money, date } = useT();
  const dues = suggestSettlements(s.members.map((m) => ({ userId: m.user_id, netPaise: m.net_paise })));
  const name = (id: string) => s.members.find((m) => m.user_id === id)?.name ?? '?';
  return (
    <>
      <dl className="kv">
        <div><dt>{t('close.total')}</dt><dd><strong>{money(s.total_paise)}</strong></dd></div>
        <div><dt>{t('close.count')}</dt><dd>{s.expense_count}</dd></div>
        <div><dt>{t('close.per_head')}</dt><dd>{money(s.per_head_paise)}</dd></div>
      </dl>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>{t('close.col_member')}</th><th className="num">{t('close.col_paid')}</th><th className="num">{t('close.col_share')}</th><th className="num">{t('close.dues_at_close')}</th></tr></thead>
        <tbody>{s.members.map((m) => (
          <tr key={m.user_id}><td>{m.name}</td><td className="num">{money(m.paid_paise)}</td><td className="num"><strong>{money(m.share_paise)}</strong></td>
            <td className={`num ${m.net_paise >= 0 ? 'pos-text' : 'neg-text'}`}>{money(m.net_paise, { sign: true })}</td></tr>
        ))}</tbody>
      </table></div>
      <h3>{t('close.payments')}</h3>
      {s.payments.length === 0 ? <p className="muted">{t('close.no_payments')}</p> : (
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
  const { t, errorText, date, money } = useT();
  const toast = useToast();
  const { group, isAdmin, archived, me, nameOf } = useGroup();
  const gid = group.id;
  const q = useQuery(`g:${gid}:closes`, () => api.listPeriodCloses(gid));
  const ov = useQuery(`g:${gid}:overview`, () => api.getPeriodOverview(gid));
  const bal = useQuery(`g:${gid}:balances`, () => api.getBalances(gid));
  const today = new Date().toISOString().slice(0, 10);
  const [end, setEnd] = useState(today);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [only, setOnly] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<{ from: string; to: string; amountPaise: number; kind?: 'earlier' | 'current' } | null>(null);
  const canClose = isAdmin && !archived;
  const prev = useQuery(canClose && end ? `g:${gid}:closeprev:${end}` : null, () => api.previewPeriodClose(gid, end));
  const day = (d: string) => date(`${d}T12:00:00Z`);
  const doClose = async () => {
    setBusy(true);
    try { await api.closePeriod(gid, end); invalidate(`g:${gid}:`); invalidate('notifs'); setConfirm(false); }
    catch (x) { setConfirm(false); toast.push('error', errorText(x)); } finally { setBusy(false); }
  };
  const printOne = (id: string) => { setOnly(id); setTimeout(() => { window.print(); setOnly(null); }, 80); };
  if (q.error) return <ErrorBox message={errorText(q.error)} onRetry={q.reload} />;
  if (!q.data) return <Skeleton lines={6} />;
  const cur = ov.data?.current;
  const curMap = new Map((cur?.members ?? []).map((m) => [m.user_id, m]));
  const hasEarlier = !!bal.data?.some((b) => !!b.carry_paise);
  return (
    <>
      <div className="print-only print-head">
        <span className="brand"><Logo size={26} /><span className="brand-name">Khatafy</span></span>
        <h1>{group.name}</h1>
      </div>
      <div className="page-head no-print"><h1>{t('close.title')}</h1></div>
      <p className="muted small no-print">{t('close.intro')}</p>

      <h2 className="section-title no-print">📍 {t('close.current_title')}</h2>
      <Card className="no-print">
        <p className="muted small">{t('close.current_hint')}</p>
        {!cur || !bal.data ? <Skeleton lines={4} /> : (
          <>
            <p className="muted small">{ov.data?.since ? t('home.since', { date: date(ov.data.since) }) : t('home.since_start')}</p>
            <dl className="kv">
              <div><dt>{t('close.total')}</dt><dd><strong>{money(cur.total_paise)}</strong></dd></div>
              <div><dt>{t('close.count')}</dt><dd>{cur.expense_count}</dd></div>
              <div><dt>{t('close.per_head')}</dt><dd>{money(cur.per_head_paise)}</dd></div>
            </dl>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('close.col_member')}</th><th className="num">{t('close.col_paid')}</th><th className="num">{t('close.col_share')}</th><th className="num">{t('close.current_bal')}</th></tr></thead>
              <tbody>{bal.data.map((b) => {
                const m = curMap.get(b.user_id); const cp = b.current_paise ?? b.net_paise;
                return (
                  <tr key={b.user_id}><td>{nameOf(b.user_id)}</td><td className="num">{money(m?.paid_paise ?? 0)}</td><td className="num"><strong>{money(m?.share_paise ?? 0)}</strong></td>
                    <td className={`num ${cp >= 0 ? 'pos-text' : 'neg-text'}`}>{money(cp, { sign: true })}</td></tr>
                );
              })}</tbody>
            </table></div>
            <h3>{t('close.payments')}</h3>
            {cur.payments.length === 0 ? <p className="muted">{t('close.no_payments')}</p> : (
              <ul className="list">{cur.payments.map((p, i) => <li key={i} className="row"><span>{p.from_name} → {p.to_name}</span><span><strong>{money(p.amount_paise)}</strong> <span className="muted small">{date(p.paid_at)}</span></span></li>)}</ul>
            )}
          </>
        )}
      </Card>

      {hasEarlier && bal.data && (
        <div className="no-print">
          <h2 className="section-title">⏳ {t('close.earlier_title')}</h2>
          <p className="muted small">{t('close.earlier_hint')}</p>
          <EarlierDues rows={bal.data} me={me} nameOf={nameOf} archived={archived} isAdmin={isAdmin} mine={false} onPay={setPayFor} />
        </div>
      )}

      {canClose && (
        <Card title={`🔒 ${t('close.new_title')}`} className="no-print">
          <Field label={t('close.end_date')} type="date" max={today} value={end} onChange={(e) => setEnd(e.target.value)} />
          {prev.error && <p className="field-error" role="alert">{errorText(prev.error)}</p>}
          {prev.data && <p className="muted small">{t('close.compact_preview', { total: money(prev.data.total_paise), count: prev.data.expense_count, head: money(prev.data.per_head_paise) })}</p>}
          <Button disabled={!prev.data} onClick={() => setConfirm(true)}>{t('close.request')}</Button>
        </Card>
      )}

      <h2 className="section-title no-print">📚 {t('close.history')}</h2>
      {q.data.length === 0 ? <p className="muted no-print">{t('close.none')}</p> : q.data.map((c, i) => (
        <Card key={c.id} className={only && only !== c.id ? 'no-print' : ''} title={`${t('close.period')}: ${c.summary?.from_date ? day(c.summary.from_date.slice(0, 10)) + ' – ' : '… '}${day(c.period_end)}`}>
          {i === 0 && <p><Badge>{t('close.latest')}</Badge></p>}
          <p className="muted small">{t('close.closed_on', { date: date(c.closed_at), name: c.closed_by_name })}</p>
          {c.summary && <Summary s={c.summary} />}
          <div className="btn-row no-print"><Button variant="secondary" onClick={() => printOne(c.id)}>{t('close.pdf')}</Button></div>
        </Card>
      ))}
      <p className="muted small no-print">{t('close.keep_note')}</p>

      {confirm && <ConfirmModal title={t('close.confirm_title')} text={t('close.confirm_text', { date: day(end) })} confirmLabel={t('close.request')} danger busy={busy} onClose={() => setConfirm(false)} onConfirm={doClose} />}
      {payFor && <PaymentModal groupId={gid} initial={payFor} onClose={() => setPayFor(null)} />}
    </>
  );
}
