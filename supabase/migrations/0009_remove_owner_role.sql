-- Khatafy migration 0009: the "owner" role is removed.
-- * Everyone who was an owner becomes an admin; the person who creates a group is its first admin.
-- * Any admin can promote a member to admin. An admin can step down (only while another admin remains).
-- * Admins cannot demote or remove each other. The last admin cannot leave / delete the account while
--   other members remain - promote someone first.
-- Safe to run once on an existing project (needs 0001-0008).
begin;

drop index if exists public.uq_group_one_active_owner;
update public.group_members set role = 'admin' where role = 'owner';
alter table public.group_members drop constraint if exists group_members_role_check;
alter table public.group_members add constraint group_members_role_check check (role in ('admin', 'member'));

-- the creator is the first admin
create or replace function public.create_group(p_name text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_group_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then
    raise exception 'Group name must be between 2 and 80 characters';
  end if;
  if p_description is not null and char_length(p_description) > 500 then
    raise exception 'Description is too long';
  end if;
  insert into public.groups (name, description, created_by)
  values (trim(p_name), nullif(trim(p_description), ''), v_user_id)
  returning id into v_group_id;
  insert into public.group_members (group_id, user_id, role, status)
  values (v_group_id, v_user_id, 'admin', 'active');
  return v_group_id;
end;
$$;

-- an admin may leave only while another admin remains
create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select gm.role into v_role from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = v_user_id and gm.status = 'active'
  for update;
  if v_role is null then
    raise exception 'Active membership not found';
  end if;
  if v_role = 'admin' and not exists (
    select 1 from public.group_members o
    where o.group_id = p_group_id and o.status = 'active' and o.role = 'admin' and o.user_id <> v_user_id
  ) then
    raise exception 'LAST_ADMIN';
  end if;
  update public.group_members set status = 'left', left_at = now()
  where group_id = p_group_id and user_id = v_user_id and status = 'active';
end;
$$;

-- any admin removes members; admins cannot remove each other
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
  select gm.role into v_target_role from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = p_user_id and gm.status = 'active'
  for update;
  if v_target_role is null then
    raise exception 'Active target membership not found';
  end if;
  if v_target_role = 'admin' then
    raise exception 'ADMIN_CANNOT_BE_REMOVED';
  end if;
  update public.group_members set status = 'removed', left_at = now()
  where group_id = p_group_id and user_id = p_user_id and status = 'active';
end;
$$;

create or replace function public.archive_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.kh_require_role(p_group_id, 'admin');
  update public.groups set status = 'archived' where id = p_group_id and status = 'active';
  update public.group_invitations set revoked_at = coalesce(revoked_at, now())
  where group_id = p_group_id and revoked_at is null;
end;
$$;

-- admin promotes a member; an admin can only step down himself/herself, and only if another admin remains
create or replace function public.set_group_member_role(p_group_id uuid, p_user_id uuid, p_new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_target_role text;
  v_group_name text;
  v_actor_name text;
begin
  v_actor := public.kh_require_role(p_group_id, 'admin');
  perform public.kh_require_active_group(p_group_id);
  if p_new_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member';
  end if;
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
    if p_user_id <> v_actor then
      raise exception 'ADMIN_CANNOT_BE_DEMOTED';
    end if;
    if not exists (
      select 1 from public.group_members o
      where o.group_id = p_group_id and o.status = 'active' and o.role = 'admin' and o.user_id <> v_actor
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

-- ownership no longer exists
drop function if exists public.transfer_group_ownership(uuid, uuid);
drop function if exists public.is_group_owner(uuid);

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.kh_uid();
begin
  perform public.kh_rate_limit('delete_account', 5, 3600);

  -- the last admin of a group that still has other members must hand over first
  if exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.user_id = v_uid and gm.status = 'active' and gm.role = 'admin' and g.status = 'active'
      and exists (select 1 from public.group_members o
                  where o.group_id = gm.group_id and o.status = 'active' and o.user_id <> v_uid)
      and not exists (select 1 from public.group_members o
                  where o.group_id = gm.group_id and o.status = 'active' and o.user_id <> v_uid and o.role = 'admin')
  ) then
    raise exception 'LAST_ADMIN';
  end if;

  -- groups where the user is the only remaining member get archived
  update public.groups g set status = 'archived'
  where g.status = 'active'
    and exists (select 1 from public.group_members gm
                where gm.group_id = g.id and gm.user_id = v_uid and gm.status = 'active' and gm.role = 'admin')
    and not exists (select 1 from public.group_members o
                    where o.group_id = g.id and o.status = 'active' and o.user_id <> v_uid);
  update public.group_invitations gi set revoked_at = coalesce(gi.revoked_at, now())
  where gi.revoked_at is null
    and exists (select 1 from public.groups g where g.id = gi.group_id and g.status = 'archived');

  update public.join_requests
  set status = 'cancelled', reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  where user_id = v_uid and status = 'pending';

  update public.payments
  set status = 'cancelled', decided_by = v_uid, decided_at = now(), decision_note = 'account deleted'
  where status = 'pending' and (from_user = v_uid or created_by = v_uid);

  update public.group_members set status = 'left', left_at = now()
  where user_id = v_uid and status = 'active';

  delete from public.push_tokens where user_id = v_uid;
  delete from public.notifications where user_id = v_uid;

  update public.profiles
  set full_name = 'Deleted user', phone = null, avatar_url = null, deleted_at = now()
  where id = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.create_group(text, text) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.archive_group(uuid) from public, anon;
revoke all on function public.set_group_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.archive_group(uuid) to authenticated;
grant execute on function public.set_group_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

commit;
