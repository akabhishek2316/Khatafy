import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  editWindowLeftMs,
  bpsToPercentString, computeSplits, evenPercentBps, localInputToIso, newId, parsePercentToBps, parseRupeesToPaise, paiseToPlain,
  SplitError, toLocalInput, toKhError, validateExpenseInput, type ExpenseInput, type SplitMode,
} from '@khatafy/core';
import { api } from '../lib/supabase';
import { invalidate, useQuery } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useGroup } from '../lib/group';
import { useToast } from '../lib/toast';
import { Link, navigate } from '../lib/router';
import { catIcon } from '../lib/cats';
import { draftQueue, draftsChanged } from '../lib/drafts';
import { receiptProblem, uploadReceipt } from '../lib/files';
import { Button, Card, ErrorBox, Field, Select, Spinner, TextArea } from '../components/ui';

type Person = { id: string; name: string; left: boolean };

export function ExpenseFormPage({ expenseId }: { expenseId?: string }) {
  const { expireSession } = useAuth();
  const { group } = useGroup();
  const { errorText } = useT();
  const detail = useQuery(expenseId ? `g:${group.id}:expense:${expenseId}` : null, () => api.getExpense(expenseId!), { onSessionExpired: expireSession });
  if (expenseId) {
    if (detail.error && !detail.data) return <ErrorBox message={errorText(detail.error)} onRetry={detail.reload} />;
    if (!detail.data) return <Spinner />;
    if (detail.data.expense.status !== 'active' || editWindowLeftMs(detail.data.expense.created_at) === 0) return <EditLocked gid={group.id} id={expenseId} />;
  }
  return <FormInner key={expenseId ?? 'new'} expenseId={expenseId} existing={detail.data ?? null} />;
}

function EditLocked({ gid, id }: { gid: string; id: string }) {
  const { t } = useT();
  return (
    <>
      <h1>{t('expense.edit')}</h1>
      <div className="banner banner-warn" role="alert" data-testid="edit-locked">{t('expense.edit_over')}</div>
      <Link to={`/g/${gid}/expense/${id}`} className="btn btn-secondary">← {t('common.back')}</Link>
    </>
  );
}

