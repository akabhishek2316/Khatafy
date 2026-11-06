-- Khatafy migration 0010: the person who created a group (its first admin) can also demote / remove
-- other admins. Other admins still cannot demote or remove each other, and nobody can remove or demote
-- the creator (the creator can only step down himself/herself while another admin remains).
-- There is still no "owner" role: this is only a rule about the group's creator.
begin;

create or replace function public.get_group(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.kh_require_role(p_group_id, 'member');
  v_role text;
begin
  select gm.role into v_role from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = v_uid and gm.status = 'active';

  return (
    select jsonb_build_object(
      'id', g.id, 'name', g.name, 'description', g.description, 'status', g.status,
      'currency_code', g.currency_code, 'timezone', g.timezone, 'created_at', g.created_at,
      'created_by', g.created_by,
      'my_role', v_role,
      'member_count', (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'active'),
      'pending_requests', case when v_role = 'admin'
        then (select count(*) from public.join_requests jr where jr.group_id = g.id and jr.status = 'pending') else 0 end
    )
    from public.groups g where g.id = p_group_id
  );
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
  v_target_role text;
  v_creator uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if v_actor_id = p_user_id then
    raise exception 'Use leave_group to leave voluntarily';
  end if;
  select gm.role into v_actor_role from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = v_actor_id and gm.status = 'active';
  if v_actor_role is distinct from 'admin' then
    raise exception 'Only group admins can remove members' using errcode = '42501';
  end if;
  select g.created_by into v_creator from public.groups g where g.id = p_group_id;
  select gm.role into v_target_role from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = p_user_id and gm.status = 'active'
  for update;
  if v_target_role is null then
    raise exception 'Active target membership not found';
  end if;
  -- the creator can never be removed; other admins only by the creator
  if p_user_id = v_creator or (v_target_role = 'admin' and v_actor_id is distinct from v_creator) then
    raise exception 'ADMIN_CANNOT_BE_REMOVED';
  end if;
  update public.group_members set status = 'removed', left_at = now()
  where group_id = p_group_id and user_id = p_user_id and status = 'active';
end;
$$;

create or replace function public.set_group_member_role(p_group_id uuid, p_user_id uuid, p_new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_target_role text;
  v_creator uuid;
  v_group_name text;
  v_actor_name text;
begin
  v_actor := public.kh_require_role(p_group_id, 'admin');
  perform public.kh_require_active_group(p_group_id);
  if p_new_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member';
  end if;
  select g.created_by into v_creator from public.groups g where g.id = p_group_id;
  select gm.role into v_target_role from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = p_user_id and gm.status = 'active'
  for update;
  if v_target_role is null then
    raise exception 'Active target membership not found';
  end if;
  if v_target_role = p_new_role then
    return;
  end if;
  if p_new_role = 'member' then
    -- the creator may demote any other admin; everyone may step down themselves
    if p_user_id <> v_actor and v_actor is distinct from v_creator then
      raise exception 'ADMIN_CANNOT_BE_DEMOTED';
    end if;
    if not exists (
      select 1 from public.group_members o
      where o.group_id = p_group_id and o.status = 'active' and o.role = 'admin' and o.user_id <> p_user_id
    ) then
      raise exception 'LAST_ADMIN';
    end if;
  end if;
  update public.group_members set role = p_new_role
  where group_id = p_group_id and user_id = p_user_id and status = 'active';
  if p_new_role = 'admin' then
    select g.name into v_group_name from public.groups g where g.id = p_group_id;
    select p.full_name into v_actor_name from public.profiles p where p.id = v_actor;
    perform public.kh_notify(p_user_id, p_group_id, 'admin_granted',
      jsonb_build_object('group_name', v_group_name, 'name', v_actor_name), null);
  end if;
end;
$$;

revoke all on function public.get_group(uuid) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.set_group_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.get_group(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.set_group_member_role(uuid, uuid, text) to authenticated;

commit;
