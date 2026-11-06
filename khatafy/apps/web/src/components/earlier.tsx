import { suggestSettlements, type MemberBalance } from '@khatafy/core';
import { useT } from '../lib/i18n';
import { Button, Card } from './ui';

type Pay = { from: string; to: string; amountPaise: number };

/**
 * Unpaid dues of CLOSED periods, shown separately from the current period so they never get mixed up.
 * mine=true  -> only what this person has to pay / will get (Home)
 * mine=false -> also everyone else's earlier dues (Balances)
 */
export function EarlierDues({ rows, me, nameOf, archived, isAdmin, mine, onPay }: {
  rows: MemberBalance[]; me: string; nameOf: (id: string) => string; archived: boolean; isAdmin: boolean; mine: boolean; onPay: (p: Pay) => void;
}) {
  const { t, money, date } = useT();
  const until = rows.find((r) => r.earlier_until)?.earlier_until;
  const list = suggestSettlements(rows.map((b) => ({ userId: b.user_id, netPaise: b.carry_paise ?? 0 })));
  if (list.length === 0) return null;
  const when = until ? date(`${until}T12:00:00Z`) : '';
  const toPay = list.filter((s) => s.from === me);
  const toGet = list.filter((s) => s.to === me);
  const others = mine ? [] : list.filter((s) => s.from !== me && s.to !== me);
  const can = (s: Pay) => !archived && (isAdmin || s.from === me || s.to === me);
  const reason = <span className="muted small block">{t('earlier.reason', { date: when })}</span>;
  return (
    <>
      {toPay.length > 0 && (
        <Card title={`⏳ ${t('earlier.title_pay')}`} className="earlier-card earlier-pay">
          <p className="muted small">{t('earlier.hint', { date: when })}</p>
          <ul className="list">{toPay.map((s) => (
            <li key={s.from + s.to} className="row"><span><strong>{t('dash.you_pay', { to: nameOf(s.to), amount: money(s.amountPaise) })}</strong>{reason}</span>
              {can(s) && <Button variant="secondary" onClick={() => onPay(s)}>{t('pay.record')}</Button>}</li>
          ))}</ul>
        </Card>
      )}
      {toGet.length > 0 && (
        <Card title={`⏳ ${t('earlier.title_get')}`} className="earlier-card earlier-get">
          <p className="muted small">{t('earlier.hint', { date: when })}</p>
          <ul className="list">{toGet.map((s) => (
            <li key={s.from + s.to} className="row"><span><strong>{t('dash.pays_you', { from: nameOf(s.from), amount: money(s.amountPaise) })}</strong>{reason}</span>
              {can(s) && <Button variant="secondary" onClick={() => onPay(s)}>{t('pay.record')}</Button>}</li>
          ))}</ul>
        </Card>
      )}
      {!mine && <p className="muted small">{t('earlier.rule')}</p>}
      {others.length > 0 && (
        <Card title={`⏳ ${t('earlier.title_all')}`} className="earlier-card">
          <p className="muted small">{t('earlier.hint', { date: when })}</p>
          <ul className="list">{others.map((s) => (
            <li key={s.from + s.to} className="row"><span>{t('pay.line', { from: nameOf(s.from), to: nameOf(s.to), amount: money(s.amountPaise) })}</span>
              {can(s) && <Button variant="secondary" onClick={() => onPay(s)}>{t('pay.record')}</Button>}</li>
          ))}</ul>
        </Card>
      )}
    </>
  );
}
