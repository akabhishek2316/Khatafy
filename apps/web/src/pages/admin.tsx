import { useEffect, useState } from 'react';
import { api } from '../lib/supabase';
import { invalidate, useQuery } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { Button, Card, ConfirmModal, ErrorBox, Field, Skeleton, TextArea, Badge, Empty } from '../components/ui';

type Tab = 'overview' | 'groups' | 'status' | 'audit';

export function AdminPage() {
  const { t, errorText, date } = useT();
  const { expireSession } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const ov = useQuery('admin:overview', () => api.adminOverview(), { onSessionExpired: expireSession });
  const denied = (ov.error as { code?: string } | undefined)?.code === 'NOT_PLATFORM_ADMIN';
  if (denied) return <Empty icon="🔒" title={t('admin.no_access')} />;
  return (
    <>
      <h1>🛡️ {t('admin.title')}</h1>
      <div className="banner banner-info" role="note">{t('admin.privacy_note')}</div>
      <div className="tabs" role="tablist">{(['overview', 'groups', 'status', 'audit'] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(`admin.tab_${k}`)}</button>)}</div>
      {ov.error && <ErrorBox message={errorText(ov.error)} onRetry={ov.reload} />}
      {tab === 'overview' && (!ov.data ? <Skeleton lines={4} /> : (
        <>
          <div className="grid grid-3">
            {([['users_total', 'admin.users'], ['users_7d', 'admin.users_7d'], ['users_30d', 'admin.users_30d'], ['groups_total', 'admin.groups'], ['groups_active', 'admin.groups_active'], ['groups_archived', 'admin.groups_archived'], ['expenses_30d', 'admin.expenses_30d'], ['payments_30d', 'admin.payments_30d']] as const).map(([k, l]) => (
              <Card key={k} className="stat" title={t(l)}><strong className="stat-num">{ov.data![k]}</strong></Card>
            ))}
          </div>
          <Card title={t('admin.signups')}>
            <div className="table-wrap"><table className="table"><tbody>{ov.data.signups_14d.map((d) => <tr key={d.day}><td>{date(`${d.day}T12:00:00Z`)}</td><td className="num"><strong>{d.signups}</strong></td></tr>)}</tbody></table></div>
          </Card>
        </>
      ))}
      {tab === 'groups' && <GroupsTab onDone={(m) => toast.push('success', m)} />}
      {tab === 'status' && <StatusTab />}
      {tab === 'audit' && <AuditTab />}
    </>
  );
}

function GroupsTab({ onDone }: { onDone: (m: string) => void }) {
  const { t, errorText, date } = useT();
  const toast = useToast();
  const q = useQuery('admin:groups', () => api.adminListGroups(0));
  const [target, setTarget] = useState<{ id: string; to: 'active' | 'archived' } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!target) return;
    setBusy(true);
    try { await api.adminSetGroupStatus(target.id, target.to, reason.trim()); setTarget(null); setReason(''); invalidate('admin:'); onDone(t('admin.saved')); }
    catch (x) { toast.push('error', errorText(x)); } finally { setBusy(false); }
  };
  if (q.error) return <ErrorBox message={errorText(q.error)} onRetry={q.reload} />;
  if (!q.data) return <Skeleton lines={4} />;
  return (
    <Card>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>{t('admin.group_id')}</th><th>{t('admin.members')}</th><th className="num">{t('admin.expenses_30d')}</th><th /></tr></thead>
        <tbody>{q.data.map((g) => (
          <tr key={g.id}>
            <td><code title={g.id}>{g.id.slice(0, 8)}</code> <span className="muted small">{date(g.created_at)}</span> {g.status === 'archived' && <Badge tone="warn">archived</Badge>}</td>
            <td>{g.members}</td><td className="num">{g.expenses_30d}</td>
            <td><Button variant="secondary" onClick={() => { setTarget({ id: g.id, to: g.status === 'active' ? 'archived' : 'active' }); setReason(''); }}>{g.status === 'active' ? t('admin.archive') : t('admin.restore')}</Button></td>
          </tr>
        ))}</tbody>
      </table></div>
      {target && (
        <ConfirmModal title={target.to === 'archived' ? t('admin.archive') : t('admin.restore')} confirmLabel={t('admin.save')} busy={busy} disabled={reason.trim().length < 10} onClose={() => setTarget(null)} onConfirm={go}>
          <TextArea label={t('admin.reason')} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </ConfirmModal>
      )}
    </Card>
  );
}

function StatusTab() {
  const { t, errorText } = useT();
  const toast = useToast();
  const q = useQuery('app:status', () => api.getAppStatus());
  const [maint, setMaint] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) { setMaint(q.data.maintenance); setText(q.data.announcement); } }, [q.data]);
  const save = async () => {
    setBusy(true);
    try { await api.adminSetAppStatus(maint, text); invalidate('app:status'); invalidate('admin:'); toast.push('success', t('admin.saved')); }
    catch (x) { toast.push('error', errorText(x)); } finally { setBusy(false); }
  };
  if (!q.data) return <Skeleton lines={3} />;
  return (
    <Card>
      <label className="check"><input type="checkbox" checked={maint} onChange={(e) => setMaint(e.target.checked)} /> {t('admin.maintenance')}</label>
      <TextArea label={t('admin.announcement')} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
      <Button loading={busy} onClick={save}>{t('admin.save')}</Button>
    </Card>
  );
}

function AuditTab() {
  const { t, errorText, date } = useT();
  const q = useQuery('admin:audit', () => api.adminListAudit());
  if (q.error) return <ErrorBox message={errorText(q.error)} onRetry={q.reload} />;
  if (!q.data) return <Skeleton lines={4} />;
  return (
    <Card>
      {q.data.length === 0 ? <p className="muted">—</p> : (
        <div className="table-wrap"><table className="table"><tbody>{q.data.map((r) => (
          <tr key={r.id}><td className="nowrap">{date(r.created_at, true)}</td><td><strong>{r.action}</strong>{r.target && <> <code>{r.target.slice(0, 8)}</code></>}<span className="muted small block">{r.reason}</span></td></tr>
        ))}</tbody></table></div>
      )}
    </Card>
  );
}
