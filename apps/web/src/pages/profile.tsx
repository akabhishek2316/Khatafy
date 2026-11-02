import { useEffect, useRef, useState } from 'react';
import { notificationText, passwordProblem, type Lang } from '@khatafy/core';
import { api, SUPPORT_EMAIL } from '../lib/supabase';
import { clearCache, invalidate, useQuery } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { Link, navigate } from '../lib/router';
import { useTheme, type ThemePref } from '../lib/theme';
import { downloadText, uploadAvatar } from '../lib/files';
import { Avatar, Button, ExitIcon, Card, ConfirmModal, Empty, ErrorBox, Field, Select, Skeleton } from '../components/ui';

export type ProfileSection = 'details' | 'prefs' | 'password' | 'privacy' | 'account';

export function ProfilePage({ section = 'details' }: { section?: ProfileSection }) {
  const { t, errorText, lang, setLang } = useT();
  const toast = useToast();
  const { session, profile, refreshProfile, changePassword, signOut } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pwCur, setPwCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [delText, setDelText] = useState('');
  const [exporting, setExporting] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const theme = useTheme();
  useEffect(() => { if (profile) { setName(profile.full_name); setPhone(profile.phone ?? ''); } }, [profile]);
  if (!profile || !session) return <Skeleton lines={4} />;

  const save = async (patch: { avatarUrl?: string | null; language?: Lang } = {}) => {
    setErr(null);
    if (name.trim().length < 2) return setErr(t('err.NAME_REQUIRED'));
    setBusy(true);
    try {
      await api.updateMyProfile({ fullName: name.trim(), phone: phone.trim() || null, avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : profile.avatar_url, language: patch.language ?? profile.preferred_language });
      await refreshProfile(); invalidate(''); toast.push('success', t('common.saved'));
    } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  };
  const pickAvatar = async (f: File | undefined) => {
    if (!f) return;
    try { const url = await uploadAvatar(session.user.id, f); await save({ avatarUrl: url }); }
    catch (x) { toast.push('error', errorText(x instanceof Error && !('code' in x) ? { code: x.message } : x)); }
  };
  const changeLang = async (l: Lang) => { setLang(l); try { await api.updateMyProfile({ fullName: profile.full_name, phone: profile.phone, avatarUrl: profile.avatar_url, language: l }); await refreshProfile(); } catch { /* local choice still applies */ } };
  const changePw = async () => {
    setPwErr(null);
    const p = passwordProblem(pw);
    if (p) return setPwErr(t(`err.${p}`));
    if (!pwCur) return setPwErr(t('err.CURRENT_PASSWORD_WRONG'));
    if (pw !== pw2) return setPwErr(t('err.PASSWORD_MISMATCH'));
    if (pw === pwCur) return setPwErr(t('err.PASSWORD_SAME'));
    setPwBusy(true);
    try { await changePassword(pwCur, pw); setPwCur(''); setPw(''); setPw2(''); toast.push('success', t('profile.password_changed')); } catch (x) { setPwErr(errorText(x)); } finally { setPwBusy(false); }
  };
  const exportData = async () => {
    setExporting(true);
    try { const d = await api.exportMyData(); downloadText('khatafy-my-data.json', JSON.stringify(d, null, 2), 'application/json'); } catch (x) { toast.push('error', errorText(x)); } finally { setExporting(false); }
  };
  const deleteAccount = async () => {
    setBusy(true);
    try { await api.deleteMyAccount(); clearCache(); await signOut(); navigate('/login'); }
    catch (x) { toast.push('error', errorText(x)); setDel(false); } finally { setBusy(false); }
  };

  const sections: Array<[ProfileSection, string, string]> = [['details', '/profile', 'menu.profile'], ['prefs', '/profile/preferences', 'menu.prefs'], ['password', '/profile/password', 'menu.password'], ['privacy', '/profile/privacy', 'menu.privacy'], ['account', '/profile/account', 'menu.account']];
  return (
    <>
      <h1>{t('nav.profile')}</h1>
      <nav className="subnav" aria-label={t('nav.profile')}>{sections.map(([k, to, l]) => <Link key={k} to={to} className={section === k ? 'on' : ''} aria-current={section === k ? 'page' : undefined}>{t(l)}</Link>)}</nav>
      {section === 'details' && (
        <Card title={t('profile.details')}>
          <div className="row"><Avatar name={profile.full_name} url={profile.avatar_url} size={64} /><div><Button variant="secondary" onClick={() => file.current?.click()}>{t('profile.change_photo')}</Button><input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pickAvatar(e.target.files?.[0]); e.target.value = ''; }} /></div></div>
          <Field label={t('auth.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
          <Field label={t('auth.email')} value={session.user.email ?? ''} readOnly disabled />
          <Field label={t('profile.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} hint={t('profile.phone_hint')} />
          {err && <p className="field-error" role="alert">{err}</p>}
          <Button loading={busy} onClick={() => save()}>{t('common.save')}</Button>
        </Card>
      )}
      {section === 'prefs' && (
        <>
          <Card title={t('profile.language')}>
            <Select label={t('profile.language')} value={lang} onChange={(e) => changeLang(e.target.value as Lang)}><option value="en">English</option><option value="hi">हिन्दी</option></Select>
          </Card>
          <Card title={t('theme.label')}>
            <Select label={t('theme.label')} value={theme.pref} onChange={(e) => theme.set(e.target.value as ThemePref)}>
              <option value="light">{t('theme.light')}</option><option value="dark">{t('theme.dark')}</option><option value="system">{t('theme.system')}</option>
            </Select>
          </Card>
        </>
      )}
      {section === 'password' && (
        <Card title={t('profile.change_password')}>
          <Field label={t('auth.current_password')} type="password" autoComplete="current-password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} />
          <Field label={t('auth.new_password')} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Field label={t('auth.confirm_password')} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={pwErr} />
          <Button loading={pwBusy} onClick={changePw}>{t('profile.change_password')}</Button>
        </Card>
      )}
      {section === 'privacy' && (
        <Card title={t('profile.privacy')}>
          <p className="muted small">{t('profile.export_text')}</p>
          <Button variant="secondary" loading={exporting} onClick={exportData}>{t('profile.export')}</Button>
          <p className="small"><Link to="/privacy">{t('legal.privacy')}</Link> · <Link to="/terms">{t('legal.terms')}</Link>{SUPPORT_EMAIL && <> · <a href={`mailto:${SUPPORT_EMAIL}`}>{t('legal.contact')}</a></>}</p>
        </Card>
      )}
      {section === 'account' && (
        <>
          <Card title={t('profile.session')}><button type="button" className="logout-btn" onClick={() => signOut()}><ExitIcon />{t('auth.logout')}</button></Card>
          <Card title={t('settings.danger')}>
            <p className="muted small">{t('profile.delete_text')}</p>
            <Button variant="danger" onClick={() => { setDel(true); setDelText(''); }}>{t('profile.delete')}</Button>
          </Card>
        </>
      )}
      {del && (
        <ConfirmModal title={t('profile.delete')} text={t('profile.delete_confirm')} confirmLabel={t('profile.delete')} danger busy={busy} disabled={delText.trim().toUpperCase() !== 'DELETE'} onClose={() => setDel(false)} onConfirm={deleteAccount}>
          <Field label={t('profile.type_delete')} value={delText} onChange={(e) => setDelText(e.target.value)} autoComplete="off" />
        </ConfirmModal>
      )}
    </>
  );
}

function notifIcon(type: string): string {
  if (/payment|settle/.test(type)) return '💸';
  if (/expense/.test(type)) return '🧾';
  if (/join|member|invit/.test(type)) return '🙋';
  if (/admin/.test(type)) return '🛡️';
  if (/notice/.test(type)) return '📌';
  if (/shopping/.test(type)) return '🛒';
  return '🔔';
}

export function NotificationsPage() {
  const { t, date, errorText } = useT();
  const { expireSession } = useAuth();
  const q = useQuery('notifs:page', () => api.listNotifications(), { onSessionExpired: expireSession });
  const [extra, setExtra] = useState<NonNullable<typeof q.data>['items']>([]);
  const [next, setNext] = useState<number | null | undefined>(undefined);
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [delAll, setDelAll] = useState(false);
  const toast = useToast();
  const items = [...(q.data?.items ?? []), ...extra].filter((n) => !gone.has(n.id));
  const cursor = next === undefined ? (q.data?.next_before_id ?? null) : next;
  const markAll = async () => { try { await api.markNotificationsRead(null); invalidate('notifs'); setExtra([]); setNext(undefined); } catch { /* ignore */ } };
  const open = async (id: number, read: boolean, path: string | null) => {
    if (!read) { try { await api.markNotificationsRead([id]); invalidate('notifs'); } catch { /* ignore */ } }
    if (path) navigate(path);
  };
  const remove = async (id: number) => {
    setGone((g) => new Set(g).add(id));
    try { await api.deleteNotifications([id]); invalidate('notifs'); } catch (x) { setGone((g) => { const c = new Set(g); c.delete(id); return c; }); toast.push('error', errorText(x)); }
  };
  const removeAll = async () => {
    try { await api.deleteNotifications(null); invalidate('notifs'); setExtra([]); setNext(undefined); setGone(new Set()); setDelAll(false); toast.push('success', t('notif.deleted')); }
    catch (x) { setDelAll(false); toast.push('error', errorText(x)); }
  };
  const more = async () => { if (cursor === null) return; const p = await api.listNotifications(cursor); setExtra((e) => [...e, ...p.items]); setNext(p.next_before_id); };
  return (
    <>
      <div className="page-head"><h1>{t('notif.title')}</h1><div className="btn-row">{(q.data?.unread_count ?? 0) > 0 && <Button variant="secondary" onClick={markAll}>{t('notif.mark_all')}</Button>}{items.length > 0 && <Button variant="ghost" onClick={() => setDelAll(true)}>🗑 {t('notif.delete_all')}</Button>}</div></div>
      {q.error && <ErrorBox message={errorText(q.error)} onRetry={q.reload} />}
      {!q.data ? <Skeleton lines={4} /> : items.length === 0 ? <Empty icon="🔔" title={t('notif.empty')} /> : (
        <Card>
          <ul className="notif-list">{items.map((n) => {
            const { text, path } = notificationText(n, t);
            const unread = !n.read_at;
            return (
              <li key={n.id} className="notif-li">
                <button type="button" className={`notif-item${unread ? ' unread' : ''}`} onClick={() => open(n.id, !!n.read_at, path)}>
                  <span className="notif-ico" aria-hidden="true">{notifIcon(n.type)}</span>
                  <span className="notif-body"><span className="notif-text">{text}</span><span className="notif-time">{date(n.created_at, true)}</span></span>
                  {unread && <span className="dot" aria-label={t('notif.unread')} />}
                </button>
                <button type="button" className="notif-del" aria-label={t('notif.delete')} title={t('notif.delete')} onClick={() => remove(n.id)}>🗑</button>
              </li>
            );
          })}</ul>
          {cursor !== null && <Button variant="secondary" className="btn-block notif-more" onClick={more}>{t('common.load_more')}</Button>}
        </Card>
      )}
      {delAll && <ConfirmModal title={t('notif.delete_all')} text={t('notif.delete_all_confirm')} confirmLabel={t('common.delete')} danger onClose={() => setDelAll(false)} onConfirm={removeAll} />}
    </>
  );
}
