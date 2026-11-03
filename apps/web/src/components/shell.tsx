import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, navigate, useLocation } from '../lib/router';
import { useT } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { api } from '../lib/supabase';
import { useQuery } from '../lib/data';
import { useNotificationRealtime } from '../lib/realtime';
import { Avatar, ExitIcon, Logo } from './ui';
import { GroupProvider, useGroup } from '../lib/group';
import { DraftBanner } from './drafts';

function ProfileMenu() {
  const { t } = useT();
  const { profile, session, signOut } = useAuth();
  const { path } = useLocation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const adm = useQuery(session ? 'me:admin' : null, () => api.amIPlatformAdmin());
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', click); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key); };
  }, [open]);
  const items: Array<[string, string, string]> = [['👤', '/profile', 'menu.profile'], ['🌐', '/profile/preferences', 'menu.prefs'], ['🔑', '/profile/password', 'menu.password'], ['🔒', '/profile/privacy', 'menu.privacy'], ['❓', '/help', 'menu.help']];
  return (
    <div className="menu-wrap" ref={box}>
      <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label={t('menu.open')} onClick={() => setOpen((o) => !o)}><Avatar name={profile?.full_name ?? '?'} url={profile?.avatar_url} size={30} /></button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head"><strong>{profile?.full_name}</strong><span className="muted small">{session?.user.email}</span></div>
          {items.map(([ico, to, k]) => <Link key={to} to={to} role="menuitem" className="menu-item"><span className="mi-ico" aria-hidden="true">{ico}</span>{t(k)}</Link>)}
          {adm.data === true && <Link to="/admin" role="menuitem" className="menu-item"><span className="mi-ico" aria-hidden="true">🛡️</span>{t('menu.admin')}</Link>}
          <Link to="/profile/account" role="menuitem" className="menu-item"><span className="mi-ico" aria-hidden="true">🗑</span>{t('menu.account')}</Link>
          <button type="button" role="menuitem" className="menu-item menu-danger" onClick={async () => { setOpen(false); await signOut(); navigate('/login'); }}><ExitIcon />{t('menu.logout')}</button>
        </div>
      )}
    </div>
  );
}

function Bell() {
  const { t } = useT();
  const { session, expireSession } = useAuth();
  useNotificationRealtime(session?.user.id ?? null);
  const q = useQuery('notifs', () => api.listNotifications(), { onSessionExpired: expireSession });
  const n = q.data?.unread_count ?? 0;
  return (
    <Link to="/notifications" className="icon-btn" aria-label={n ? t('notif.bell_unread', { n }) : t('notif.title')}>
      <span className="mi-ico" aria-hidden="true">🔔</span>
      {n > 0 && <span className="dot">{n > 9 ? '9+' : n}</span>}
    </Link>
  );
}

function OfflineBar() {
  const { t } = useT();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online ? null : <div className="offline-bar" role="status">{t('common.offline')}</div>;
}

export function TopBar({ groupSwitcher }: { groupSwitcher?: ReactNode }) {
  const { t } = useT();
  return (
    <header className="topbar">
      <Link to="/groups" className="brand" aria-label="Khatafy"><Logo /><span className="brand-name">Khatafy</span></Link>
      {groupSwitcher}
      <div className="topbar-right">
        <Bell />
        <ProfileMenu />
      </div>
    </header>
  );
}

/** Frame for pages that are not inside a group (groups list, profile, notifications ...). */
export function PlainShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <TopBar />
      <OfflineBar />
      <main className="page" id="main">{children}</main>
    </div>
  );
}

function GroupSwitcher({ groupId }: { groupId: string }) {
  const { t } = useT();
  const { session, expireSession } = useAuth();
  const q = useQuery(session ? 'groups' : null, () => api.listMyGroups(), { onSessionExpired: expireSession });
  const groups = (q.data ?? []).filter((g) => g.status === 'active' || g.id === groupId);
  return (
    <div className="switcher">
      <label className="sr-only" htmlFor="group-switch">{t('nav.switch_group')}</label>
      <select id="group-switch" value={groupId} onChange={(e) => (e.target.value === '__all' ? navigate('/groups') : navigate(`/g/${e.target.value}`))}>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        {!groups.some((g) => g.id === groupId) && <option value={groupId}>…</option>}
        <option value="__all">{t('nav.all_groups')}</option>
      </select>
    </div>
  );
}

