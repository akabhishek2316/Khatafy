-- ============================================================
-- KHATAFY | 0002 PHASE 1 HARDENING + SHARED INFRASTRUCTURE
-- Follow-up to 0001 (the supplied Phase 1 foundation is preserved).
-- Adds: internal helpers, rate limiting, richer audit trail,
-- notifications, ownership transfer, archived-group guards,
-- read RPCs for groups/members/requests/invitations/activity,
-- profile privacy (phone hidden from other members).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Profiles: privacy + tombstones (for account deletion)
-- ------------------------------------------------------------
-- Profiles must outlive auth users so that old ledgers stay readable
-- ("Deleted user"). The FK to auth.users is therefore dropped; the
-- delete_my_account() RPC (migration 0007) anonymises the profile.
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles add column if not exists deleted_at timestamptz;

-- Other members must never see a phone number: column-level SELECT grant
-- without "phone". The user reads their own phone through get_my_profile().
revoke select on public.profiles from authenticated;
grant select (id, full_name, avatar_url, preferred_language, created_at, updated_at, deleted_at)
  on public.profiles to authenticated;

-- Former members stay visible to the people they shared a group with
-- (needed for historical ledgers). Only the viewer must be an ACTIVE member.
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
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = profiles.id
  )
);

create or replace function public.validate_profile_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.full_name := trim(coalesce(new.full_name, ''));
  if new.deleted_at is null and char_length(new.full_name) not between 1 and 80 then
    raise exception 'INVALID_NAME';
  end if;
  if new.phone is not null then
    new.phone := nullif(trim(new.phone), '');
    if new.phone is not null and new.phone !~ '^[0-9+() -]{6,20}$' then
      raise exception 'INVALID_PHONE';
    end if;
  end if;
  if new.avatar_url is not null then
    new.avatar_url := nullif(trim(new.avatar_url), '');
    if new.avatar_url is not null and (char_length(new.avatar_url) > 500 or new.avatar_url !~ '^https://') then
      raise exception 'INVALID_AVATAR_URL';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_validate on public.profiles;
create trigger trg_profiles_validate
before insert or update on public.profiles
for each row execute function public.validate_profile_row();

-- ------------------------------------------------------------
-- 2. Internal helpers (NOT callable by clients)
-- ------------------------------------------------------------
create or replace function public.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.kh_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

-- p_min_role: 'member' | 'admin' | 'owner'. Returns the caller's id.
create or replace function public.kh_require_role(p_group_id uuid, p_min_role text default 'member')
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.kh_uid();
  v_role text;
