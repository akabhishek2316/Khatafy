import { useEffect, useState, type FormEvent } from 'react';
import { editWindowLeftMs, type Category, type ExpenseListItem } from '@khatafy/core';
import { useNow } from '../lib/now';
import { api } from '../lib/supabase';
import { usePaged, useQuery, invalidate } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useGroup } from '../lib/group';
import { useToast } from '../lib/toast';
import { Link, navigate } from '../lib/router';
import { catIcon } from '../lib/cats';
import { receiptProblem, signedReceiptUrl, uploadReceipt } from '../lib/files';
import { Badge, Button, Card, Empty, ErrorBox, Field, Select, Skeleton, Modal, Spinner } from '../components/ui';

export function ExpenseRow({ e, groupId, cats }: { e: ExpenseListItem; groupId: string; cats: Category[] }) {
  const { t, money, date, lang } = useT();
  const cat = cats.find((c) => c.key === e.category_key);
  return (
    <li>
      <Link to={`/g/${groupId}/expense/${e.id}`} className={`exp-row ${e.status === 'voided' ? 'voided' : ''}`}>
        <span className="exp-ico" aria-hidden="true">{catIcon(e.category_key)}</span>
        <span className="exp-main">
          <strong>{e.title}{e.status === 'active' && e.version > 1 && <> <span className="tag-edited" title={t('expense.edited_hint')}>✎ {t('expense.edited_tag')}</span></>}</strong>
          <span className="muted small">{date(e.spent_at)} · {t('expense.paid_by_x', { name: e.paid_by_name })} · {lang === 'hi' ? cat?.name_hi : cat?.name_en}</span>
        </span>
        <span className="exp-amt">
          <strong>{money(e.amount_paise)}</strong>
          {e.status === 'voided' ? <Badge tone="bad">{t('expense.voided')}</Badge> : e.my_share_paise !== null ? <span className="muted small">{t('expense.my_share', { amount: money(e.my_share_paise) })}</span> : <span className="muted small">{t('expense.not_in_split')}</span>}
        </span>
      </Link>
    </li>
  );
}