function FormInner({ expenseId, existing }: { expenseId?: string; existing: import('@khatafy/core').ExpenseDetail | null }) {
  const { t, errorText, money, lang } = useT();
  const toast = useToast();
  const { group, activeMembers, me, nameOf, archived } = useGroup();
  const gid = group.id;
  const cats = useQuery('cats', () => api.listCategories());
  const exp = existing?.expense;
  const idemKey = useRef(newId());

  const people: Person[] = useMemo(() => {
    const list: Person[] = activeMembers.map((m) => ({ id: m.user_id, name: m.full_name, left: false }));
    const extra = new Set<string>();
    if (exp) extra.add(exp.paid_by);
    existing?.splits.forEach((s) => extra.add(s.user_id));
    for (const id of extra) if (!list.some((p) => p.id === id)) list.push({ id, name: nameOf(id), left: true });
    return list;
  }, [activeMembers, exp, existing, nameOf]);

  const [title, setTitle] = useState(exp?.title ?? '');
  const [amountStr, setAmountStr] = useState(exp ? paiseToPlain(exp.amount_paise) : '');
  const [category, setCategory] = useState(exp?.category_key ?? 'grocery');
  const [spentAt, setSpentAt] = useState(toLocalInput(exp ? new Date(exp.spent_at) : new Date()));
  const [paidBy, setPaidBy] = useState(exp?.paid_by ?? me);
  const [mode, setMode] = useState<SplitMode>(exp?.split_mode ?? 'equal');
  const [selected, setSelected] = useState<Set<string>>(new Set(existing ? existing.splits.map((s) => s.user_id) : activeMembers.map((m) => m.user_id)));
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries((existing?.splits ?? []).map((s) => [s.user_id, paiseToPlain(s.share_paise)])));
  const [percents, setPercents] = useState<Record<string, string>>(() => Object.fromEntries((existing?.splits ?? []).filter((s) => s.percent_bps !== null).map((s) => [s.user_id, bpsToPercentString(s.percent_bps!)])));
  const [note, setNote] = useState(exp?.note ?? '');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const amountPaise = parseRupeesToPaise(amountStr);
  const chosen = people.filter((p) => selected.has(p.id));

  const preview = useMemo(() => {
    if (!amountPaise || !chosen.length) return null;
    try {
      const parts = chosen.map((p) => ({
        userId: p.id,
        amountPaise: mode === 'amount' ? parseRupeesToPaise(amounts[p.id] ?? '') ?? undefined : undefined,
        percentBps: mode === 'percent' ? parsePercentToBps(percents[p.id] ?? '') ?? undefined : undefined,
      }));
      return { shares: computeSplits(mode, amountPaise, parts), error: null as string | null };
    } catch (e) {
      return { shares: null, error: e instanceof SplitError ? e.code : 'INVALID_SPLIT' };
    }
  }, [amountPaise, chosen, mode, amounts, percents]);

  const sumAmounts = chosen.reduce((s, p) => s + (parseRupeesToPaise(amounts[p.id] ?? '') ?? 0), 0);
  const sumBps = chosen.reduce((s, p) => s + (parsePercentToBps(percents[p.id] ?? '') ?? 0), 0);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const fillEven = () => {
    if (!amountPaise || !chosen.length) return;
    if (mode === 'amount') {
      const eq = computeSplits('equal', amountPaise, chosen.map((p) => ({ userId: p.id })));
      setAmounts(Object.fromEntries(eq.map((s) => [s.userId, paiseToPlain(s.sharePaise)])));
    } else {
      const bps = evenPercentBps(chosen.length);
      const sorted = [...chosen].sort((a, b) => (a.id < b.id ? -1 : 1));
      setPercents(Object.fromEntries(sorted.map((p, i) => [p.id, bpsToPercentString(bps[i]!)])));
    }
  };

  const buildInput = (): ExpenseInput | null => {
    const er: Record<string, string> = {};
    const input: ExpenseInput = {
      title: title.trim(), amountPaise: amountPaise ?? 0, categoryKey: category,
      spentAt: exp ? exp.spent_at : new Date().toISOString(), paidBy, splitMode: mode,
      participants: chosen.map((p) => ({
        userId: p.id,
        ...(mode === 'amount' ? { amountPaise: parseRupeesToPaise(amounts[p.id] ?? '') ?? -1 } : {}),
        ...(mode === 'percent' ? { percentBps: parsePercentToBps(percents[p.id] ?? '') ?? -1 } : {}),
      })),
      note: note.trim() || null,
    };
    for (const code of validateExpenseInput(input)) {
      const field = code === 'INVALID_TITLE' ? 'title' : code === 'INVALID_AMOUNT' ? 'amount' : code === 'NO_PARTICIPANTS' ? 'participants' : code === 'PAYER_REQUIRED' ? 'paidBy' : code === 'INVALID_DATE' ? 'date' : code === 'NOTE_TOO_LONG' ? 'note' : 'category';
      er[field] = t(`err.${code}`);
    }
    if (!er.amount && !er.participants) {
      try { computeSplits(mode, input.amountPaise, input.participants); } catch (e) { er.split = t(`err.${e instanceof SplitError ? e.code : 'INVALID_SPLIT'}`); }
    }
    if (exp && reason.trim().length < 3) er.reason = t('err.REASON_REQUIRED');
    if (file) { const p = receiptProblem(file); if (p) er.file = t(`err.${p}`); }
    setErrs(er);
    return Object.keys(er).length ? null : input;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const input = buildInput();
    if (!input) return;
    setBusy(true);
    try {
      if (exp) {
        await api.editExpense(exp.id, exp.version, reason.trim(), input);
        invalidate(`g:${gid}`);
        toast.push('success', t('expense.saved_edit'));
        navigate(`/g/${gid}/expense/${exp.id}`);
        return;
      }
      if (!navigator.onLine) throw Object.assign(new Error('Failed to fetch'), { name: 'TypeError' });
      const id = await api.createExpense(gid, idemKey.current, input);
      invalidate(`g:${gid}`);
      if (file) { try { await uploadReceipt(gid, id, file); } catch (x) { toast.push('error', errorText(x)); } }
      toast.push('success', t('expense.saved'));
      navigate(`/g/${gid}/expense/${id}`);
    } catch (x) {
      const err = toKhError(x);
      if (!exp && err.code === 'NETWORK') {
        await draftQueue.add(gid, input);
        draftsChanged();
        toast.push('info', t('draft.saved_offline'));
        navigate(`/g/${gid}/diary`);
      } else if (exp && err.code === 'NETWORK') {
        setErrs({ form: t('err.OFFLINE_ONLY_NEW') });
      } else setErrs({ form: errorText(err) });
    } finally { setBusy(false); }
  };

  if (archived) return <ErrorBox message={t('err.GROUP_ARCHIVED')} />;

  return (
    <form onSubmit={submit} noValidate className="expense-form">
      <h1>{exp ? t('expense.edit') : t('expense.add')}</h1>
      {exp && <div className="banner banner-info">{t('expense.edit_hint')}</div>}
      <Card>
        <Field label={`${t('expense.amount')} (₹)`} inputMode="decimal" autoComplete="off" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} error={errs.amount} placeholder="0.00" className="amount-input" />
        <Field label={t('expense.title')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} error={errs.title} placeholder={t('expense.title_ph')} />
        <fieldset className="chips">
          <legend>{t('expense.category')}</legend>
          {(cats.data ?? []).map((c) => (
            <label key={c.key} className={`chip ${category === c.key ? 'on' : ''}`}>
              <input type="radio" name="category" value={c.key} checked={category === c.key} onChange={() => setCategory(c.key)} />
              <span aria-hidden="true">{catIcon(c.key)}</span> {lang === 'hi' ? c.name_hi : c.name_en}
            </label>
          ))}
        </fieldset>
        <div className="grid grid-2">
          <Field label={t('expense.date')} value={exp ? new Date(exp.spent_at).toLocaleString() : t('expense.date_now')} readOnly disabled hint={t('expense.date_hint')} />
          <Field label={t('expense.paid_by')} value={`${people.find((p) => p.id === paidBy)?.name ?? ''}${paidBy === me ? ` (${t('common.you')})` : ''}`} readOnly disabled hint={t('expense.paid_by_hint')} error={errs.paidBy} />
        </div>
      </Card>

      <Card title={t('expense.split_between')}>
        <div className="tabs" role="tablist" aria-label={t('expense.split_type')}>
          {(['equal', 'amount', 'percent'] as SplitMode[]).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{t(`split.${m}`)}</button>
          ))}
        </div>
        <div className="row small-gap">
          <Button type="button" variant="ghost" onClick={() => setSelected(new Set(people.filter((p) => !p.left).map((p) => p.id)))}>{t('expense.select_all')}</Button>
          <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>{t('expense.select_none')}</Button>
          {mode !== 'equal' && <Button type="button" variant="ghost" onClick={fillEven}>{t('expense.fill_even')}</Button>}
        </div>
        {errs.participants && <p className="field-error" role="alert">{errs.participants}</p>}
        <ul className="people">
          {people.map((p) => {
            const share = preview?.shares?.find((s) => s.userId === p.id.toLowerCase());
            const on = selected.has(p.id);
            return (
              <li key={p.id} className={on ? 'on' : ''}>
                <label className="person"><input type="checkbox" checked={on} onChange={() => toggle(p.id)} /><span>{p.name}{p.id === me ? ` (${t('common.you')})` : ''}{p.left ? ` · ${t('member.left')}` : ''}</span></label>
                {on && mode === 'amount' && <input className="mini" aria-label={`${t('expense.share')} ${p.name}`} inputMode="decimal" value={amounts[p.id] ?? ''} onChange={(e) => setAmounts((s) => ({ ...s, [p.id]: e.target.value }))} placeholder="0.00" />}
                {on && mode === 'percent' && <span className="pct"><input className="mini" aria-label={`% ${p.name}`} inputMode="decimal" value={percents[p.id] ?? ''} onChange={(e) => setPercents((s) => ({ ...s, [p.id]: e.target.value }))} placeholder="0" />%</span>}
                {on && share && mode !== 'amount' && <span className="share">{money(share.sharePaise)}</span>}
              </li>
            );
          })}
        </ul>
        {mode === 'amount' && amountPaise ? <p className={sumAmounts === amountPaise ? 'ok small' : 'neg small'} data-testid="split-remaining">{sumAmounts === amountPaise ? t('expense.split_ok') : t('expense.remaining', { amount: money(amountPaise - sumAmounts) })}</p> : null}
        {mode === 'percent' ? <p className={sumBps === 10000 ? 'ok small' : 'neg small'} data-testid="split-remaining">{sumBps === 10000 ? t('expense.split_ok') : t('expense.remaining_pct', { pct: bpsToPercentString(Math.abs(10000 - sumBps)) + (sumBps > 10000 ? '' : '') })}</p> : null}
        {mode === 'equal' && preview?.shares && <p className="muted small">{t('expense.equal_note')}</p>}
        {errs.split && <p className="field-error" role="alert">{errs.split}</p>}
      </Card>

      <Card>
        <TextArea label={t('expense.note')} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} error={errs.note} />
        {!exp && (
          <div className="field">
            <label htmlFor="rcpt">{t('receipt.add')}</label>
            <input id="rcpt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="form-receipt" />
            {errs.file && <p className="field-error" role="alert">{errs.file}</p>}
            <p className="hint">{t('receipt.hint')}</p>
          </div>
        )}
        {exp && <Field label={t('expense.reason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} error={errs.reason} hint={t('expense.reason_hint')} />}
      </Card>
      {errs.form && <div className="error-box" role="alert">{errs.form}{errs.form === t('err.VERSION_CONFLICT') && <Button type="button" variant="secondary" onClick={() => { invalidate(`g:${gid}`); navigate(`/g/${gid}/expense/${expenseId}`); }}>{t('common.reload')}</Button>}</div>}
      <div className="sticky-actions">
        <Button type="button" variant="ghost" onClick={() => history.back()}>{t('common.cancel')}</Button>
        <Button type="submit" loading={busy}>{exp ? t('common.save') : t('expense.save')}</Button>
      </div>
    </form>
  );
}
