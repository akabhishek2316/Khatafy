import { useState } from 'react';
import { activityText } from '@khatafy/core';
import { api } from '../lib/supabase';
import { invalidate, useQuery } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useGroup } from '../lib/group';
import { useToast } from '../lib/toast';
import { Badge, Button, Card, ConfirmModal, Empty, ErrorBox, Field, Modal, Skeleton, TextArea } from '../components/ui';
import type { ActivityItem, Notice } from '@khatafy/core';

export function ShoppingPage() {
  const { t, errorText } = useT();
  const toast = useToast();
  const { expireSession } = useAuth();
  const { group, archived } = useGroup();
  const gid = group.id;
  const q = useQuery(`g:${gid}:shopping`, () => api.getShoppingList(gid), { onSessionExpired: expireSession });
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const fail = (x: unknown) => toast.push('error', errorText(x));
  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { await api.addShoppingItem(gid, name.trim(), qty.trim() || null); setName(''); setQty(''); invalidate(`g:${gid}:shopping`); } catch (x) { fail(x); } finally { setBusy(false); }
  };
  const items = q.data?.items ?? [];
  const needed = items.filter((i) => i.status === 'needed');
  const bought = items.filter((i) => i.status === 'bought');
  const toggle = async (id: string, b: boolean) => { try { await api.setShoppingItemBought(id, b); invalidate(`g:${gid}:shopping`); } catch (x) { fail(x); } };
  const remove = async (id: string) => { try { await api.removeShoppingItem(id); invalidate(`g:${gid}:shopping`); } catch (x) { fail(x); } };
  const clear = async () => { try { await api.clearBoughtItems(gid); invalidate(`g:${gid}:shopping`); } catch (x) { fail(x); } };

  return (
    <>
      <h1>{t('nav.shopping')}</h1>
      {!archived && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Field label={t('shop.item')} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <Field label={t('shop.qty')} value={qty} onChange={(e) => setQty(e.target.value)} maxLength={40} />
          <Button type="submit" loading={busy}>{t('common.add')}</Button>
        </form>
      )}
      {q.error && <ErrorBox message={errorText(q.error)} onRetry={q.reload} />}
      {!q.data ? <Skeleton lines={4} /> : items.length === 0 ? <Empty icon="🛒" title={t('shop.empty')} hint={t('shop.empty_hint')} /> : (
        <>
          <Card title={`${t('shop.needed')} (${needed.length})`}>
            {needed.length === 0 ? <p className="muted">{t('shop.nothing_needed')}</p> : <ul className="list">{needed.map((i) => (
              <li key={i.id} className="row" data-testid="shop-item">
                <input type="checkbox" aria-label={t('shop.mark_bought', { name: i.name })} disabled={archived} onChange={() => toggle(i.id, true)} />
                <span className="grow"><strong>{i.name}</strong>{i.quantity ? ` · ${i.quantity}` : ''}<span className="muted small block">{t('shop.added_by', { name: i.added_by_name })}</span></span>
                {!archived && <Button variant="ghost" aria-label={t('common.delete')} onClick={() => remove(i.id)}>✕</Button>}
              </li>
            ))}</ul>}
          </Card>
          {bought.length > 0 && (
            <Card title={`${t('shop.bought')} (${bought.length})`} action={!archived && <Button variant="ghost" onClick={clear}>{t('shop.clear')}</Button>}>
              <ul className="list">{bought.map((i) => (
                <li key={i.id} className="row done">
                  <input type="checkbox" checked aria-label={t('shop.mark_needed', { name: i.name })} disabled={archived} onChange={() => toggle(i.id, false)} />
                  <span className="grow"><s>{i.name}</s>{i.quantity ? ` · ${i.quantity}` : ''}<span className="muted small block">{t('shop.bought_by', { name: i.bought_by_name ?? '?' })}</span></span>
                </li>
              ))}</ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}

export function NoticesPage() {
  const { t, date, errorText } = useT();
  const toast = useToast();
  const { expireSession } = useAuth();
  const { group, me, isAdmin, archived } = useGroup();
  const gid = group.id;
  const q = useQuery(`g:${gid}:notices`, () => api.listNotices(gid), { onSessionExpired: expireSession });
  const [edit, setEdit] = useState<Notice | 'new' | null>(null);
  const [del, setDel] = useState<Notice | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (n: Notice | 'new') => { setEdit(n); setTitle(n === 'new' ? '' : n.title); setBody(n === 'new' ? '' : n.body); setPinned(n === 'new' ? false : n.pinned); setErr(null); };
  const save = async () => {
    if (!title.trim() || !body.trim()) return setErr(t('notice.required'));
    setBusy(true); setErr(null);
    try {
      if (edit === 'new') await api.createNotice(gid, title.trim(), body.trim(), pinned && isAdmin);
      else if (edit) await api.updateNotice(edit.id, title.trim(), body.trim(), isAdmin ? pinned : null);
      invalidate(`g:${gid}:notices`); setEdit(null);
    } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  const doDelete = async () => {
    if (!del) return;
    setBusy(true);
    try { await api.deleteNotice(del.id); invalidate(`g:${gid}:notices`); setDel(null); } catch (x) { toast.push('error', errorText(x)); setDel(null); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="page-head"><h1>{t('nav.notices')}</h1>{!archived && <Button onClick={() => open('new')}>＋ {t('notice.new')}</Button>}</div>
      {q.error && <ErrorBox message={errorText(q.error)} onRetry={q.reload} />}
      {!q.data ? <Skeleton lines={3} /> : q.data.length === 0 ? <Empty icon="📌" title={t('notice.empty')} hint={t('notice.empty_hint')} /> : q.data.map((n) => (
        <Card key={n.id} title={<>{n.pinned && '📌 '}{n.title}</>} action={!archived && (n.created_by === me || isAdmin) && <div className="btn-row"><Button variant="ghost" onClick={() => open(n)}>{t('common.edit')}</Button><Button variant="ghost" onClick={() => setDel(n)}>{t('common.delete')}</Button></div>}>
          <p className="pre">{n.body}</p>
          <p className="muted small">{n.created_by_name} · {date(n.created_at, true)}</p>
        </Card>
      ))}
      {edit && (
        <Modal title={edit === 'new' ? t('notice.new') : t('common.edit')} onClose={() => setEdit(null)} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button loading={busy} onClick={save}>{t('common.save')}</Button></>}>
          <Field label={t('notice.title')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          <TextArea label={t('notice.body')} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={5} />
          {isAdmin && <label className="check"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> {t('notice.pin')}</label>}
          {err && <p className="field-error" role="alert">{err}</p>}
        </Modal>
      )}
      {del && <ConfirmModal title={t('common.delete')} text={t('notice.delete_text')} confirmLabel={t('common.delete')} danger busy={busy} onClose={() => setDel(null)} onConfirm={doDelete} />}
    </>
  );
}

export function ActivityPage() {
  const { t, date, errorText } = useT();
  const { expireSession } = useAuth();
  const { group } = useGroup();
  const gid = group.id;
  const [extra, setExtra] = useState<ActivityItem[]>([]);
  const [next, setNext] = useState<number | null | undefined>(undefined);
  const [more, setMore] = useState(false);
  const q = useQuery(`g:${gid}:activity`, () => api.listActivity(gid), { onSessionExpired: expireSession });
  const items = [...(q.data?.items ?? []), ...extra];
  const cursor = next === undefined ? (q.data?.next_before_id ?? null) : next;
  const loadMore = async () => {
    if (cursor === null) return;
    setMore(true);
    try { const p = await api.listActivity(gid, cursor); setExtra((e) => [...e, ...p.items]); setNext(p.next_before_id); } catch { /* keep list */ } finally { setMore(false); }
  };
  return (
    <>
      <h1>{t('nav.activity')}</h1>
      {q.error && <ErrorBox message={errorText(q.error)} onRetry={q.reload} />}
      {!q.data ? <Skeleton lines={5} /> : items.length === 0 ? <Empty icon="🕘" title={t('activity.empty')} /> : (
        <Card>
          <ul className="list">{items.map((a) => (
            <li key={a.id} className="row"><span className="grow">{activityText(a, t)}<span className="muted small block">{date(a.created_at, true)}</span></span><Badge>{a.entity_type}</Badge></li>
          ))}</ul>
          {cursor !== null && <Button variant="secondary" loading={more} onClick={loadMore}>{t('common.load_more')}</Button>}
        </Card>
      )}
    </>
  );
}
