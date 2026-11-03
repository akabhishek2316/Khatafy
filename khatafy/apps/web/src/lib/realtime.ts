import { useEffect } from 'react';
import { invalidate } from './data';
import { isConfigured, supabase } from './supabase';

const GROUP_TABLES = ['expenses', 'payments', 'group_members', 'join_requests', 'shopping_list_items', 'group_notices'];

/** Live updates: any change in the group's tables (that RLS lets this user see) refreshes the screens. */
export function useGroupRealtime(groupId: string | null) {
  useEffect(() => {
    if (!isConfigured || !groupId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => invalidate(`g:${groupId}`), 250); };
    const ch = supabase.channel(`group-${groupId}`);
    for (const table of GROUP_TABLES) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${groupId}` }, bump);
    }
    ch.subscribe();
    const onFocus = () => invalidate(`g:${groupId}`);
    window.addEventListener('focus', onFocus);
    return () => { clearTimeout(timer); window.removeEventListener('focus', onFocus); void supabase.removeChannel(ch); };
  }, [groupId]);
}

export function useNotificationRealtime(userId: string | null) {
  useEffect(() => {
    if (!isConfigured || !userId) return;
    const ch = supabase.channel(`notif-${userId}`);
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => invalidate('notifs'));
    ch.subscribe();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') invalidate('notifs'); }, 60000);
    return () => { clearInterval(iv); void supabase.removeChannel(ch); };
  }, [userId]);
}
