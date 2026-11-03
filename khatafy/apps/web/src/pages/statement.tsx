import { useEffect, useMemo, useState } from 'react';
import { dayKey, monthKey, monthRange, paiseToPlain, payerBeneficiaryTotals, shiftMonth } from '@khatafy/core';
import { api } from '../lib/supabase';
import { useQuery } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useGroup } from '../lib/group';
import { catIcon } from '../lib/cats';
import { Button, Card, Empty, ErrorBox, Field, Logo, Skeleton } from '../components/ui';
import { MemberShares } from '../components/shares';

type Preset = 'this' | 'last' | 'custom';

export function StatementPage() {
  const { t, money, date, errorText } = useT();
  const { expireSession } = useAuth();
  const { group } = useGroup();
  const gid = group.id;
  const thisMonth = monthKey(new Date(), group.timezone);
  const [preset, setPreset] = useState<Preset>('this');
  const first = monthRange(thisMonth);
  const [fromIn, setFromIn] = useState(first.from);
  const [toIn, setToIn] = useState(dayKey(new Date(), group.timezone) < first.to ? dayKey(new Date(), group.timezone) : first.to);
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: fromIn, to: toIn });
  const [dateErr, setDateErr] = useState(false);
  const [person, setPerson] = useState('all');

  const range = useMemo(() => {
    if (preset === 'this') return monthRange(thisMonth);
    if (preset === 'last') return monthRange(shiftMonth(thisMonth, -1));
    return applied;
  }, [preset, thisMonth, applied]);

  const q = useQuery(`g:${gid}:stmt:${range.from}:${range.to}`, () => api.getStatement(gid, range.from, range.to), { onSessionExpired: expireSession });
  const s = q.data;
  const pairs = useMemo(() => (s ? payerBeneficiaryTotals(s) : []), [s]);
  const pm = s && person !== 'all' ? s.members.find((m) => m.user_id === person) : undefined;
  const exps = !s ? [] : pm ? s.expenses.filter((e) => e.paid_by === person || e.splits.some((p) => p.user_id === person && p.share_paise > 0)) : s.expenses;
  const pays = !s ? [] : pm ? s.payments.filter((p) => p.from_user === person || p.to_user === person) : s.payments;
  const shareOf = (e: NonNullable<typeof s>['expenses'][number]) => e.splits.find((p) => p.user_id === person)?.share_paise ?? 0;
  const days = Math.max(1, Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000) + 1);
  const biggest = s?.expenses.reduce<(typeof s.expenses)[number] | undefined>((m, e) => (!m || e.amount_paise > m.amount_paise ? e : m), undefined);
  const topCat = useMemo(() => {
    const m = new Map<string, number>();
    (s?.expenses ?? []).forEach((e) => m.set(e.category_key, (m.get(e.category_key) ?? 0) + e.amount_paise));
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [s]);
  const label = `Khatafy-${group.name.replace(/[^\p{L}\p{N}]+/gu, '-')}${pm ? `-${pm.full_name.replace(/[^\p{L}\p{N}]+/gu, '-')}` : ''}-${range.from}_to_${range.to}`;

  const show = () => {
    if (!fromIn || !toIn || fromIn > toIn) return setDateErr(true);
    setDateErr(false); setApplied({ from: fromIn, to: toIn });
  };
  const downloadPdf = () => {
    const prev = document.title;
    document.title = label; // becomes the suggested file name in "Save as PDF"
    const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
    setTimeout(restore, 4000);
  };
  useEffect(() => { setDateErr(false); }, [preset]);

  return (
    <div className="statement">
      <div className="page-head no-print">
        <div><h1>{t('stmt.title')}</h1><p className="muted small">{t('stmt.sub')}</p></div>
        <div className="btn-row">
          <Button onClick={downloadPdf} disabled={!s}>⬇ {t('stmt.pdf')}</Button>
        </div>
      </div>
      <p className="muted small no-print">{t('stmt.pdf_hint')}</p>

      <div className="no-print">
        <div className="tabs" role="tablist">
          {(['this', 'last', 'custom'] as const).map((p) => (
            <button key={p} role="tab" aria-selected={preset === p} className={preset === p ? 'on' : ''} onClick={() => setPreset(p)}>{t(p === 'this' ? 'stmt.this_month' : p === 'last' ? 'stmt.last_month' : 'stmt.custom')}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <Card>
            <div className="grid grid-2 keep">
              <Field label={t('stmt.from')} type="date" value={fromIn} onChange={(e) => setFromIn(e.target.value)} />
              <Field label={t('stmt.to')} type="date" value={toIn} onChange={(e) => setToIn(e.target.value)} />
            </div>
            {dateErr && <p className="field-error" role="alert">{t('stmt.date_error')}</p>}
            <Button onClick={show}>{t('stmt.show')}</Button>
          </Card>
        )}
        {s && s.members.length > 1 && (
          <div className="person-filter">
            <label htmlFor="stmt-person">{t('stmt.person')}</label>
            <select id="stmt-person" value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="all">{t('stmt.everyone')}</option>
              {s.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="print-only print-head">
        <span className="brand"><Logo size={26} /><span className="brand-name">Khatafy</span></span>
        <h1>{group.name}</h1>
        <p>{pm ? t('stmt.for_person', { name: pm.full_name }) : t('stmt.title')} · {t('stmt.period_x', { from: date(`${range.from}T12:00:00Z`), to: date(`${range.to}T12:00:00Z`) })}</p>
        <p>{t('stmt.generated', { date: date(new Date().toISOString(), true) })}</p>
      </div>
      <p className="muted no-print" data-testid="stmt-period">{t('stmt.period_x', { from: date(`${range.from}T12:00:00Z`), to: date(`${range.to}T12:00:00Z`) })}</p>

      {q.error && <ErrorBox message={errorText(q.error)} onRetry={q.reload} />}
      {!s ? <Skeleton lines={6} /> : s.expenses.length === 0 ? <Empty icon="🧾" title={t('stmt.empty')} /> : (
        <>
          {s.truncated && <div className="banner banner-warn" role="alert">{t('stmt.truncated')}</div>}
          {pm ? (
            <Card title={t('stmt.for_person', { name: pm.full_name })}>
              <div className="stat-grid">
                <div><span className="muted small">{t('stmt.person_paid', { name: pm.full_name })}</span><strong data-testid="stmt-person-paid">{money(pm.paid_paise)}</strong></div>
                <div><span className="muted small">{t('stmt.person_share', { name: pm.full_name })}</span><strong data-testid="stmt-person-share">{money(pm.share_paise)}</strong></div>
                <div><span className="muted small">{t('stmt.person_diff')}</span><strong className={pm.paid_paise - pm.share_paise >= 0 ? 'pos-text' : 'neg-text'}>{money(pm.paid_paise - pm.share_paise, { sign: true })}</strong></div>
                <div><span className="muted small">{t('stmt.count')}</span><strong>{exps.length}</strong></div>
              </div>
            </Card>
          ) : (
            <>
              <Card>
                <div className="stat-grid">
                  <div><span className="muted small">{t('stmt.total')}</span><strong data-testid="stmt-total">{money(s.total_paise)}</strong></div>
                  <div><span className="muted small">{t('stmt.count')}</span><strong data-testid="stmt-count">{s.expense_count}</strong></div>
                  <div><span className="muted small">{t('stmt.stat_daily')}</span><strong data-testid="stmt-daily">{money(Math.round(s.total_paise / days))}</strong></div>
                  {topCat && <div><span className="muted small">{t('stmt.stat_topcat')}</span><strong>{catIcon(topCat[0])} {t(`cat.${topCat[0]}`)}</strong><span className="muted small">{money(topCat[1])}</span></div>}
                  {biggest && <div><span className="muted small">{t('stmt.stat_biggest')}</span><strong>{money(biggest.amount_paise)}</strong><span className="muted small">{biggest.title}</span></div>}
                </div>
              </Card>
              <MemberShares title={t('stmt.by_member')} total={s.total_paise} rows={s.members.map((m) => ({ id: m.user_id, name: m.full_name, share: m.share_paise, paid: m.paid_paise, status: m.status }))} />
              <Card title={t('stmt.pairs')}>
                <p className="muted small">{t('stmt.pairs_hint')}</p>
                {pairs.length === 0 ? <p className="muted">—</p> : (
                  <div className="table-wrap"><table className="table" data-testid="stmt-pairs">
                    <thead><tr><th>{t('stmt.col_payer')}</th><th>{t('stmt.col_for')}</th><th className="num">{t('stmt.col_amount')}</th></tr></thead>
                    <tbody>{pairs.map((p) => <tr key={p.payerId + p.forId}><td>{p.payerName}</td><td>{p.forName}</td><td className="num">{money(p.paise)}</td></tr>)}</tbody>
                  </table></div>
                )}
              </Card>
            </>
          )}

          <Card title={`${t('stmt.expenses')} (${exps.length})`}>
            {exps.length === 0 ? <p className="muted">{t('stmt.person_empty')}</p> : (
              <div className="table-wrap"><table className="table stmt-table" data-testid="stmt-expenses">
                <thead><tr><th>{t('csv.date')}</th><th>{t('csv.title')}</th><th>{t('expense.paid_by')}</th><th className="num">{t('stmt.col_amount')}</th><th className={pm ? 'num' : undefined}>{pm ? t('stmt.their_share') : t('stmt.split_on')}</th></tr></thead>
                <tbody>{exps.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{date(e.spent_at)}</td>
                    <td><strong>{e.title}</strong>{e.version > 1 && <> <span className="tag-edited">✎ {t('expense.edited_tag')}</span></>}<span className="muted small block">{catIcon(e.category_key)} {t(`cat.${e.category_key}`)}{e.note ? ` · ${e.note}` : ''}</span></td>
                    <td>{e.paid_by_name}</td>
                    <td className="num nowrap"><strong>{money(e.amount_paise)}</strong></td>
                    {pm ? <td className="num nowrap">{money(shareOf(e))}</td> : <td className="small">{e.splits.map((p) => `${p.full_name} ${money(p.share_paise)}`).join(' · ')}</td>}
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>

          <Card title={t('stmt.payments')}>
            {pays.length === 0 ? <p className="muted">{t('stmt.no_payments')}</p> : (
              <div className="table-wrap"><table className="table">
                <tbody>{pays.map((p) => <tr key={p.id}><td className="nowrap">{date(p.paid_at)}</td><td>{t('pay.line', { from: p.from_name, to: p.to_name, amount: money(p.amount_paise) })}</td><td>{t(`pay.method.${p.method}`)}</td></tr>)}</tbody>
              </table></div>
            )}
          </Card>
          <p className="print-only print-foot">{t('stmt.print_footer')} · {paiseToPlain(s.total_paise)} INR</p>
        </>
      )}
    </div>
  );
}
