import { useEffect, type ReactNode } from 'react';
import { I18nProvider, useT } from './lib/i18n';
import { ToastProvider } from './lib/toast';
import { AuthProvider, useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import { Link, matchRoute, navigate, useLocation } from './lib/router';
import { useGroup } from './lib/group';
import { GroupShell, PlainShell } from './components/shell';
import { ExitIcon, Spinner } from './components/ui';
import { CallbackPage, ForgotPage, LoginPage, RegisterPage, ResetPage, SetupRequired } from './pages/auth';
import { GroupsPage, JoinPage } from './pages/groups';
import { DashboardPage } from './pages/dashboard';
import { DiaryPage, ExpenseDetailPage } from './pages/diary';
import { ExpenseFormPage } from './pages/expenseForm';
import { BalancesPage, SettlementsPage } from './pages/money';
import { InvitationsPage, MemberLedgerPage, MembersPage, RequestsPage } from './pages/members';
import { ReportsPage } from './pages/reports';
import { StatementPage } from './pages/statement';
import { ActivityPage, NoticesPage, ShoppingPage } from './pages/utilities';
import { SettingsPage } from './pages/settings';
import { NotificationsPage, ProfilePage } from './pages/profile';
import { HelpPage } from './pages/help';
import { AdminPage } from './pages/admin';
import { WelcomePage, hasSeenWelcome } from './pages/welcome';
import { api } from './lib/supabase';
import { useQuery } from './lib/data';
import { PrivacyPage, TermsPage } from './pages/legal';
import { startDraftSync } from './lib/drafts';

const PUBLIC_ONLY = ['/login', '/register', '/forgot-password'];
const ANYONE = ['/privacy', '/terms', '/auth/callback', '/reset-password', '/welcome'];

function GroupRoutes({ id, rest }: { id: string; rest: string }) {
  const p = `/${rest}`;
  let m: Record<string, string> | null;
  let page: ReactNode;
  if (p === '/') page = <DashboardPage />;
  else if (p === '/diary') page = <DiaryPage />;
  else if (p === '/expense/new') page = <ExpenseFormPage />;
  else if ((m = matchRoute('/expense/:eid/edit', p))) page = <ExpenseFormPage expenseId={m.eid} />;
  else if ((m = matchRoute('/expense/:eid', p))) page = <ExpenseDetailPage expenseId={m.eid!} />;
  else if (p === '/balances') page = <BalancesPage />;
  else if (p === '/settlements') page = <SettlementsPage />;
  else if (p === '/members') page = <MembersPage />;
  else if ((m = matchRoute('/members/:uid', p))) page = <MemberLedgerPage userId={m.uid!} />;
  else if (p === '/requests') page = <RequestsPage />;
  else if (p === '/invitations') page = <InvitationsPage />;
  else if (p === '/reports') page = <ReportsPage />;
  else if (p === '/statement') page = <StatementPage />;
  else if (p === '/shopping') page = <ShoppingPage />;
  else if (p === '/notices') page = <NoticesPage />;
  else if (p === '/activity') page = <ActivityPage />;
  else if (p === '/settings') page = <SettingsPage />;
  else if (p === '/more') page = <MorePage id={id} />;
  else page = <NotFound />;
  return <GroupShell groupId={id} key={id}>{page}</GroupShell>;
}

function MorePage({ id }: { id: string }) {
  const { t } = useT();
  const { signOut } = useAuth();
  const { isAdmin, group } = useGroup();
  const g = (p: string) => `/g/${id}/${p}`;
  const items: Array<[string, string, string]> = [
    [g('settlements'), '💸', t('nav.settlements')], [g('reports'), '📊', t('nav.reports')], [g('statement'), '🧾', t('nav.statement')], [g('shopping'), '🛒', t('nav.shopping')], [g('notices'), '📌', t('nav.notices')], [g('activity'), '🕘', t('nav.activity')],
    ...(isAdmin ? ([[g('requests'), '🙋', `${t('nav.requests')}${group.pending_requests ? ` (${group.pending_requests})` : ''}`], [g('invitations'), '🔗', t('nav.invitations')]] as Array<[string, string, string]>) : []),
    [g('settings'), '⚙️', t('nav.settings')], ['/profile', '👤', t('nav.profile')], ['/help', '❓', t('menu.help')],
  ];
  return (
    <>
      <h1>{t('dash.more')}</h1>
      <div className="card"><ul className="list">
        {items.map(([to, ico, label]) => <li key={to}><Link to={to} className="row"><span className="cat-ico" aria-hidden="true">{ico}</span><span className="grow">{label}</span><span aria-hidden="true">›</span></Link></li>)}
        <li><button type="button" className="row row-btn row-danger" onClick={() => signOut()}><span className="cat-ico" aria-hidden="true"><ExitIcon /></span><span className="grow">{t('menu.logout')}</span></button></li>
      </ul></div>
    </>
  );
}

function NotFound() {
  const { t } = useT();
  return <div className="empty"><h1>404</h1><p>{t('common.not_found')}</p><a href="/groups" onClick={(e) => { e.preventDefault(); navigate('/groups'); }}>{t('common.go_home')}</a></div>;
}

function Router() {
  const { path } = useLocation();
  const { status } = useAuth();
  const { t } = useT();
  const isPublicOnly = PUBLIC_ONLY.includes(path);
  const isAnyone = ANYONE.includes(path);

  useEffect(() => {
    if (status === 'out' && !hasSeenWelcome() && (path === '/' || path === '/login')) { navigate('/welcome', { replace: true }); return; }
    if (status === 'out' && !isPublicOnly && !isAnyone && path !== '/join') {
      if (path !== '/' && path !== '/groups') { try { sessionStorage.setItem('kh.next', path); } catch { /* ignore */ } }
      navigate('/login', { replace: true });
    }
    if (status === 'in' && (isPublicOnly || path === '/')) navigate('/groups', { replace: true });
  }, [status, path, isPublicOnly, isAnyone]);

  if (path === '/welcome') return <WelcomePage />;
  if (path === '/privacy') return <PrivacyPage />;
  if (path === '/terms') return <TermsPage />;
  if (path === '/auth/callback') return <CallbackPage />;
  if (path === '/reset-password') return <ResetPage />;
  if (status === 'loading') return <div className="center-screen"><Spinner label={t('common.loading')} /></div>;
  if (status === 'out') {
    if (path === '/register') return <RegisterPage />;
    if (path === '/forgot-password') return <ForgotPage />;
    if (path === '/join') return <JoinPage />;
    return <LoginPage />;
  }
  if (isPublicOnly || path === '/') return null;

  if (path === '/groups') return <PlainShell><GroupsPage /></PlainShell>;
  if (path === '/join') return <PlainShell><JoinPage /></PlainShell>;
  const prof = ({ '/profile': 'details', '/profile/preferences': 'prefs', '/profile/password': 'password', '/profile/privacy': 'privacy', '/profile/account': 'account' } as const)[path as '/profile'];
  if (prof) return <PlainShell><ProfilePage section={prof} /></PlainShell>;
  if (path === '/help') return <PlainShell><HelpPage /></PlainShell>;
  if (path === '/admin') return <PlainShell><AdminPage /></PlainShell>;
  if (path === '/notifications') return <PlainShell><NotificationsPage /></PlainShell>;
  const g = /^\/g\/([0-9a-fA-F-]{36})(?:\/(.*))?$/.exec(path);
  if (g) return <GroupRoutes id={g[1]!} rest={(g[2] ?? '').replace(/\/$/, '')} />;
  return <PlainShell><NotFound /></PlainShell>;
}

function Boot() {
  const { status } = useAuth();
  useEffect(() => (status === 'in' ? startDraftSync() : undefined), [status]);
  return <><AppBanner /><Router /></>;
}

function AppBanner() {
  const { t } = useT();
  const q = useQuery('app:status', () => api.getAppStatus());
  const s = q.data;
  if (!s || (!s.maintenance && !s.announcement)) return null;
  return <div className="banner banner-warn app-banner" role="status">{s.maintenance ? `🛠 ${t('admin.banner_maint')} ` : ''}{s.announcement}</div>;
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        {!isConfigured ? <SetupRequired /> : <AuthProvider><Boot /></AuthProvider>}
      </ToastProvider>
    </I18nProvider>
  );
}
