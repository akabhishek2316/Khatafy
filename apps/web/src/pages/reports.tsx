import { useState } from 'react';
import { monthKey, monthToDate, shiftMonth } from '@khatafy/core';
import { PeriodPicker, periodBounds } from '../components/period';
import { api } from '../lib/supabase';
import { useQuery } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useGroup } from '../lib/group';
import { catIcon } from '../lib/cats';
import { Link } from '../lib/router';
import { Button, Card, Empty, ErrorBox, Skeleton, NetAmount } from '../components/ui';

export function ReportsPage() {
  const { t, money, errorText, lang } = useT();
  const { expireSession } = useAuth();
  const { group, nameOf } = useGroup();
  const gid = group.id;
  const current = monthKey(new Date(), group.timezone);
  const [month, setMonth] = useState(current);
  const [mode, setMode] = useState<'month' | 'period'>('month');
  const [pid, setPid] = useState('current');
  const closes = useQuery(`g:${gid}:closes`, () => api.listPeriodCloses(gid));
  const bounds = mode === 'period' && closes.data ? periodBounds(closes.data, pid) : null;
  const q = useQuery(mode === 'month' ? `g:${gid}:report:${month}` : closes.data ? `g:${gid}:report:p:${pid}:${closes.data.length}` : null,
    () => (mode === 'month' || !bounds ? api.getReport(gid, monthToDate(month)) : api.getReportRange(gid, bounds.from, bounds.to)), { onSessionExpired: expireSession });
  const r = q.data;
  const label = (m: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));
  const maxCat = Math.max(1, ...(r?.by_category.map((c) => c.total_paise) ?? [1]));
  const maxMonth = Math.max(1, ...(r?.monthly_totals.map((c) => c.total_paise) ?? [1]));

  return (
    <>
      <div className="page-head no-print">
        <h1>{t('nav.reports')}</h1>
        <div className="btn-row"><Link className="btn btn-secondary" to={`/g/${gid}/statement`}>🧾 {t('nav.statement')}</Link><Button variant="secondary" onClick={() => window.print()}>⬇ PDF</Button></div>
      </div>
      <div className="tabs no-print" role="tablist">
        <button role="tab" aria-selected={mode === 'month'} className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>{t('report.mode_month')}</button>
        <button role="tab" aria-selected={mode === 'period'} className={mode === 'period' ? 'on' : ''} onClick={() => setMode('period')}>{t('report.mode_period')}</button>
      </div>
      {mode === 'month' ? (
        <div className="month-nav no-print">
          <Button variant="ghost" aria-label={t('report.prev')} onClick={() => setMonth(shiftMonth(month, -1))}>‹</Button>
          <strong data-testid="report-month">{label(month)}</strong>
          <Button variant="ghost" aria-label={t('report.next')} disabled={month >= current} onClick={() => setMonth(shiftMonth(month, 1))}>›</Button>
        </div>
      ) : (
        <div className="no-print"><PeriodPicker closes={closes.data ?? []} value={pid} onChange={setPid} /></div>
      )}
      {q.error && <ErrorBox message={errorText(q.error)} onRetry={q.reload} />}
      {!r ? <Skeleton lines={6} /> : (
        <>
          <Card><div className="stat-grid"><div><span className="muted small">{t('report.total')}</span><strong data-testid="report-total">{money(r.total_paise)}</strong></div><div><span className="muted small">{t('report.count')}</span><strong>{r.expense_count}</strong></div></div></Card>
          {r.expense_count === 0 ? <Empty icon="📊" title={t('report.empty')} /> : (
            <>
              <Card title={t('report.by_category')}>
                <ul className="bars">{r.by_category.map((c) => (
                  <li key={c.category_key}><span>{catIcon(c.category_key)} {t(`cat.${c.category_key}`)}</span><span className="bar"><i style={{ width: `${(c.total_paise / maxCat) * 100}%` }} /></span><strong>{money(c.total_paise)}</strong></li>
                ))}</ul>
              </Card>
            </>
          )}
          <Card title={t('report.trend')}>
            <ul className="bars">{r.monthly_totals.map((m) => (
              <li key={m.month}><span>{label(m.month.slice(0, 7))}</span><span className="bar"><i style={{ width: `${(m.total_paise / maxMonth) * 100}%` }} /></span><strong>{money(m.total_paise)}</strong></li>
            ))}</ul>
          </Card>
          {r.budgets.length > 0 && (
            <Card title={t('report.budgets')}>
              <ul className="bars">{r.budgets.map((b) => {
                const pct = b.amount_paise ? Math.round((b.spent_paise / b.amount_paise) * 100) : 0;
                return (
                  <li key={b.category_key ?? 'all'} className={pct >= 100 ? 'over' : pct >= 80 ? 'warn' : ''}>
                    <span>{b.category_key ? `${catIcon(b.category_key)} ${t(`cat.${b.category_key}`)}` : t('budget.overall')}</span>
                    <span className="bar"><i style={{ width: `${Math.min(100, pct)}%` }} /></span>
                    <strong>{money(b.spent_paise)} / {money(b.amount_paise)} ({pct}%)</strong>
                  </li>
                );
              })}</ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