export function DiaryPage() {
  const { t, errorText, lang } = useT();
  const toast = useToast();
  const { expireSession } = useAuth();
  const { group, activeMembers, members, archived } = useGroup();
  const gid = group.id;
  const cats = useQuery('cats', () => api.listCategories());
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [member, setMember] = useState('');
  useEffect(() => { const id = setTimeout(() => setSearch(q), 300); return () => clearTimeout(id); }, [q]);

  const filters = { search, category: cat || null, memberId: member || null };
  const list = usePaged<ExpenseListItem>(`g:${gid}:diary:${search}|${cat}|${member}`, (cursor) => api.listExpenses(gid, { ...filters, before: cursor }), { onSessionExpired: expireSession });

  return (
    <>
      <div className="page-head">
        <h1>{t('nav.diary')}</h1>
        {!archived && <Link to={`/g/${gid}/expense/new`} className="btn btn-primary">＋ {t('expense.add')}</Link>}
      </div>
      <Card>
        <div className="filters">
          <Field label={t('diary.search')} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select label={t('expense.category')} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{t('diary.all_categories')}</option>
            {cats.data?.map((c) => <option key={c.key} value={c.key}>{lang === 'hi' ? c.name_hi : c.name_en}</option>)}
          </Select>
          <Select label={t('diary.member')} value={member} onChange={(e) => setMember(e.target.value)}>
            <option value="">{t('diary.all_members')}</option>
            {(activeMembers.length ? activeMembers : members).map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
          </Select>
        </div>
      </Card>
      {list.error && <ErrorBox message={errorText(list.error)} onRetry={list.reload} />}
      {list.loading && !list.items.length ? <Skeleton lines={5} /> : list.items.length === 0 ? (
        <Empty icon="🧾" title={search || cat || member ? t('diary.no_match') : t('diary.empty')} hint={search || cat || member ? undefined : t('diary.empty_hint')} />
      ) : (
        <Card>
          <ul className="list">{list.items.map((e) => <ExpenseRow key={e.id} e={e} groupId={gid} cats={cats.data ?? []} />)}</ul>
          {list.next && <Button variant="secondary" loading={list.loadingMore} onClick={list.loadMore}>{t('common.load_more')}</Button>}
        </Card>
      )}
    </>
  );
}

export function ExpenseDetailPage({ expenseId }: { expenseId: string }) {
  const { t, money, date, errorText, lang } = useT();
  const toast = useToast();
  const { expireSession } = useAuth();
  const { group, me, isAdmin, archived, nameOf } = useGroup();
  const gid = group.id;
  const d = useQuery(`g:${gid}:expense:${expenseId}`, () => api.getExpense(expenseId), { onSessionExpired: expireSession });
  const cats = useQuery('cats', () => api.listCategories());
  const urls = useQuery(d.data ? `g:${gid}:receipt-urls:${expenseId}:${d.data.receipts.map((r) => r.id).join(',')}` : null, async () => {
    const out: Record<string, string | null> = {};
    for (const r of d.data!.receipts) out[r.id] = await signedReceiptUrl(r.storage_path);
    return out;
  });
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const now = useNow(15000);

  if (d.error && !d.data) return <ErrorBox message={errorText(d.error)} onRetry={d.reload} />;
  if (!d.data) return <Spinner />;
  const { expense: e, splits, receipts, revisions } = d.data;
  const mayChange = !archived && e.status === 'active' && (e.created_by === me || isAdmin);
  const left = editWindowLeftMs(e.created_at, now);
  const canEdit = mayChange && left > 0;
  const lastEdit = revisions.find((r) => r.change_type === 'edit');
  const cat = cats.data?.find((c) => c.key === e.category_key);

  const doVoid = async (ev: FormEvent) => {
    ev.preventDefault();
    if (reason.trim().length < 3) return setErr(t('err.REASON_REQUIRED'));
    setBusy(true); setErr(null);
    try { await api.voidExpense(e.id, e.version, reason.trim()); invalidate(`g:${gid}`); setVoiding(false); setReason(''); toast.push('success', t('expense.voided_ok')); }
    catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const p = receiptProblem(file);
    if (p) return toast.push('error', t(`err.${p}`));
    setUploading(true);
    try { await uploadReceipt(gid, e.id, file); invalidate(`g:${gid}:expense:${e.id}`); toast.push('success', t('receipt.added')); }
    catch (x) { toast.push('error', errorText(x)); } finally { setUploading(false); }
  };

  return (
    <>
      <div className="page-head">
        <h1>{e.title}{e.status === 'active' && e.version > 1 && <> <span className="tag-edited" data-testid="edited-tag" title={t('expense.edited_hint')}>✎ {t('expense.edited_tag')}</span></>}</h1>
        {mayChange && <div className="btn-row">{canEdit && <Link to={`/g/${gid}/expense/${e.id}/edit`} className="btn btn-secondary">✎ {t('common.edit')}</Link>}<Button variant="danger" onClick={() => setVoiding(true)}>{t('expense.void')}</Button></div>}
      </div>
      {mayChange && <p className={`small ${canEdit ? 'muted' : 'edit-over'}`} data-testid="edit-window">{canEdit ? `⏱ ${t('expense.edit_left', { min: Math.ceil(left / 60000) })}` : t('expense.edit_over')}</p>}
      {e.status === 'voided' && <div className="banner banner-warn" role="status" data-testid="void-banner"><strong>{t('expense.voided')}</strong> — {t('expense.void_reason_x', { reason: e.void_reason ?? '' })} ({e.voided_by_name}, {e.voided_at ? date(e.voided_at, true) : ''})</div>}
      <Card>
        <p className="big-amount">{money(e.amount_paise)}</p>
        <dl className="kv">
          <dt>{t('expense.category')}</dt><dd>{catIcon(e.category_key)} {lang === 'hi' ? cat?.name_hi : cat?.name_en}</dd>
          <dt>{t('expense.date')}</dt><dd>{date(e.spent_at, true)}</dd>
          <dt>{t('expense.paid_by')}</dt><dd>{e.paid_by_name}</dd>
          <dt>{t('expense.split_type')}</dt><dd>{t(`split.${e.split_mode}`)}</dd>
          <dt>{t('expense.added_label')}</dt><dd>{e.created_by_name} · {date(e.created_at, true)}</dd>
          {lastEdit && <><dt>{t('expense.edited_label')}</dt><dd>{lastEdit.changed_by_name} · {date(lastEdit.created_at, true)}</dd></>}
          {e.note && <><dt>{t('expense.note')}</dt><dd className="prewrap">{e.note}</dd></>}
        </dl>
      </Card>
      <Card title={t('expense.split_between')}>
        <table className="table"><thead><tr><th>{t('common.member')}</th>{e.split_mode === 'percent' && <th className="num">%</th>}<th className="num">{t('expense.share')}</th></tr></thead>
          <tbody>{splits.map((s) => <tr key={s.user_id}><td>{nameOf(s.user_id) || s.full_name}</td>{e.split_mode === 'percent' && <td className="num">{(s.percent_bps ?? 0) / 100}%</td>}<td className="num">{money(s.share_paise)}</td></tr>)}</tbody></table>
      </Card>
      <Card title={t('receipt.title')}>
        {receipts.length === 0 && <p className="muted">{t('receipt.none')}</p>}
        <ul className="receipts">
          {receipts.map((r) => {
            const u = urls.data?.[r.id];
            return (
              <li key={r.id}>
                {u && r.mime_type.startsWith('image/') ? <a href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={r.file_name} loading="lazy" /></a> : u ? <a href={u} target="_blank" rel="noopener noreferrer">📄 {r.file_name}</a> : <span className="muted">{r.file_name}</span>}
                {canEdit && <Button variant="ghost" onClick={async () => { try { await api.removeReceipt(r.id); invalidate(`g:${gid}:expense:${e.id}`); } catch (x) { toast.push('error', errorText(x)); } }}>{t('common.remove')}</Button>}
              </li>
            );
          })}
        </ul>
        {e.status === 'active' && !archived && (e.created_by === me || e.paid_by === me || isAdmin) && (
          <label className="btn btn-secondary file-btn">{uploading ? t('common.loading') : `📎 ${t('receipt.add')}`}
            <input type="file" accept={'image/jpeg,image/png,image/webp,application/pdf'} hidden disabled={uploading} onChange={(ev) => { void onFile(ev.target.files?.[0]); ev.target.value = ''; }} data-testid="receipt-input" />
          </label>
        )}
        <p className="muted small">{t('receipt.hint')}</p>
      </Card>
      {revisions.length > 0 && (
        <Card title={t('expense.history')}>
          <ul className="list">
            {revisions.map((r) => (
              <li key={r.id} className="history">
                <Badge tone={r.change_type === 'void' ? 'bad' : 'info'}>{r.change_type === 'void' ? t('expense.voided') : t('expense.edited')}</Badge>{' '}
                <strong>{r.changed_by_name}</strong> · {date(r.created_at, true)}
                <p>{t('expense.reason_x', { reason: r.reason })}</p>
                <p className="muted small">{t('expense.before')}: {r.snapshot.title} · {money(r.snapshot.amount_paise)} · {t(`split.${r.snapshot.split_mode}`)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {voiding && (
        <Modal title={t('expense.void_title')} onClose={() => setVoiding(false)} footer={<><Button variant="ghost" onClick={() => setVoiding(false)}>{t('common.cancel')}</Button><Button variant="danger" loading={busy} onClick={(ev) => void doVoid(ev as unknown as FormEvent)}>{t('expense.void')}</Button></>}>
          <p>{t('expense.void_text')}</p>
          <Field label={t('expense.reason')} value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={300} error={err} />
        </Modal>
      )}
      <Button variant="ghost" onClick={() => navigate(`/g/${gid}/diary`)}>← {t('nav.diary')}</Button>
    </>
  );
}
