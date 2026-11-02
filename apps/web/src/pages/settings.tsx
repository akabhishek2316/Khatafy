import { useEffect, useState } from 'react';
import { parseRupeesToPaise, paiseToPlain } from '@khatafy/core';
import { api } from '../lib/supabase';
import { invalidate, useQuery } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useGroup } from '../lib/group';
import { useToast } from '../lib/toast';
import { navigate } from '../lib/router';
import { catIcon } from '../lib/cats';
import { Button, Card, ConfirmModal, ErrorBox, Field, Select, Skeleton, TextArea } from '../components/ui';

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Kathmandu', 'Asia/Dhaka', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];

export function SettingsPage() {
  const { t, errorText, lang } = useT();
  const toast = useToast();
  const { expireSession } = useAuth();
  const { group, isAdmin, archived, reload } = useGroup();
  const gid = group.id;
  const [name, setName] = useState(group.name);
  const [desc, setDesc] = useState(group.description ?? '');
  const [tz, setTz] = useState(group.timezone);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'archive' | 'leave' | null>(null);
  useEffect(() => { setName(group.name); setDesc(group.description ?? ''); setTz(group.timezone); }, [group.name, group.description, group.timezone]);

  const cats = useQuery('categories', () => api.listCategories(), { onSessionExpired: expireSession });
  const budgets = useQuery(`g:${gid}:budgets`, () => api.listBudgets(gid), { onSessionExpired: expireSession });
  const [bud, setBud] = useState<Record<string, string>>({});
  const [budBusy, setBudBusy] = useState(false);
  const [budErr, setBudErr] = useState<string | null>(null);
  useEffect(() => {
    if (!budgets.data) return;
    const m: Record<string, string> = {};
    for (const b of budgets.data) m[b.category_key ?? ''] = paiseToPlain(b.amount_paise);
    setBud(m);
  }, [budgets.data]);

  const save = async () => {
    setErr(null);
    if (name.trim().length < 2) return setErr(t('err.NAME_REQUIRED'));
    setBusy(true);
    try { await api.updateGroup(gid, name.trim(), desc.trim() || null, tz); invalidate(`g:${gid}`); invalidate('groups'); reload(); toast.push('success', t('common.saved')); }
    catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  const saveBudgets = async () => {
    setBudErr(null); setBudBusy(true);
    try {
      const keys = ['', ...(cats.data ?? []).map((c) => c.key)];
      for (const k of keys) {
        const raw = (bud[k] ?? '').trim();
        const existing = budgets.data?.find((b) => (b.category_key ?? '') === k);
        const paise = raw === '' ? 0 : parseRupeesToPaise(raw);
        if (paise === null) throw new Error('INVALID_AMOUNT');
        if (paise === 0 && !existing) continue;
        if (existing && existing.amount_paise === paise) continue;
        await api.setBudget(gid, k || null, paise);
      }
      invalidate(`g:${gid}`); toast.push('success', t('common.saved'));
    } catch (x) { setBudErr(errorText(x)); } finally { setBudBusy(false); }
  };
  const archive = async () => {
    setBusy(true);
    try { await api.archiveGroup(gid); invalidate(''); toast.push('success', t('settings.archived')); setConfirm(null); reload(); }
    catch (x) { toast.push('error', errorText(x)); setConfirm(null); } finally { setBusy(false); }
  };
  const leave = async () => {
    setBusy(true);
    try { await api.leaveGroup(gid); invalidate(''); toast.push('success', t('settings.left')); navigate('/groups'); }
    catch (x) { toast.push('error', errorText(x)); setConfirm(null); } finally { setBusy(false); }
  };
  const zones = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];

  return (
    <>
      <h1>{t('nav.settings')}</h1>
      {isAdmin && !archived && (
        <Card title={t('settings.group')}>
          <Field label={t('groups.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <TextArea label={t('groups.description')} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} rows={2} />
          <Select label={t('settings.timezone')} value={tz} onChange={(e) => setTz(e.target.value)} hint={t('settings.timezone_hint')}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select>
          {err && <p className="field-error" role="alert">{err}</p>}
          <Button loading={busy} onClick={save}>{t('common.save')}</Button>
        </Card>
      )}
      {isAdmin && !archived && (
        <Card title={t('budget.title')}>
          <p className="muted small">{t('budget.hint')}</p>
          {!cats.data || !budgets.data ? <Skeleton lines={3} /> : (
            <div className="grid grid-2">
              <Field label={`${t('budget.overall')} (₹)`} inputMode="decimal" value={bud[''] ?? ''} onChange={(e) => setBud({ ...bud, '': e.target.value })} />
              {cats.data.map((c) => <Field key={c.key} label={`${catIcon(c.key)} ${lang === 'hi' ? c.name_hi : c.name_en} (₹)`} inputMode="decimal" value={bud[c.key] ?? ''} onChange={(e) => setBud({ ...bud, [c.key]: e.target.value })} />)}
            </div>
          )}
          {budErr && <p className="field-error" role="alert">{budErr}</p>}
          <Button loading={budBusy} onClick={saveBudgets}>{t('budget.save')}</Button>
        </Card>
      )}
      {!isAdmin && <Card><p className="muted">{t('settings.admin_only')}</p></Card>}
      <Card title={t('settings.danger')}>
        {<div className="row"><span className="grow">{t('settings.leave_text')}</span><Button variant="danger" onClick={() => setConfirm('leave')}>{t('settings.leave')}</Button></div>}
        {isAdmin && !archived && <div className="row"><span className="grow">{t('settings.archive_text')}</span><Button variant="danger" onClick={() => setConfirm('archive')}>{t('settings.archive')}</Button></div>}
        {isAdmin && <p className="muted small">{t('settings.admin_leave_note')}</p>}
      </Card>
      {confirm === 'archive' && <ConfirmModal title={t('settings.archive')} text={t('settings.archive_confirm')} confirmLabel={t('settings.archive')} danger busy={busy} onClose={() => setConfirm(null)} onConfirm={archive} />}
      {confirm === 'leave' && <ConfirmModal title={t('settings.leave')} text={t('settings.leave_confirm')} confirmLabel={t('settings.leave')} danger busy={busy} onClose={() => setConfirm(null)} onConfirm={leave} />}
      {budgets.error && <ErrorBox message={errorText(budgets.error)} onRetry={budgets.reload} />}
    </>
  );
}
