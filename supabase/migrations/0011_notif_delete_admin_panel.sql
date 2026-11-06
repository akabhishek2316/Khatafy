-- 0011: notification delete + privacy-preserving platform admin panel.
-- Platform admins see ONLY aggregate numbers and technical group metadata (no names, emails,
-- expenses, amounts, notes or receipts). Every admin write needs a reason and is logged.

-- ---------- 1. Users can delete their own notifications ----------
create or replace function public.delete_notifications(p_ids bigint[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.kh_uid(); v_n integer;
begin
  delete from public.notifications n where n.user_id = v_uid and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------- 2. Platform admin tables (no client access at all) ----------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.app_settings (
  key text primary key check (key in ('maintenance', 'announcement')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create table if not exists public.platform_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
alter table public.app_settings enable row level security;
alter table public.platform_audit enable row level security;
revoke all on public.platform_admins, public.app_settings, public.platform_audit from anon, authenticated;
insert into public.app_settings(key, value) values ('maintenance', 'false'::jsonb), ('announcement', '""'::jsonb)
  on conflict (key) do nothing;

create or replace function public.kh_admin_uid()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := public.kh_uid();
begin
  if not exists (select 1 from public.platform_admins a where a.user_id = v_uid) then
    raise exception 'NOT_PLATFORM_ADMIN' using errcode = '42501';
  end if;
  return v_uid;
end $$;

create or replace function public.am_i_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()));
$$;

-- Public (works before login): only a maintenance flag and a short announcement text.
create or replace function public.get_app_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'maintenance', coalesce((select (value)::text = 'true' from public.app_settings where key = 'maintenance'), false),
    'announcement', coalesce((select value #>> '{}' from public.app_settings where key = 'announcement'), ''));
$$;

-- ---------- 3. Admin RPCs: aggregates only ----------
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_days jsonb;
begin
  perform public.kh_admin_uid();
  select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'signups',
           (select count(*) from public.profiles p where p.created_at::date = d::date)) order by d), '[]'::jsonb)
    into v_days from generate_series(current_date - 13, current_date, interval '1 day') d;
  return jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'users_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'groups_total', (select count(*) from public.groups),
    'groups_active', (select count(*) from public.groups where status = 'active'),
    'groups_archived', (select count(*) from public.groups where status = 'archived'),
    'expenses_30d', (select count(*) from public.expenses where created_at > now() - interval '30 days' and status = 'active'),
    'payments_30d', (select count(*) from public.payments where created_at > now() - interval '30 days'),
    'signups_14d', v_days);
end $$;

-- Technical metadata only: NO group name, NO member names, NO amounts.
create or replace function public.admin_list_groups(p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.kh_admin_uid();
  return coalesce((select jsonb_agg(x) from (
    select g.id, g.status, g.created_at,
      (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'active') as members,
      (select count(*) from public.expenses e where e.group_id = g.id and e.created_at > now() - interval '30 days') as expenses_30d
    from public.groups g order by g.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) x), '[]'::jsonb);
end $$;

-- Archive (make read-only) or restore a group, e.g. after a legal / abuse complaint. Reason is mandatory.
create or replace function public.admin_set_group_status(p_group_id uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.kh_admin_uid();
begin
  if p_status not in ('active', 'archived') then raise exception 'INVALID_STATUS'; end if;
  if p_reason is null or char_length(trim(p_reason)) < 10 or char_length(p_reason) > 300 then raise exception 'REASON_REQUIRED'; end if;
  update public.groups set status = p_status where id = p_group_id;
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  insert into public.platform_audit(actor_id, action, target, reason)
  values (v_uid, 'group_' || p_status, p_group_id::text, trim(p_reason));
end $$;

create or replace function public.admin_set_app_status(p_maintenance boolean, p_announcement text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.kh_admin_uid(); v_text text := left(trim(coalesce(p_announcement, '')), 300);
begin
  update public.app_settings set value = to_jsonb(coalesce(p_maintenance, false)), updated_at = now(), updated_by = v_uid where key = 'maintenance';
  update public.app_settings set value = to_jsonb(v_text), updated_at = now(), updated_by = v_uid where key = 'announcement';
  insert into public.platform_audit(actor_id, action, target, reason)
  values (v_uid, 'app_status', null, 'maintenance=' || coalesce(p_maintenance, false)::text);
end $$;

create or replace function public.admin_list_audit(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.kh_admin_uid();
  return coalesce((select jsonb_agg(x) from (
    select id, action, target, reason, created_at from public.platform_audit order by id desc limit least(greatest(p_limit, 1), 200)) x), '[]'::jsonb);
end $$;

-- ---------- 4. Grants ----------
revoke all on function public.delete_notifications(bigint[]) from public, anon;
revoke all on function public.kh_admin_uid() from public, anon, authenticated;
revoke all on function public.am_i_platform_admin() from public, anon;
revoke all on function public.get_app_status() from public;
revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_list_groups(integer, integer) from public, anon;
revoke all on function public.admin_set_group_status(uuid, text, text) from public, anon;
revoke all on function public.admin_set_app_status(boolean, text) from public, anon;
revoke all on function public.admin_list_audit(integer) from public, anon;
grant execute on function public.delete_notifications(bigint[]) to authenticated;
grant execute on function public.am_i_platform_admin() to authenticated;
grant execute on function public.get_app_status() to anon, authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_list_groups(integer, integer) to authenticated;
grant execute on function public.admin_set_group_status(uuid, text, text) to authenticated;
grant execute on function public.admin_set_app_status(boolean, text) to authenticated;
grant execute on function public.admin_list_audit(integer) to authenticated;

-- First admin (run ONCE in the SQL editor, with YOUR email; there is deliberately no UI/API to grant admin):
--   insert into public.platform_admins(user_id) select id from auth.users where email = 'you@example.com';
