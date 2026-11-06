-- 0021: one call for Home / Close & history: the open (current) period so far + the last closed period.
begin;

create or replace function public.get_period_overview(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_last record;
begin
  perform public.kh_require_role(p_group_id, 'member');
  select c.id, c.period_end, c.cut_at, c.closed_at, c.summary, p.full_name as closed_by
    into v_last
    from public.period_closes c join public.profiles p on p.id = c.requested_by
    where c.group_id = p_group_id and c.status = 'closed'
    order by c.cut_at desc limit 1;
  return jsonb_build_object(
    'since', v_last.cut_at,
    'current', public.kh_close_summary(p_group_id, now() + interval '1 second'),
    'last', case when v_last.id is null then null else jsonb_build_object(
      'id', v_last.id, 'period_end', v_last.period_end, 'closed_at', v_last.closed_at,
      'closed_by_name', v_last.closed_by, 'summary', v_last.summary) end);
end $$;

revoke all on function public.get_period_overview(uuid) from public, anon;
grant execute on function public.get_period_overview(uuid) to authenticated;

commit;