begin
  select gm.role into v_role
  from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = v_uid and gm.status = 'active';

  if v_role is null then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;
  if p_min_role = 'admin' and v_role not in ('owner', 'admin') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_min_role = 'owner' and v_role <> 'owner' then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function public.kh_require_active_group(p_group_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_status text;
begin
  select g.status into v_status from public.groups g where g.id = p_group_id;
  if v_status is null then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  if v_status <> 'active' then
    raise exception 'GROUP_ARCHIVED';
  end if;
end;
$$;

create or replace function public.kh_audit(
  p_group_id uuid, p_action text, p_entity_type text, p_entity_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_group_id, (select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Fixed-window per-user rate limit. Raises RATE_LIMITED when exceeded.
create table if not exists public.rate_limits (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, action, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.kh_rate_limit(p_action text, p_max integer, p_window_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.kh_uid();
  v_window timestamptz;
  v_hits integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits (user_id, action, window_start, hits)
  values (v_uid, p_action, v_window, 1)
  on conflict (user_id, action, window_start)
  do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  delete from public.rate_limits rl
  where rl.user_id = v_uid and rl.window_start < now() - interval '2 days';

  if v_hits > p_max then
    raise exception 'RATE_LIMITED' using errcode = '54000';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 3. Notifications (in-app) + push tokens
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  type text not null check (char_length(type) between 1 and 60),
  params jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_notifications_dedupe
  on public.notifications(user_id, dedupe_key) where dedupe_key is not null;
create index if not exists idx_notifications_user_created
  on public.notifications(user_id, id desc);
create index if not exists idx_notifications_user_unread
  on public.notifications(user_id) where read_at is null;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (char_length(token) between 10 and 300),
  platform text not null check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

-- push_tokens: no client policies at all (RPC only).
revoke all on public.notifications from anon, authenticated;
revoke all on public.push_tokens from anon, authenticated;
grant select on public.notifications to authenticated;

create or replace function public.kh_notify(
  p_user_id uuid, p_group_id uuid, p_type text,
  p_params jsonb default '{}'::jsonb, p_dedupe_key text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, group_id, type, params, dedupe_key)
  values (p_user_id, p_group_id, p_type, coalesce(p_params, '{}'::jsonb), p_dedupe_key)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
$$;

create or replace function public.kh_notify_admins(
  p_group_id uuid, p_type text, p_params jsonb, p_exclude uuid default null, p_dedupe_prefix text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.kh_notify(
    gm.user_id, p_group_id, p_type, p_params,
    case when p_dedupe_prefix is null then null else p_dedupe_prefix || ':' || gm.user_id::text end
  )
  from public.group_members gm
  where gm.group_id = p_group_id and gm.status = 'active'
    and gm.role in ('owner', 'admin')
    and gm.user_id is distinct from p_exclude;
$$;

-- ------------------------------------------------------------
-- 4. Richer audit trail (what changed, never secrets)
-- ------------------------------------------------------------
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
  v_changes jsonb;
begin
  if tg_op <> 'DELETE' then v_new := to_jsonb(new) - 'token_hash'; end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old) - 'token_hash'; end if;

  v_group_id := coalesce(
    nullif(v_new ->> 'group_id', '')::uuid,
    nullif(v_old ->> 'group_id', '')::uuid,
    nullif(v_new ->> 'id', '')::uuid,
    nullif(v_old ->> 'id', '')::uuid
  );
  v_entity_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_action := lower(tg_op);
  v_metadata := jsonb_build_object('table', tg_table_name, 'operation', v_action);

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', v_old -> n.key, 'new', n.value)), '{}'::jsonb)
    into v_changes
    from jsonb_each(v_new) n
    where n.key not in ('updated_at')
      and (v_old -> n.key) is distinct from n.value;
    if v_changes = '{}'::jsonb then
      return new;  -- nothing meaningful changed
    end if;
    v_metadata := v_metadata || jsonb_build_object('changes', v_changes);
  elsif tg_op = 'INSERT' then
    v_metadata := v_metadata || jsonb_build_object('snapshot', v_new - 'updated_at' - 'created_at');
  end if;

  insert into public.audit_logs (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_group_id, (select auth.uid()), v_action, tg_table_name, v_entity_id, v_metadata);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5. Group row validation (timezone, archived groups are frozen)
-- ------------------------------------------------------------
create or replace function public.validate_group_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'INVALID_TIMEZONE';
  end if;
  if tg_op = 'UPDATE' and old.status = 'archived'
     and (new.name, new.description, new.timezone) is distinct from (old.name, old.description, old.timezone) then
    raise exception 'GROUP_ARCHIVED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_groups_validate on public.groups;
create trigger trg_groups_validate
before insert or update on public.groups
for each row execute function public.validate_group_row();

-- ------------------------------------------------------------
-- 6. Invitations: audited, archived groups rejected, rate limited
-- ------------------------------------------------------------
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
  v_uid uuid;
  v_code text;
  v_id uuid;
begin
  v_uid := public.kh_require_role(p_group_id, 'admin');
  perform public.kh_require_active_group(p_group_id);
  perform public.kh_rate_limit('create_invitation', 30, 3600);

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Invitation expiry must be in the future';
  end if;
  if p_expires_at is not null and p_expires_at > now() + interval '366 days' then
    raise exception 'Invitation expiry is too far in the future';
  end if;
  if p_max_uses is not null and (p_max_uses < 1 or p_max_uses > 10000) then
    raise exception 'Maximum uses must be positive';
  end if;

  v_code := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.group_invitations (group_id, token_hash, created_by, expires_at, max_uses)
  values (
    p_group_id,
    encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex'),
    v_uid, p_expires_at, p_max_uses
  )
  returning id into v_id;

  perform public.kh_audit(p_group_id, 'invitation.created', 'group_invitations', v_id::text,
    jsonb_build_object('expires_at', p_expires_at, 'max_uses', p_max_uses));
  return v_code;
end;
$$;

create or replace function public.revoke_group_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_group_id uuid;
begin
  select gi.group_id into v_group_id from public.group_invitations gi where gi.id = p_invitation_id;
  if v_group_id is null then
    raise exception 'Invitation not found';
  end if;
  perform public.kh_require_role(v_group_id, 'admin');

  update public.group_invitations
  set revoked_at = coalesce(revoked_at, now())
  where id = p_invitation_id;

  perform public.kh_audit(v_group_id, 'invitation.revoked', 'group_invitations', p_invitation_id::text);
end;
$$;

-- ------------------------------------------------------------
-- 7. Join requests: rate limited, admins notified, decisions notified
-- ------------------------------------------------------------
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
  v_user_id uuid := public.kh_uid();
  v_invitation public.group_invitations%rowtype;
  v_group_status text;
  v_group_name text;
  v_request_id uuid;
  v_hash text;
  v_name text;
begin
  perform public.kh_rate_limit('join_request', 20, 3600);

  if p_invitation_code is null or char_length(p_invitation_code) < 20 then
    raise exception 'Invalid invitation code';
  end if;
  if p_message is not null and char_length(p_message) > 300 then
    raise exception 'Message is too long';
  end if;

  v_hash := encode(extensions.digest(convert_to(trim(p_invitation_code), 'UTF8'), 'sha256'), 'hex');

  select * into v_invitation from public.group_invitations gi where gi.token_hash = v_hash for update;

  if not found
     or v_invitation.revoked_at is not null
     or (v_invitation.expires_at is not null and v_invitation.expires_at <= now())
     or (v_invitation.max_uses is not null and v_invitation.uses_count >= v_invitation.max_uses)
  then
    raise exception 'Invitation is invalid, expired, revoked or fully used';
  end if;

  select g.status, g.name into v_group_status, v_group_name
  from public.groups g where g.id = v_invitation.group_id;

  if v_group_status is distinct from 'active' then
    raise exception 'This group is not accepting join requests';
  end if;

  if exists (
    select 1 from public.group_members gm
    where gm.group_id = v_invitation.group_id and gm.user_id = v_user_id and gm.status = 'active'
  ) then
    raise exception 'You are already an active member';
  end if;

  insert into public.join_requests (group_id, user_id, invitation_id, message)
  values (v_invitation.group_id, v_user_id, v_invitation.id, nullif(trim(p_message), ''))
  on conflict (group_id, user_id) where status = 'pending'
  do update set invitation_id = excluded.invitation_id, message = excluded.message, updated_at = now()
  returning id into v_request_id;

  select p.full_name into v_name from public.profiles p where p.id = v_user_id;
  perform public.kh_notify_admins(
    v_invitation.group_id, 'join_request',
    jsonb_build_object('name', v_name, 'group_name', v_group_name),
    v_user_id, 'join:' || v_request_id::text
  );
  return v_request_id;
end;
$$;

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
  v_group_name text;
  v_actor uuid := public.kh_uid();
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into v_request from public.join_requests jr where jr.id = p_request_id for update;
  if not found then
    raise exception 'Join request not found';
  end if;

  perform public.kh_require_role(v_request.group_id, 'admin');

  if v_request.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  if p_decision = 'approved' then
    perform public.kh_require_active_group(v_request.group_id);

    select * into v_invitation from public.group_invitations gi
    where gi.id = v_request.invitation_id for update;

    if v_invitation.revoked_at is not null then
      raise exception 'The invitation has been revoked';
    end if;
    if v_invitation.max_uses is not null and v_invitation.uses_count >= v_invitation.max_uses then
      raise exception 'Invitation usage limit reached';
    end if;

    insert into public.group_members (group_id, user_id, role, status)
    values (v_request.group_id, v_request.user_id, 'member', 'active')
    on conflict (group_id, user_id) where status = 'active' do nothing;

    update public.group_invitations set uses_count = uses_count + 1 where id = v_invitation.id;
  end if;

  update public.join_requests
  set status = p_decision, reviewed_by = v_actor, reviewed_at = now(), updated_at = now()
  where id = p_request_id;

  select g.name into v_group_name from public.groups g where g.id = v_request.group_id;
  perform public.kh_notify(
    v_request.user_id, v_request.group_id,
    case when p_decision = 'approved' then 'join_approved' else 'join_rejected' end,
    jsonb_build_object('group_name', v_group_name), null
  );
end;
$$;

create or replace function public.cancel_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.kh_uid();
  v_req public.join_requests%rowtype;
begin
  select * into v_req from public.join_requests jr where jr.id = p_request_id for update;
  if not found or v_req.user_id <> v_uid then
    raise exception 'Join request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;
  update public.join_requests
  set status = 'cancelled', reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  where id = p_request_id;
end;
$$;

-- ------------------------------------------------------------
-- 8. Ownership transfer (atomic + audited) and group update
-- ------------------------------------------------------------
create or replace function public.transfer_group_ownership(p_group_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_group_name text;
  v_actor_name text;
begin
  v_actor := public.kh_require_role(p_group_id, 'owner');
  perform public.kh_require_active_group(p_group_id);

  if p_new_owner = v_actor then
    raise exception 'ALREADY_OWNER';
  end if;

  -- lock both rows in a stable order to avoid deadlocks
  perform 1 from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id in (v_actor, p_new_owner) and gm.status = 'active'
  order by gm.user_id for update;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = p_new_owner and gm.status = 'active'
  ) then
    raise exception 'Active target membership not found';
  end if;

  -- the partial unique index allows zero owners momentarily, so demote first
  update public.group_members set role = 'admin'
  where group_id = p_group_id and user_id = v_actor and status = 'active' and role = 'owner';

  update public.group_members set role = 'owner'
  where group_id = p_group_id and user_id = p_new_owner and status = 'active';

  perform public.kh_audit(p_group_id, 'group.ownership_transferred', 'groups', p_group_id::text,
    jsonb_build_object('from', v_actor, 'to', p_new_owner));

  select g.name into v_group_name from public.groups g where g.id = p_group_id;
  select p.full_name into v_actor_name from public.profiles p where p.id = v_actor;
  perform public.kh_notify(p_new_owner, p_group_id, 'ownership_received',
    jsonb_build_object('group_name', v_group_name, 'name', v_actor_name), null);
end;
$$;

create or replace function public.update_group(
  p_group_id uuid, p_name text, p_description text default null, p_timezone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.kh_require_role(p_group_id, 'admin');
  perform public.kh_require_active_group(p_group_id);
  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then
    raise exception 'Group name must be between 2 and 80 characters';
  end if;
  if p_description is not null and char_length(p_description) > 500 then
    raise exception 'Description is too long';
  end if;
  update public.groups
  set name = trim(p_name),
      description = nullif(trim(coalesce(p_description, '')), ''),
      timezone = coalesce(nullif(trim(p_timezone), ''), timezone)
  where id = p_group_id;
end;
$$;

-- ------------------------------------------------------------
-- 9. Read RPCs (SECURITY DEFINER with explicit membership checks)
-- ------------------------------------------------------------
create or replace function public.get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := public.kh_uid();
begin
  return (
    select jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'phone', p.phone,
      'avatar_url', p.avatar_url, 'preferred_language', p.preferred_language
    )
    from public.profiles p where p.id = v_uid
  );
end;
$$;

create or replace function public.update_my_profile(
  p_full_name text, p_phone text default null, p_avatar_url text default null,
  p_preferred_language text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := public.kh_uid();
begin
  if p_preferred_language is not null and p_preferred_language not in ('en', 'hi') then
    raise exception 'INVALID_LANGUAGE';
  end if;
  update public.profiles p
  set full_name = p_full_name,
      phone = p_phone,
      avatar_url = p_avatar_url,
      preferred_language = coalesce(p_preferred_language, p.preferred_language)
  where p.id = v_uid and p.deleted_at is null;
end;
$$;

create or replace function public.list_my_groups()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := public.kh_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'description', g.description, 'status', g.status,
      'currency_code', g.currency_code, 'timezone', g.timezone,
      'role', gm.role, 'created_at', g.created_at,
      'member_count', (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'active')
    ) order by g.status, g.created_at desc)
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.user_id = v_uid and gm.status = 'active'
  ), '[]'::jsonb);
end;
$$;

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
      'my_role', v_role,
      'member_count', (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'active'),
      'pending_requests', case when v_role in ('owner', 'admin')
        then (select count(*) from public.join_requests jr where jr.group_id = g.id and jr.status = 'pending') else 0 end
    )
    from public.groups g where g.id = p_group_id
  );
