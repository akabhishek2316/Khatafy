-- 0015: review window for "Close period" is now 3 days (was 7).
begin;

create or replace function public.request_period_close(p_group_id uuid, p_period_end date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.kh_require_role(p_group_id, 'admin'); g public.groups%rowtype; v_cut timestamptz; v_id uuid; v_name text; m record;
begin
  perform public.kh_require_active_group(p_group_id);
  perform public.kh_rate_limit('period_close', 10, 3600);
  select * into g from public.groups where id = p_group_id;
  if p_period_end is null or p_period_end > (now() at time zone g.timezone)::date then raise exception 'INVALID_CLOSE_DATE'; end if;
  v_cut := ((p_period_end + 1)::timestamp at time zone g.timezone);
  if exists (select 1 from public.period_closes c where c.group_id = p_group_id and c.status = 'closed' and c.cut_at >= v_cut) then raise exception 'INVALID_CLOSE_DATE'; end if;
  if exists (select 1 from public.period_closes c where c.group_id = p_group_id and c.status = 'pending') then raise exception 'CLOSE_ALREADY_PENDING'; end if;
  if not exists (select 1 from public.expenses e where e.group_id = p_group_id and e.status = 'active' and e.spent_at < v_cut) then raise exception 'NOTHING_TO_CLOSE'; end if;
  insert into public.period_closes (group_id, period_end, cut_at, requested_by, effective_at)
    values (p_group_id, p_period_end, v_cut, v_uid, now() + interval '3 days') returning id into v_id;
  perform public.kh_audit(p_group_id, 'period_close_requested', 'group', p_group_id::text, jsonb_build_object('period_end', p_period_end));
  select full_name into v_name from public.profiles where id = v_uid;
  for m in select gm.user_id from public.group_members gm where gm.group_id = p_group_id and gm.status = 'active' and gm.user_id <> v_uid loop
    perform public.kh_notify(m.user_id, p_group_id, 'close_requested', jsonb_build_object('name', v_name, 'period_end', p_period_end));
  end loop;
  return v_id;
end $$;

-- pending closes that were already requested follow the new, shorter window
update public.period_closes set effective_at = least(effective_at, requested_at + interval '3 days') where status = 'pending';

revoke all on function public.request_period_close(uuid, date) from public, anon;
grant execute on function public.request_period_close(uuid, date) to authenticated;

commit;
