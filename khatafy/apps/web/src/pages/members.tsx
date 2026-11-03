import { useState } from 'react';
import { api } from '../lib/supabase';
import { invalidate, useQuery } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useGroup } from '../lib/group';
import { useToast } from '../lib/toast';
import { Link } from '../lib/router';
import { catIcon } from '../lib/cats';
import { Avatar, Badge, Button, Card, ConfirmModal, Empty, ErrorBox, Field, Modal, NetAmount, Select, Skeleton, copyText } from '../components/ui';
import type { Member } from '@khatafy/core';

export function MembersPage() {
  const { t, date, errorText } = useT();
  const toast = useToast();
  const { group, members, me, isAdmin, archived, reload } = useGroup();
  const gid = group.id;
  const [target, setTarget] = useState<{ m: Member; action: 'remove' | 'stepdown' | 'demote' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const isCreator = group.created_by === me;
  const active = members.filter((m) => m.status === 'active');
  const past = members.filter((m) => m.status !== 'active');

  const run = async (fn: () => Promise<unknown>, okKey: string) => {
    setBusy(true);
    try { await fn(); invalidate(`g:${gid}`); reload(); toast.push('success', t(okKey)); setTarget(null); }
    catch (x) { toast.push('error', errorText(x)); setTarget(null); } finally { setBusy(false); }
  };
  const roleBadge = (r: Member['role']) => <Badge tone={r === 'admin' ? 'good' : 'neutral'}>{t(`role.${r}`)}</Badge>;

  return (
    <>
      <div className="page-head">
        <h1>{t('nav.members')}</h1>
        {isAdmin && !archived && <div className="btn-row"><Link className="btn btn-secondary" to={`/g/${gid}/requests`}>{t('member.requests')}{group.pending_requests > 0 ? ` (${group.pending_requests})` : ''}</Link><Link className="btn btn-primary" to={`/g/${gid}/invitations`}>＋ {t('member.invite')}</Link></div>}
      </div>
      <Card>
        <ul className="list">
          {active.map((m) => (
            <li key={m.user_id} className="row" data-testid="member-row">
              <Avatar name={m.full_name} url={m.avatar_url} />
              <span className="grow">
                <Link to={`/g/${gid}/members/${m.user_id}`}><strong>{m.is_deleted ? t('common.deleted_user') : m.full_name}</strong></Link>{m.user_id === me && <> <Badge>{t('common.you')}</Badge></>} {roleBadge(m.role)}{m.user_id === group.created_by && <> <Badge tone="info">{t('member.creator')}</Badge></>}
                <span className="muted small block">{t('member.joined_x', { date: date(m.joined_at) })}</span>
              </span>
              <div className="btn-row row-actions">
              {!archived && isAdmin && m.role === 'member' && (
                <>
                  <Button variant="ghost" disabled={busy} onClick={() => run(() => api.setMemberRole(gid, m.user_id, 'admin'), 'member.role_changed')}>{t('member.make_admin')}</Button>
                  <Button variant="ghost" onClick={() => setTarget({ m, action: 'remove' })}>{t('member.remove')}</Button>
                </>
              )}
              {!archived && isCreator && m.role === 'admin' && m.user_id !== me && (
                <>
                  <Button variant="ghost" onClick={() => setTarget({ m, action: 'demote' })}>{t('member.remove_admin_role')}</Button>
                  <Button variant="ghost" onClick={() => setTarget({ m, action: 'remove' })}>{t('member.remove')}</Button>
                </>
              )}
              {!archived && m.user_id === me && m.role === 'admin' && active.filter((x) => x.role === 'admin').length > 1 && (
                <Button variant="ghost" onClick={() => setTarget({ m, action: 'stepdown' })}>{t('member.step_down')}</Button>
              )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {isAdmin && <p className="muted small">{t('member.role_admin_note')}</p>}
      {past.length > 0 && (
        <>
          <Button variant="ghost" onClick={() => setShowPast((v) => !v)}>{showPast ? '▾' : '▸'} {t('member.past', { n: past.length })}</Button>
          {showPast && <Card><ul className="list">{past.map((m) => (
            <li key={m.user_id} className="row"><Avatar name={m.full_name} url={m.avatar_url} /><span className="grow"><Link to={`/g/${gid}/members/${m.user_id}`}>{m.is_deleted ? t('common.deleted_user') : m.full_name}</Link> <Badge tone="warn">{t(`member.status.${m.status}`)}</Badge></span></li>
          ))}</ul></Card>}
        </>
      )}
      {target?.action === 'remove' && <ConfirmModal title={t('member.remove')} text={t('member.remove_text', { name: target.m.full_name })} confirmLabel={t('member.remove')} danger busy={busy} onClose={() => setTarget(null)} onConfirm={() => run(() => api.removeMember(gid, target.m.user_id), 'member.removed')} />}
      {target?.action === 'demote' && <ConfirmModal title={t('member.remove_admin_role')} text={t('member.remove_admin_role_text', { name: target.m.full_name })} confirmLabel={t('member.remove_admin_role')} danger busy={busy} onClose={() => setTarget(null)} onConfirm={() => run(() => api.setMemberRole(gid, target.m.user_id, 'member'), 'member.role_changed')} />}
      {target?.action === 'stepdown' && <ConfirmModal title={t('member.step_down')} text={t('member.step_down_text')} confirmLabel={t('member.step_down')} danger busy={busy} onClose={() => setTarget(null)} onConfirm={() => run(() => api.setMemberRole(gid, target.m.user_id, 'member'), 'member.role_changed')} />}
    </>
  );
}

export function MemberLedgerPage({ userId }: { userId: string }) {
  const { t, money, date, errorText } = useT();
  const { expireSession } = useAuth();
  const { group, nameOf } = useGroup();
  const gid = group.id;
  const [limit, setLimit] = useState(50);
  const q = useQuery(`g:${gid}:ledger:${userId}:${limit}`, () => api.getMemberLedger(gid, userId, 0, limit), { onSessionExpired: expireSession });
  const l = q.data;
  const eff = (e: { kind: string; effect_paise: number }) => e.effect_paise;
  return (
    <>
      <Link to={`/g/${gid}/balances`} className="back">← {t('nav.balances')}</Link>
      <h1>{nameOf(userId)}</h1>
      {q.error && <ErrorBox message={errorText(q.error)} onRetry={q.reload} />}
      {!l ? <Skeleton lines={5} /> : (
        <>
          <Card>
            <div className="stat-grid">
              <div><span className="muted small">{t('ledger.paid')}</span><strong>{money(l.summary.paid_paise)}</strong></div>
              <div><span className="muted small">{t('ledger.share')}</span><strong>{money(l.summary.share_paise)}</strong></div>
              <div><span className="muted small">{t('ledger.settled_out')}</span><strong>{money(l.summary.settlement_paid_paise)}</strong></div>
              <div><span className="muted small">{t('ledger.settled_in')}</span><strong>{money(l.summary.settlement_received_paise)}</strong></div>
              <div><span className="muted small">{t('ledger.net')}</span><NetAmount paise={l.summary.net_paise} big /></div>
            </div>
          </Card>
          {l.entries.length === 0 ? <Empty icon="📒" title={t('ledger.empty')} /> : (
            <Card>
              <ul className="list">
                {l.entries.map((e) => (
                  <li key={e.kind + e.id} className="row">
                    <span className="cat-ico" aria-hidden>{e.kind === 'expense' ? catIcon(e.category_key ?? 'other') : '💸'}</span>
                    <span className="grow">
                      {e.kind === 'expense' ? <Link to={`/g/${gid}/expense/${e.id}`}>{e.title}</Link> : <span>{e.kind === 'payment_out' ? t('ledger.paid_to', { name: e.counterparty_name ?? '?' }) : t('ledger.received_from', { name: e.counterparty_name ?? '?' })}</span>}
                      <span className="muted small block">{date(e.occurred_at)}{e.status !== 'active' && e.status !== 'confirmed' ? ` · ${e.status}` : ''}</span>
                    </span>
                    <NetAmount paise={eff(e)} />
                  </li>
                ))}
              </ul>
              {l.has_more && <Button variant="secondary" onClick={() => setLimit((x) => x + 50)}>{t('common.load_more')}</Button>}
            </Card>
          )}
        </>
      )}
    </>
  );
}

export function RequestsPage() {
  const { t, date, errorText } = useT();
  const toast = useToast();
  const { expireSession } = useAuth();
  const { group, isAdmin, reload } = useGroup();
  const gid = group.id;
  const q = useQuery(`g:${gid}:requests`, () => api.listJoinRequests(gid, 'pending'), { onSessionExpired: expireSession });
  const [busy, setBusy] = useState<string | null>(null);
  if (!isAdmin) return <ErrorBox message={t('err.NOT_ALLOWED')} />;
  const review = async (id: string, d: 'approved' | 'rejected') => {
    setBusy(id);
    try { await api.reviewJoinRequest(id, d); invalidate(`g:${gid}`); reload(); toast.push('success', t(d === 'approved' ? 'member.approved' : 'member.rejected')); }
    catch (x) { toast.push('error', errorText(x)); } finally { setBusy(null); }
  };
  return (
    <>
      <Link to={`/g/${gid}/members`} className="back">← {t('nav.members')}</Link>
      <h1>{t('member.requests')}</h1>
      {q.error && <ErrorBox message={errorText(q.error)} onRetry={q.reload} />}
      {!q.data ? <Skeleton lines={3} /> : q.data.length === 0 ? <Empty icon="📬" title={t('member.no_requests')} /> : (
        <Card><ul className="list">{q.data.map((r) => (
          <li key={r.id} className="row" data-testid="join-request">
            <Avatar name={r.full_name} />
            <span className="grow"><strong>{r.full_name}</strong><span className="muted small block">{date(r.created_at, true)}{r.message ? ` · “${r.message}”` : ''}</span></span>
            <div className="btn-row"><Button loading={busy === r.id} onClick={() => review(r.id, 'approved')}>{t('member.approve')}</Button><Button variant="ghost" disabled={busy === r.id} onClick={() => review(r.id, 'rejected')}>{t('member.reject')}</Button></div>
          </li>
        ))}</ul></Card>
      )}
    </>
  );
}

export function InvitationsPage() {
  const { t, date, errorText } = useT();
  const toast = useToast();
  const { expireSession } = useAuth();
  const { group, isAdmin, archived } = useGroup();
  const gid = group.id;
  const q = useQuery(`g:${gid}:invites`, () => api.listInvitations(gid), { onSessionExpired: expireSession });
  const [days, setDays] = useState('7');
  const [maxUses, setMaxUses] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  if (!isAdmin) return <ErrorBox message={t('err.NOT_ALLOWED')} />;
  const link = created ? `${location.origin}/join?code=${encodeURIComponent(created)}` : '';

  const create = async () => {
    setBusy(true);
    try {
      const exp = days ? new Date(Date.now() + Number(days) * 86400000).toISOString() : null;
      const uses = maxUses ? Math.max(1, Math.floor(Number(maxUses))) : null;
      const code = await api.createInvitation(gid, exp, uses);
      setCreated(code); invalidate(`g:${gid}:invites`);
    } catch (x) { toast.push('error', errorText(x)); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    try { await api.revokeInvitation(id); invalidate(`g:${gid}:invites`); toast.push('success', t('invite.revoked')); } catch (x) { toast.push('error', errorText(x)); }
  };
  const copy = async (s: string) => { const ok = await copyText(s); toast.push(ok ? 'success' : 'error', t(ok ? 'common.copied' : 'common.copy_failed')); };
  const share = () => { const text = t('invite.share_text', { group: group.name, link }); if (navigator.share) navigator.share({ title: 'Khatafy', text }).catch(() => undefined); else copy(text); };

  return (
    <>
      <Link to={`/g/${gid}/members`} className="back">← {t('nav.members')}</Link>
      <h1>{t('member.invite')}</h1>
      <p className="muted">{t('invite.approval_note')}</p>
      {!archived && (
        <Card title={t('invite.new')}>
          <div className="grid grid-2">
            <Select label={t('invite.expires')} value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="1">{t('invite.days', { n: 1 })}</option><option value="7">{t('invite.days', { n: 7 })}</option><option value="30">{t('invite.days', { n: 30 })}</option><option value="">{t('invite.never')}</option>
            </Select>
            <Field label={t('invite.max_uses')} inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))} placeholder={t('invite.unlimited')} />
          </div>
          <Button loading={busy} onClick={create}>{t('invite.create')}</Button>
        </Card>
      )}
      {created && (
        <Modal title={t('invite.created')} onClose={() => setCreated(null)} footer={<Button onClick={() => setCreated(null)}>{t('common.done')}</Button>}>
          <p className="banner banner-warn small">{t('invite.show_once')}</p>
          <p className="muted small">{t('invite.code')}</p>
          <p className="code" data-testid="invite-code">{created}</p>
          <p className="muted small">{t('invite.link')}</p>
          <p className="code small" data-testid="invite-link">{link}</p>
          <div className="btn-row"><Button variant="secondary" onClick={() => copy(created)}>{t('invite.copy_code')}</Button><Button variant="secondary" onClick={() => copy(link)}>{t('invite.copy_link')}</Button><Button onClick={share}>{t('invite.share')}</Button></div>
        </Modal>
      )}
      <Card title={t('invite.existing')}>
        {q.error && <ErrorBox message={errorText(q.error)} onRetry={q.reload} />}
        {!q.data ? <Skeleton lines={2} /> : q.data.length === 0 ? <p className="muted">{t('invite.none')}</p> : (
          <ul className="list">{q.data.map((i) => (
            <li key={i.id} className="row">
              <span className="grow">{t('invite.by_x', { name: i.created_by_name })} <Badge tone={i.state === 'active' ? 'good' : 'neutral'}>{t(`invite.state.${i.state}`)}</Badge>
                <span className="muted small block">{date(i.created_at)} · {i.expires_at ? t('invite.until_x', { date: date(i.expires_at) }) : t('invite.never')} · {t('invite.used_x', { n: i.uses_count, max: i.max_uses ?? '∞' })}</span></span>
              {i.state === 'active' && <Button variant="ghost" onClick={() => revoke(i.id)}>{t('invite.revoke')}</Button>}
            </li>
          ))}</ul>
        )}
      </Card>
    </>
  );
}