end;
$$;

create or replace function public.list_group_members(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.kh_require_role(p_group_id, 'member');
  return coalesce((
    select jsonb_agg(x.j order by x.is_active desc, x.role_rank, x.lname)
    from (
      select distinct on (gm.user_id)
        (gm.status = 'active') as is_active,
        case gm.role when 'owner' then 0 when 'admin' then 1 else 2 end as role_rank,
        lower(p.full_name) as lname,
        jsonb_build_object(
          'user_id', gm.user_id, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
          'is_deleted', p.deleted_at is not null,
          'role', gm.role, 'status', gm.status, 'joined_at', gm.joined_at, 'left_at', gm.left_at
        ) as j
      from public.group_members gm
      join public.profiles p on p.id = gm.user_id
      where gm.group_id = p_group_id
      order by gm.user_id, (gm.status = 'active') desc, gm.joined_at desc
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_join_requests(p_group_id uuid, p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.kh_require_role(p_group_id, 'admin');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', jr.id, 'user_id', jr.user_id, 'full_name', p.full_name, 'message', jr.message,
      'status', jr.status, 'created_at', jr.created_at, 'reviewed_at', jr.reviewed_at
    ) order by jr.created_at desc)
    from public.join_requests jr
    join public.profiles p on p.id = jr.user_id
    where jr.group_id = p_group_id and (p_status is null or jr.status = p_status)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_my_join_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := public.kh_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', jr.id, 'group_id', jr.group_id, 'group_name', g.name, 'status', jr.status,
      'message', jr.message, 'created_at', jr.created_at
    ) order by jr.created_at desc)
    from public.join_requests jr
    join public.groups g on g.id = jr.group_id
    where jr.user_id = v_uid
      and jr.created_at > now() - interval '60 days'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_group_invitations(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.kh_require_role(p_group_id, 'admin');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', gi.id, 'created_at', gi.created_at, 'expires_at', gi.expires_at,
      'max_uses', gi.max_uses, 'uses_count', gi.uses_count, 'revoked_at', gi.revoked_at,
      'created_by_name', p.full_name,
      'state', case
        when gi.revoked_at is not null then 'revoked'
        when gi.expires_at is not null and gi.expires_at <= now() then 'expired'
        when gi.max_uses is not null and gi.uses_count >= gi.max_uses then 'used_up'
        else 'active' end
    ) order by gi.created_at desc)
    from public.group_invitations gi
    join public.profiles p on p.id = gi.created_by
    where gi.group_id = p_group_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_group_activity(
  p_group_id uuid, p_limit integer default 40, p_before_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  v_items jsonb;
begin
  perform public.kh_require_role(p_group_id, 'member');
  select coalesce(jsonb_agg(t.j order by t.id desc), '[]'::jsonb) into v_items
  from (
    select al.id, jsonb_build_object(
      'id', al.id, 'action', al.action, 'entity_type', al.entity_type, 'entity_id', al.entity_id,
      'actor_id', al.actor_id, 'actor_name', p.full_name, 'metadata', al.metadata, 'created_at', al.created_at
    ) as j
    from public.audit_logs al
    left join public.profiles p on p.id = al.actor_id
    where al.group_id = p_group_id
      and (p_before_id is null or al.id < p_before_id)
    order by al.id desc
    limit v_limit
  ) t;
  return jsonb_build_object(
    'items', v_items,
    'next_before_id', case when jsonb_array_length(v_items) = v_limit
      then (v_items -> (v_limit - 1) ->> 'id')::bigint else null end
  );
end;
$$;

-- Notifications
create or replace function public.list_notifications(p_limit integer default 30, p_before_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.kh_uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_items jsonb;
begin
  select coalesce(jsonb_agg(t.j order by t.id desc), '[]'::jsonb) into v_items
  from (
    select n.id, jsonb_build_object(
      'id', n.id, 'group_id', n.group_id, 'type', n.type, 'params', n.params,
      'read_at', n.read_at, 'created_at', n.created_at
    ) as j
    from public.notifications n
    where n.user_id = v_uid and (p_before_id is null or n.id < p_before_id)
    order by n.id desc
    limit v_limit
  ) t;
  return jsonb_build_object(
    'items', v_items,
    'unread_count', (select count(*) from public.notifications n where n.user_id = v_uid and n.read_at is null),
    'next_before_id', case when jsonb_array_length(v_items) = v_limit
      then (v_items -> (v_limit - 1) ->> 'id')::bigint else null end
  );
end;
$$;

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := public.kh_uid();
begin
  update public.notifications n
  set read_at = now()
  where n.user_id = v_uid and n.read_at is null
    and (p_ids is null or n.id = any (p_ids));
end;
$$;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := public.kh_uid();
begin
  perform public.kh_rate_limit('push_token', 30, 3600);
  insert into public.push_tokens (user_id, token, platform)
  values (v_uid, p_token, p_platform)
  on conflict (token) do update set user_id = v_uid, platform = excluded.platform, updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := public.kh_uid();
begin
  delete from public.push_tokens where token = p_token and user_id = v_uid;
end;
$$;

-- ------------------------------------------------------------
-- 10. Privileges
-- ------------------------------------------------------------
-- Internal helpers: nobody but the function owner / other definer functions.
revoke all on function public.try_uuid(text) from public, anon;
grant execute on function public.try_uuid(text) to authenticated;
revoke all on function public.kh_uid() from public, anon, authenticated;
revoke all on function public.kh_require_role(uuid, text) from public, anon, authenticated;
revoke all on function public.kh_require_active_group(uuid) from public, anon, authenticated;
revoke all on function public.kh_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.kh_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.kh_notify(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.kh_notify_admins(uuid, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.write_group_audit_log() from public, anon, authenticated;
revoke all on function public.validate_profile_row() from public, anon, authenticated;
revoke all on function public.validate_group_row() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Client-callable RPCs.
revoke all on function public.create_group_invitation(uuid, timestamptz, integer) from public, anon;
revoke all on function public.revoke_group_invitation(uuid) from public, anon;
revoke all on function public.request_to_join_group(text, text) from public, anon;
revoke all on function public.review_join_request(uuid, text) from public, anon;
revoke all on function public.cancel_join_request(uuid) from public, anon;
revoke all on function public.transfer_group_ownership(uuid, uuid) from public, anon;
revoke all on function public.update_group(uuid, text, text, text) from public, anon;
revoke all on function public.get_my_profile() from public, anon;
revoke all on function public.update_my_profile(text, text, text, text) from public, anon;
revoke all on function public.list_my_groups() from public, anon;
revoke all on function public.get_group(uuid) from public, anon;
revoke all on function public.list_group_members(uuid) from public, anon;
revoke all on function public.list_join_requests(uuid, text) from public, anon;
revoke all on function public.list_my_join_requests() from public, anon;
revoke all on function public.list_group_invitations(uuid) from public, anon;
revoke all on function public.list_group_activity(uuid, integer, bigint) from public, anon;
revoke all on function public.list_notifications(integer, bigint) from public, anon;
revoke all on function public.mark_notifications_read(bigint[]) from public, anon;
revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;

grant execute on function public.create_group_invitation(uuid, timestamptz, integer) to authenticated;
grant execute on function public.revoke_group_invitation(uuid) to authenticated;
grant execute on function public.request_to_join_group(text, text) to authenticated;
grant execute on function public.review_join_request(uuid, text) to authenticated;
grant execute on function public.cancel_join_request(uuid) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.update_group(uuid, text, text, text) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;
grant execute on function public.list_my_groups() to authenticated;
grant execute on function public.get_group(uuid) to authenticated;
grant execute on function public.list_group_members(uuid) to authenticated;
grant execute on function public.list_join_requests(uuid, text) to authenticated;
grant execute on function public.list_my_join_requests() to authenticated;
grant execute on function public.list_group_invitations(uuid) to authenticated;
grant execute on function public.list_group_activity(uuid, integer, bigint) to authenticated;
grant execute on function public.list_notifications(integer, bigint) to authenticated;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

commit;
