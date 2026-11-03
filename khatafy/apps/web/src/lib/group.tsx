import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { GroupDetail, Member } from '@khatafy/core';
import { api } from './supabase';
import { useQuery } from './data';
import { useAuth } from './auth';
import { useGroupRealtime } from './realtime';
import { useT } from './i18n';
import { ErrorBox, Skeleton } from '../components/ui';

interface GroupCtx {
  group: GroupDetail;
  members: Member[];
  activeMembers: Member[];
  me: string;
  isAdmin: boolean;
  archived: boolean;
  nameOf: (userId: string) => string;
  reload: () => void;
}
const Ctx = createContext<GroupCtx | null>(null);

export function GroupProvider({ groupId, children }: { groupId: string; children: ReactNode }) {
  const { session, expireSession } = useAuth();
  const { errorText, t } = useT();
  const g = useQuery(`g:${groupId}:detail`, () => api.getGroup(groupId), { onSessionExpired: expireSession });
  const m = useQuery(`g:${groupId}:members`, () => api.listMembers(groupId), { onSessionExpired: expireSession });
  useGroupRealtime(groupId);

  const value = useMemo<GroupCtx | null>(() => {
    if (!g.data || !m.data || !session) return null;
    const members = m.data;
    const names = new Map(members.map((x) => [x.user_id, x.is_deleted ? t('common.deleted_user') : x.full_name]));
    return {
      group: g.data, members, activeMembers: members.filter((x) => x.status === 'active'),
      me: session.user.id,
      isAdmin: g.data.my_role === 'admin',
      archived: g.data.status === 'archived',
      nameOf: (id) => names.get(id) ?? '?',
      reload: () => { g.reload(); m.reload(); },
    };
  }, [g.data, m.data, session, t, g.reload, m.reload]);

  if (g.error && !g.data) return <div className="page"><ErrorBox message={errorText(g.error)} onRetry={g.reload} /></div>;
  if (m.error && !m.data) return <div className="page"><ErrorBox message={errorText(m.error)} onRetry={m.reload} /></div>;
  if (!value) return <div className="page"><Skeleton lines={5} /></div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGroup(): GroupCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('GroupProvider missing');
  return c;
}