function NavItem({ to, icon, label, match }: { to: string; icon: string; label: string; match?: (p: string) => boolean }) {
  const { path } = useLocation();
  const on = match ? match(path) : path === to;
  return (
    <Link to={to} className={`nav-item ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
      <span className="nav-ico" aria-hidden="true">{icon}</span><span>{label}</span>
    </Link>
  );
}

function GroupFrame({ groupId, children }: { groupId: string; children: ReactNode }) {
  const { t } = useT();
  const { isAdmin, group, archived } = useGroup();
  const base = `/g/${groupId}`;
  const { path } = useLocation();
  const onForm = path.startsWith(`${base}/expense/`) && !/^\/g\/[^/]+\/expense\/[0-9a-f-]{36}$/.test(path);
  return (
    <div className="app has-side">
      <TopBar groupSwitcher={<GroupSwitcher groupId={groupId} />} />
      <OfflineBar />
      <div className="layout">
        <nav className="sidebar" aria-label={t('nav.main')}>
          <NavItem to={base} icon="🏠" label={t('nav.home')} />
          <NavItem to={`${base}/diary`} icon="📒" label={t('nav.diary')} match={(p) => p.startsWith(`${base}/diary`) || p.startsWith(`${base}/expense`)} />
          <NavItem to={`${base}/balances`} icon="⚖️" label={t('nav.balances')} />
          <NavItem to={`${base}/settlements`} icon="💸" label={t('nav.settlements')} />
          <NavItem to={`${base}/members`} icon="👥" label={t('nav.members')} match={(p) => p.startsWith(`${base}/members`)} />
          <NavItem to={`${base}/reports`} icon="📊" label={t('nav.reports')} />
          <NavItem to={`${base}/statement`} icon="🧾" label={t('nav.statement')} />
          <NavItem to={`${base}/shopping`} icon="🛒" label={t('nav.shopping')} />
          <NavItem to={`${base}/notices`} icon="📌" label={t('nav.notices')} />
          <NavItem to={`${base}/activity`} icon="🕘" label={t('nav.activity')} />
          {isAdmin && <NavItem to={`${base}/requests`} icon="🙋" label={`${t('nav.requests')}${group.pending_requests ? ` (${group.pending_requests})` : ''}`} />}
          {isAdmin && <NavItem to={`${base}/invitations`} icon="🔗" label={t('nav.invitations')} />}
          <NavItem to={`${base}/settings`} icon="⚙️" label={t('nav.settings')} />
        </nav>
        <main className="page" id="main">
          {archived && <div className="banner banner-warn" role="status">{t('group.archived_banner')}</div>}
          <DraftBanner groupId={groupId} />
          {children}
        </main>
      </div>
      <nav className="bottomnav" aria-label={t('nav.main')}>
        <NavItem to={base} icon="🏠" label={t('nav.home')} />
        <NavItem to={`${base}/diary`} icon="📒" label={t('nav.diary')} match={(p) => p.startsWith(`${base}/diary`) || p.startsWith(`${base}/expense`)} />
        <NavItem to={`${base}/members`} icon="👥" label={t('nav.members')} match={(p) => p.startsWith(`${base}/members`)} />
        <NavItem to={`${base}/balances`} icon="⚖️" label={t('nav.balances')} />
        <NavItem to={`${base}/more`} icon="☰" label={t('dash.more')} match={(p) => [`${base}/more`, `${base}/settlements`, `${base}/reports`, `${base}/statement`, `${base}/shopping`, `${base}/notices`, `${base}/activity`, `${base}/settings`, `${base}/requests`, `${base}/invitations`].includes(p)} />
      </nav>
      {!archived && !onForm && (
        <Link to={`${base}/expense/new`} className="fab" aria-label={t('expense.add')}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></Link>
      )}
    </div>
  );
}

export function GroupShell({ groupId, children }: { groupId: string; children: ReactNode }) {
  return <GroupProvider groupId={groupId}><GroupFrame groupId={groupId}>{children}</GroupFrame></GroupProvider>;
}
