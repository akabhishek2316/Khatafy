-- ============================================================
-- KHATAFY | PHASE 1 DATABASE FOUNDATION
-- Supabase PostgreSQL
-- Includes: profiles, groups, memberships, invitations,
-- join requests, audit logs, RLS, triggers and secure RPCs.
--
-- Run once in Supabase SQL Editor using the project owner role.
-- Review the notes in the accompanying setup instructions.
-- ============================================================

begin;

-- 1. Extensions
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- 2. Core tables
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  avatar_url text,
  preferred_language text not null default 'en'
    check (preferred_language in ('en', 'hi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  created_by uuid not null references public.profiles(id),
  currency_code text not null default 'INR'
    check (currency_code ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  status text not null default 'active'
    check (status in ('active', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'active' and left_at is null)
    or
    (status in ('left', 'removed') and left_at is not null)
  )
);

-- A user can have only one active membership in a group.
-- Old membership rows remain available for history.
create unique index if not exists uq_group_members_active
  on public.group_members(group_id, user_id)
  where status = 'active';

-- Each group must have at most one active owner.
create unique index if not exists uq_group_one_active_owner
  on public.group_members(group_id)
  where role = 'owner' and status = 'active';

create table if not exists public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invitation_id uuid not null references public.group_invitations(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  message text check (message is null or char_length(message) <= 300),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or
    (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  )
);

create unique index if not exists uq_join_request_pending
  on public.join_requests(group_id, user_id)
  where status = 'pending';

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  group_id uuid references public.groups(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 3. Indexes
create index if not exists idx_group_members_user_status
  on public.group_members(user_id, status);

create index if not exists idx_group_members_group_status
  on public.group_members(group_id, status);

create index if not exists idx_groups_created_by
  on public.groups(created_by);

create index if not exists idx_group_invitations_group
  on public.group_invitations(group_id);

create index if not exists idx_join_requests_user_status
  on public.join_requests(user_id, status, created_at desc);

create index if not exists idx_join_requests_group_status
  on public.join_requests(group_id, status, created_at desc);

create index if not exists idx_audit_logs_group_created
  on public.audit_logs(group_id, created_at desc);

create index if not exists idx_audit_logs_actor_created
  on public.audit_logs(actor_id, created_at desc);

-- 4. Updated-at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_groups_updated_at on public.groups;
create trigger trg_groups_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

drop trigger if exists trg_group_members_updated_at on public.group_members;
create trigger trg_group_members_updated_at
before update on public.group_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_join_requests_updated_at on public.join_requests;
create trigger trg_join_requests_updated_at
before update on public.join_requests
for each row execute function public.set_updated_at();

-- 5. Automatically create a profile after Supabase Auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Khatafy User'
  );

  insert into public.profiles (id, full_name)
  values (new.id, v_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_khatafy on auth.users;
create trigger on_auth_user_created_khatafy
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for users who already exist in Auth.
insert into public.profiles (id, full_name)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Khatafy User'
  )
from auth.users u
on conflict (id) do nothing;

-- 6. Security helper functions
-- SECURITY DEFINER avoids recursive RLS checks on group_members.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.status = 'active'
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.status = 'active'
      and gm.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.status = 'active'
      and gm.role = 'owner'
  );
$$;

-- 7. Audit trigger
create or replace function public.write_group_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_group_id uuid;
  v_entity_id text;
  v_action text;
  v_metadata jsonb;
begin
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
  end if;

  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old);
  end if;

  v_group_id := coalesce(
    nullif(v_new ->> 'group_id', '')::uuid,
    nullif(v_old ->> 'group_id', '')::uuid,
    nullif(v_new ->> 'id', '')::uuid,
    nullif(v_old ->> 'id', '')::uuid
  );

  v_entity_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_action := lower(tg_op);

  -- Do not copy sensitive fields such as invitation token hashes.
  v_metadata := jsonb_build_object(
    'table', tg_table_name,
    'operation', v_action
  );

  insert into public.audit_logs (
    group_id, actor_id, action, entity_type, entity_id, metadata
  )
  values (
    v_group_id,
    (select auth.uid()),
    v_action,
    tg_table_name,
    v_entity_id,
    v_metadata
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_groups on public.groups;
create trigger trg_audit_groups
after insert or update or delete on public.groups
for each row execute function public.write_group_audit_log();

drop trigger if exists trg_audit_group_members on public.group_members;
create trigger trg_audit_group_members
after insert or update or delete on public.group_members
for each row execute function public.write_group_audit_log();

drop trigger if exists trg_audit_join_requests on public.join_requests;
create trigger trg_audit_join_requests
after insert or update or delete on public.join_requests
for each row execute function public.write_group_audit_log();

-- 8. Create a group and make the creator its owner atomically
create or replace function public.create_group(
  p_name text,
  p_description text default null
)
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
  values (v_group_id, v_user_id, 'owner', 'active');

  return v_group_id;
end;
$$;

-- 9. Create invitation. Raw code is returned once; only its hash is stored.
create or replace function public.create_group_invitation(
  p_group_id uuid,
  p_expires_at timestamptz default (now() + interval '7 days'),
  p_max_uses integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not public.is_group_admin(p_group_id) then
    raise exception 'Only group admins can create invitations' using errcode = '42501';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Invitation expiry must be in the future';
  end if;

  if p_max_uses is not null and p_max_uses < 1 then
    raise exception 'Maximum uses must be positive';
  end if;

  v_code := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.group_invitations (
    group_id, token_hash, created_by, expires_at, max_uses
  )
  values (
    p_group_id,
    encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex'),
    (select auth.uid()),
    p_expires_at,
    p_max_uses
  );

  return v_code;
end;
$$;

-- 10. Revoke an invitation without exposing invitation hashes
create or replace function public.revoke_group_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select gi.group_id into v_group_id
  from public.group_invitations gi
  where gi.id = p_invitation_id;

  if v_group_id is null then
    raise exception 'Invitation not found';
  end if;

  if not public.is_group_admin(v_group_id) then
    raise exception 'Only group admins can revoke invitations' using errcode = '42501';
  end if;

  update public.group_invitations
  set revoked_at = coalesce(revoked_at, now())
  where id = p_invitation_id;
end;
$$;

-- 11. Request to join. A valid code creates a pending request only.
create or replace function public.request_to_join_group(
  p_invitation_code text,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.group_invitations%rowtype;
  v_group_status text;
  v_request_id uuid;
  v_hash text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_invitation_code is null or char_length(p_invitation_code) < 20 then
    raise exception 'Invalid invitation code';
  end if;

  if p_message is not null and char_length(p_message) > 300 then
    raise exception 'Message is too long';
  end if;

  v_hash := encode(
    extensions.digest(convert_to(trim(p_invitation_code), 'UTF8'), 'sha256'),
    'hex'
  );

  select * into v_invitation
  from public.group_invitations gi
  where gi.token_hash = v_hash
  for update;

  if not found
     or v_invitation.revoked_at is not null
     or (v_invitation.expires_at is not null and v_invitation.expires_at <= now())
     or (v_invitation.max_uses is not null and v_invitation.uses_count >= v_invitation.max_uses)
  then
    raise exception 'Invitation is invalid, expired, revoked or fully used';
  end if;

  select g.status into v_group_status
  from public.groups g
  where g.id = v_invitation.group_id;

  if v_group_status is distinct from 'active' then
    raise exception 'This group is not accepting join requests';
  end if;

  if exists (
    select 1 from public.group_members gm
    where gm.group_id = v_invitation.group_id
      and gm.user_id = v_user_id
      and gm.status = 'active'
  ) then
    raise exception 'You are already an active member';
  end if;

  insert into public.join_requests (
    group_id, user_id, invitation_id, message
  )
  values (
    v_invitation.group_id, v_user_id, v_invitation.id, nullif(trim(p_message), '')
  )
  on conflict (group_id, user_id) where status = 'pending'
  do update set
    invitation_id = excluded.invitation_id,
    message = excluded.message,
    updated_at = now()
  returning id into v_request_id;

  return v_request_id;
end;
$$;

-- 12. Admin approves or rejects a pending join request
create or replace function public.review_join_request(
  p_request_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.join_requests%rowtype;
  v_invitation public.group_invitations%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into v_request
  from public.join_requests jr
  where jr.id = p_request_id
  for update;

  if not found then
    raise exception 'Join request not found';
  end if;

  if not public.is_group_admin(v_request.group_id) then
    raise exception 'Only group admins can review requests' using errcode = '42501';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  if p_decision = 'approved' and not exists (
    select 1 from public.groups g
    where g.id = v_request.group_id and g.status = 'active'
  ) then
    raise exception 'Archived groups cannot accept new members';
  end if;

  if p_decision = 'approved' then
    select * into v_invitation
    from public.group_invitations gi
    where gi.id = v_request.invitation_id
    for update;

    if v_invitation.revoked_at is not null then
      raise exception 'The invitation has been revoked';
    end if;

    if v_invitation.max_uses is not null
       and v_invitation.uses_count >= v_invitation.max_uses then
      raise exception 'Invitation usage limit reached';
    end if;

    insert into public.group_members (group_id, user_id, role, status)
    values (v_request.group_id, v_request.user_id, 'member', 'active')
    on conflict (group_id, user_id) where status = 'active'
    do nothing;

    update public.group_invitations
    set uses_count = uses_count + 1
    where id = v_invitation.id;
  end if;

  update public.join_requests
  set status = p_decision,
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;
end;
$$;

-- 13. A member can leave voluntarily. The owner must transfer ownership first.
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

  select gm.role into v_role
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = v_user_id
    and gm.status = 'active'
  for update;

  if v_role is null then
    raise exception 'Active membership not found';
  end if;

  if v_role = 'owner' then
    raise exception 'Group owner must transfer ownership or archive the group first';
  end if;

  update public.group_members
  set status = 'left', left_at = now()
  where group_id = p_group_id
    and user_id = v_user_id
    and status = 'active';
end;
$$;

-- 14. Admin removes a member. Owners cannot be removed.
-- Only the owner can remove another admin.
create or replace function public.remove_group_member(
  p_group_id uuid,
  p_user_id uuid
)
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

  select gm.role into v_actor_role
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = v_actor_id
    and gm.status = 'active';

  if v_actor_role not in ('owner', 'admin') or v_actor_role is null then
    raise exception 'Only group admins can remove members' using errcode = '42501';
  end if;

  select gm.role into v_target_role
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = p_user_id
    and gm.status = 'active'
  for update;

  if v_target_role is null then
    raise exception 'Active target membership not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'The group owner cannot be removed';
  end if;

  if v_target_role = 'admin' and v_actor_role <> 'owner' then
    raise exception 'Only the owner can remove another admin' using errcode = '42501';
  end if;

  update public.group_members
  set status = 'removed', left_at = now()
  where group_id = p_group_id
    and user_id = p_user_id
    and status = 'active';
end;
$$;

-- 15. Archive a group. Only its owner can do this.
create or replace function public.archive_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Only the group owner can archive this group' using errcode = '42501';
  end if;

  update public.groups
  set status = 'archived'
  where id = p_group_id and status = 'active';

  update public.group_invitations
  set revoked_at = coalesce(revoked_at, now())
  where group_id = p_group_id and revoked_at is null;
end;
$$;


-- 15A. Owner manages admin/member roles. Owner role itself cannot be changed here.
create or replace function public.set_group_member_role(
  p_group_id uuid,
  p_user_id uuid,
  p_new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_target_role text;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_new_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member';
  end if;

  if not public.is_group_owner(p_group_id) then
    raise exception 'Only the group owner can manage admin roles' using errcode = '42501';
  end if;

  select gm.role into v_target_role
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = p_user_id
    and gm.status = 'active'
  for update;

  if v_target_role is null then
    raise exception 'Active target membership not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Owner role cannot be changed using this function';
  end if;

  update public.group_members
  set role = p_new_role
  where group_id = p_group_id
    and user_id = p_user_id
    and status = 'active';
end;
$$;

-- 16. Row Level Security
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;
alter table public.join_requests enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: users can see themselves and people sharing an active group.
drop policy if exists profiles_select_self_or_groupmate on public.profiles;
create policy profiles_select_self_or_groupmate
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.group_members mine
    join public.group_members theirs
      on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = profiles.id
      and mine.status = 'active'
      and theirs.status = 'active'
  )
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Groups: active members can read; admins can update.
drop policy if exists groups_select_members on public.groups;
create policy groups_select_members
on public.groups
for select
to authenticated
using (public.is_group_member(id));

drop policy if exists groups_update_admins on public.groups;
create policy groups_update_admins
on public.groups
for update
to authenticated
using (public.is_group_admin(id))
with check (public.is_group_admin(id));

-- Memberships: members can view their own group roster.
-- No direct insert/update/delete policies.
drop policy if exists group_members_select_roster on public.group_members;
create policy group_members_select_roster
on public.group_members
for select
to authenticated
using (public.is_group_member(group_id));

-- Invitations: intentionally no client-facing policies or table grants.
-- All invitation actions happen through security-definer RPC functions.

-- Join requests: requester sees own; group admins see requests for their group.
drop policy if exists join_requests_select_requester_or_admin on public.join_requests;
create policy join_requests_select_requester_or_admin
on public.join_requests
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_group_admin(group_id)
);

-- Audit logs: active group members can read group audit history.
drop policy if exists audit_logs_select_group_members on public.audit_logs;
create policy audit_logs_select_group_members
on public.audit_logs
for select
to authenticated
using (
  group_id is not null
  and public.is_group_member(group_id)
);

-- 17. Privileges: explicit allow-list
revoke all on public.profiles from anon, authenticated;
revoke all on public.groups from anon, authenticated;
revoke all on public.group_members from anon, authenticated;
revoke all on public.group_invitations from anon, authenticated;
revoke all on public.join_requests from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url, preferred_language)
  on public.profiles to authenticated;

grant select on public.groups to authenticated;
grant update (name, description, timezone)
  on public.groups to authenticated;

grant select on public.group_members to authenticated;
grant select on public.join_requests to authenticated;
grant select on public.audit_logs to authenticated;

-- Helper functions must be callable by RLS policies.
revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.is_group_admin(uuid) from public, anon;
revoke all on function public.is_group_owner(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;

-- Secure RPCs
revoke all on function public.create_group(text, text) from public, anon;
revoke all on function public.create_group_invitation(uuid, timestamptz, integer) from public, anon;
revoke all on function public.revoke_group_invitation(uuid) from public, anon;
revoke all on function public.request_to_join_group(text, text) from public, anon;
revoke all on function public.review_join_request(uuid, text) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.archive_group(uuid) from public, anon;
revoke all on function public.set_group_member_role(uuid, uuid, text) from public, anon;

grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.create_group_invitation(uuid, timestamptz, integer) to authenticated;
grant execute on function public.revoke_group_invitation(uuid) to authenticated;
grant execute on function public.request_to_join_group(text, text) to authenticated;
grant execute on function public.review_join_request(uuid, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.archive_group(uuid) to authenticated;
grant execute on function public.set_group_member_role(uuid, uuid, text) to authenticated;

commit;

-- ============================================================
-- PHASE 1 QUICK VERIFICATION
-- Run these separately after applying the migration:
--
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in (
--     'profiles','groups','group_members','group_invitations',
--     'join_requests','audit_logs'
--   )
-- order by table_name;
--
-- select schemaname, tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in (
--     'profiles','groups','group_members','group_invitations',
--     'join_requests','audit_logs'
--   )
-- order by tablename;
--
-- NOTE: Do not test authenticated RPCs while logged in as the
-- SQL Editor postgres role; test through a real authenticated
-- Supabase client session.
-- ============================================================
