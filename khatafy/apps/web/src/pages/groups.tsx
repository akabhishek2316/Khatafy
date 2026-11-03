import { useEffect, useState, type FormEvent } from 'react';
import { extractInviteCode } from '@khatafy/core';
import { api } from '../lib/supabase';
import { useQuery, invalidate } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { Link, navigate, useLocation } from '../lib/router';
import { Badge, Button, Card, Empty, ErrorBox, Field, Skeleton, TextArea } from '../components/ui';

export function GroupsPage() {
  const { t, errorText } = useT();
  const toast = useToast();
  const { expireSession, profile } = useAuth();
  const groups = useQuery('groups', () => api.listMyGroups(), { onSessionExpired: expireSession });
  const reqs = useQuery('myrequests', () => api.listMyJoinRequests(), { onSessionExpired: expireSession });
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [codeIn, setCodeIn] = useState('');
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setErr(t('err.INVALID_GROUP_NAME'));
    setBusy(true); setErr(null);
    try {
      const id = await api.createGroup(name.trim(), desc.trim() || null);
      invalidate('groups');
      toast.push('success', t('groups.created'));
      navigate(`/g/${id}`);
    } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  const join = async (e: FormEvent) => {
    e.preventDefault();
    const code = extractInviteCode(codeIn);
    if (!code) return setJoinErr(t(codeIn.trim() ? 'err.INVITATION_INVALID' : 'err.CODE_REQUIRED'));
    setJoinBusy(true); setJoinErr(null);
    try {
      await api.requestToJoin(code);
      setCodeIn('');
      invalidate('myrequests');
      toast.push('success', t('join.sent'));
    } catch (x) { setJoinErr(errorText(x)); } finally { setJoinBusy(false); }
  };

  const active = (groups.data ?? []).filter((g) => g.status === 'active');
  const archived = (groups.data ?? []).filter((g) => g.status === 'archived');
  const pending = (reqs.data ?? []).filter((r) => r.status === 'pending');
  const decided = (reqs.data ?? []).filter((r) => r.status !== 'pending').slice(0, 3);
  const first = groups.data && groups.data.length === 0 && pending.length === 0;

  return (
    <>
      <h1>{first ? t('groups.welcome', { name: profile?.full_name.split(' ')[0] ?? '' }) : t('groups.title')}</h1>
      {first && <p className="muted">{t('groups.welcome_sub')}</p>}
      {groups.error && <ErrorBox message={errorText(groups.error)} onRetry={groups.reload} />}
      {groups.loading && !groups.data && <Skeleton lines={3} />}

      {active.length > 0 && (
        <div className="grid grid-2">
          {active.map((g) => (
            <Link key={g.id} to={`/g/${g.id}`} className="card group-card">
              <h3>{g.name}</h3>
              {g.description && <p className="muted clamp">{g.description}</p>}
              <p className="muted small">{t('groups.members_n', { n: g.member_count })} · <Badge tone={g.role === 'member' ? 'neutral' : 'info'}>{t(`role.${g.role}`)}</Badge></p>
            </Link>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <Card title={t('join.my_requests')}>
          <ul className="list">
            {pending.map((r) => (
              <li key={r.id} className="row">
                <span><strong>{r.group_name}</strong> <Badge tone="warn">{t('join.waiting')}</Badge></span>
                <Button variant="ghost" onClick={async () => { try { await api.cancelJoinRequest(r.id); invalidate('myrequests'); } catch (x) { toast.push('error', errorText(x)); } }}>{t('common.cancel')}</Button>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('join.waiting_hint')}</p>
        </Card>
      )}
      {decided.some((r) => r.status === 'rejected') && <p className="muted small">{t('join.rejected_note')}</p>}

      <div className="grid grid-2">
        <Card title={t('groups.create')}>
          <form onSubmit={create} noValidate>
            <Field label={t('groups.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('groups.name_ph')} />
            <TextArea label={t('groups.desc')} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} rows={2} />
            {err && <p className="field-error" role="alert">{err}</p>}
            <Button type="submit" loading={busy}>{t('groups.create_btn')}</Button>
          </form>
        </Card>
        <Card title={t('groups.join')}>
          <form onSubmit={join} noValidate>
            <Field label={t('groups.join_code')} value={codeIn} onChange={(e) => setCodeIn(e.target.value)} placeholder="https://…/join?code=…" hint={t('groups.join_hint')} error={joinErr} />
            <Button type="submit" variant="secondary" loading={joinBusy}>{t('groups.join_btn')}</Button>
          </form>
        </Card>
      </div>

      {archived.length > 0 && (
        <Card title={t('groups.archived')}>
          <ul className="list">{archived.map((g) => <li key={g.id}><Link to={`/g/${g.id}`}>{g.name}</Link></li>)}</ul>
        </Card>
      )}
      {groups.data && groups.data.length === 0 && pending.length === 0 && <Empty icon="🏠" title={t('groups.none')} hint={t('groups.none_hint')} />}
    </>
  );
}

/** /join?code=XXXX or /join/XXXX : lets an invited person send a join request. */
export function JoinPage() {
  const { t, errorText } = useT();
  const auth = useAuth();
  const loc = useLocation();
  const code = extractInviteCode(window.location.href) ?? extractInviteCode(loc.search.get('code') ?? '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (auth.status === 'out') { sessionStorage.setItem('kh.next', `/join?code=${code ?? ''}`); navigate('/login', { replace: true }); }
  }, [auth.status, code]);
  if (auth.status !== 'in') return null;

  const send = async () => {
    if (!code) return;
    setBusy(true); setErr(null);
    try { await api.requestToJoin(code, msg.trim() || null); invalidate('myrequests'); setDone(true); }
    catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  return (
    <>
      <h1>{t('join.title')}</h1>
      {!code ? <ErrorBox message={t('err.INVITATION_INVALID')} /> : done ? (
        <Card><div className="banner banner-info" role="status" data-testid="join-sent">{t('join.sent')}</div><p className="muted">{t('join.waiting_hint')}</p><Link to="/groups" className="btn btn-primary">{t('join.go_groups')}</Link></Card>
      ) : (
        <Card>
          <p>{t('join.explain')}</p>
          <TextArea label={t('join.message')} value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} maxLength={300} hint={t('join.message_hint')} />
          {err && <p className="field-error" role="alert">{err}</p>}
          <Button loading={busy} onClick={send}>{t('join.send')}</Button>
        </Card>
      )}
    </>
  );
}
