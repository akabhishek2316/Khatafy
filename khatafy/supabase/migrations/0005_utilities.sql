-- ============================================================
-- KHATAFY | 0005 DAILY UTILITIES: shared shopping list + notices
-- ============================================================

begin;

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, group_id)
);
create index if not exists idx_shopping_lists_group on public.shopping_lists(group_id);

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null,
  group_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  quantity text check (quantity is null or char_length(quantity) <= 40),
  status text not null default 'needed' check (status in ('needed', 'bought')),
  added_by uuid not null references public.profiles(id),
  bought_by uuid references public.profiles(id),
  bought_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (list_id, group_id) references public.shopping_lists(id, group_id) on delete cascade,
  check ((status = 'bought') = (bought_at is not null))
);
create index if not exists idx_shopping_items_list on public.shopping_list_items(list_id, status) where removed_at is null;
create index if not exists idx_shopping_items_group on public.shopping_list_items(group_id);

create table if not exists public.group_notices (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text not null check (char_length(body) <= 2000),
  pinned boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id)
);
create index if not exists idx_group_notices_group on public.group_notices(group_id, pinned desc, created_at desc)
  where deleted_at is null;

drop trigger if exists trg_notices_updated_at on public.group_notices;
create trigger trg_notices_updated_at before update on public.group_notices
  for each row execute function public.set_updated_at();

alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.group_notices enable row level security;

drop policy if exists shopping_lists_select on public.shopping_lists;
create policy shopping_lists_select on public.shopping_lists for select to authenticated
  using (public.is_group_member(group_id));
drop policy if exists shopping_items_select on public.shopping_list_items;
create policy shopping_items_select on public.shopping_list_items for select to authenticated
  using (public.is_group_member(group_id));
drop policy if exists group_notices_select on public.group_notices;
create policy group_notices_select on public.group_notices for select to authenticated
  using (public.is_group_member(group_id));

revoke all on public.shopping_lists, public.shopping_list_items, public.group_notices from anon, authenticated;
grant select on public.shopping_lists, public.shopping_list_items, public.group_notices to authenticated;

-- ---------------- Shopping list ----------------
create or replace function public.get_shopping_list(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list_id uuid;
  v_list_name text;
  v_uid uuid;
begin
  v_uid := public.kh_require_role(p_group_id, 'member');

  select sl.id, sl.name into v_list_id, v_list_name
  from public.shopping_lists sl
  where sl.group_id = p_group_id and sl.archived_at is null
  order by sl.created_at limit 1;

  if v_list_id is null and exists (select 1 from public.groups g where g.id = p_group_id and g.status = 'active') then
    insert into public.shopping_lists (group_id, name, created_by)
    values (p_group_id, 'Shopping list', v_uid)
    returning id, name into v_list_id, v_list_name;
  end if;

  return jsonb_build_object(
    'list_id', v_list_id,
    'name', v_list_name,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.name, 'quantity', i.quantity, 'status', i.status,
        'added_by', i.added_by, 'added_by_name', pa.full_name,
        'bought_by', i.bought_by, 'bought_by_name', pb.full_name,
        'bought_at', i.bought_at, 'created_at', i.created_at
      ) order by (i.status = 'bought'), case when i.status = 'needed' then i.created_at end desc, i.bought_at desc)
      from (
        select * from public.shopping_list_items si
        where si.list_id = v_list_id and si.removed_at is null
        order by (si.status = 'bought'), si.created_at desc
        limit 300
      ) i
      join public.profiles pa on pa.id = i.added_by
      left join public.profiles pb on pb.id = i.bought_by
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.add_shopping_item(p_group_id uuid, p_name text, p_quantity text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_list_id uuid;
  v_id uuid;
begin
  v_uid := public.kh_require_role(p_group_id, 'member');
  perform public.kh_require_active_group(p_group_id);
  if p_name is null or char_length(trim(p_name)) not between 1 and 120 then
    raise exception 'INVALID_TITLE';
  end if;
  if p_quantity is not null and char_length(p_quantity) > 40 then
    raise exception 'INVALID_QUANTITY';
  end if;
  perform public.kh_rate_limit('shopping_add', 200, 3600);

  select sl.id into v_list_id from public.shopping_lists sl
  where sl.group_id = p_group_id and sl.archived_at is null order by sl.created_at limit 1;
  if v_list_id is null then
    insert into public.shopping_lists (group_id, name, created_by)
    values (p_group_id, 'Shopping list', v_uid) returning id into v_list_id;
  end if;

  if (select count(*) from public.shopping_list_items si
      where si.list_id = v_list_id and si.removed_at is null and si.status = 'needed') >= 300 then
    raise exception 'LIST_FULL';
  end if;

  insert into public.shopping_list_items (list_id, group_id, name, quantity, added_by)
  values (v_list_id, p_group_id, trim(p_name), nullif(trim(coalesce(p_quantity, '')), ''), v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_shopping_item_status(p_item_id uuid, p_bought boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_group uuid;
begin
  select si.group_id into v_group from public.shopping_list_items si where si.id = p_item_id and si.removed_at is null;
  if v_group is null then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  v_uid := public.kh_require_role(v_group, 'member');
  perform public.kh_require_active_group(v_group);
  update public.shopping_list_items
  set status = case when p_bought then 'bought' else 'needed' end,
      bought_by = case when p_bought then v_uid end,
      bought_at = case when p_bought then now() end
  where id = p_item_id;
end;
$$;

create or replace function public.remove_shopping_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_item public.shopping_list_items%rowtype;
  v_role text;
begin
  select * into v_item from public.shopping_list_items si where si.id = p_item_id and si.removed_at is null;
  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  v_uid := public.kh_require_role(v_item.group_id, 'member');
  perform public.kh_require_active_group(v_item.group_id);
  select gm.role into v_role from public.group_members gm
  where gm.group_id = v_item.group_id and gm.user_id = v_uid and gm.status = 'active';
  if v_item.added_by <> v_uid and v_role not in ('owner', 'admin') then
    raise exception 'EDIT_NOT_ALLOWED' using errcode = '42501';
  end if;
  update public.shopping_list_items set removed_at = now() where id = p_item_id;
end;
$$;

create or replace function public.clear_bought_items(p_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  perform public.kh_require_role(p_group_id, 'member');
  perform public.kh_require_active_group(p_group_id);
  update public.shopping_list_items set removed_at = now()
  where group_id = p_group_id and status = 'bought' and removed_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------- Notices ----------------
create or replace function public.list_notices(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.kh_require_role(p_group_id, 'member');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', n.id, 'title', n.title, 'body', n.body, 'pinned', n.pinned,
      'created_by', n.created_by, 'created_by_name', p.full_name,
      'created_at', n.created_at, 'updated_at', n.updated_at
    ) order by n.pinned desc, n.created_at desc)
    from (
      select * from public.group_notices gn
      where gn.group_id = p_group_id and gn.deleted_at is null
      order by gn.pinned desc, gn.created_at desc
      limit 100
    ) n
    join public.profiles p on p.id = n.created_by
  ), '[]'::jsonb);
end;
$$;

create or replace function public.create_notice(
  p_group_id uuid, p_title text, p_body text, p_pinned boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_role text;
  v_id uuid;
  v_name text;
begin
  v_uid := public.kh_require_role(p_group_id, 'member');
  perform public.kh_require_active_group(p_group_id);
  select gm.role into v_role from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = v_uid and gm.status = 'active';
  if p_title is null or char_length(trim(p_title)) not between 1 and 120 then
    raise exception 'INVALID_TITLE';
  end if;
  if p_body is null or char_length(p_body) > 2000 then
    raise exception 'NOTE_TOO_LONG';
  end if;
  if coalesce(p_pinned, false) and v_role not in ('owner', 'admin') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  perform public.kh_rate_limit('create_notice', 30, 3600);

  insert into public.group_notices (group_id, title, body, pinned, created_by)
  values (p_group_id, trim(p_title), p_body, coalesce(p_pinned, false), v_uid)
  returning id into v_id;

  select p.full_name into v_name from public.profiles p where p.id = v_uid;
  perform public.kh_notify(gm.user_id, p_group_id, 'notice_posted',
    jsonb_build_object('title', trim(p_title), 'name', v_name, 'notice_id', v_id), null)
  from public.group_members gm
  where gm.group_id = p_group_id and gm.status = 'active' and gm.user_id <> v_uid;
  return v_id;
end;
$$;

create or replace function public.update_notice(
  p_notice_id uuid, p_title text, p_body text, p_pinned boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_n public.group_notices%rowtype;
  v_role text;
begin
  select * into v_n from public.group_notices gn where gn.id = p_notice_id and gn.deleted_at is null for update;
  if not found then
    raise exception 'NOTICE_NOT_FOUND';
  end if;
  v_uid := public.kh_require_role(v_n.group_id, 'member');
  perform public.kh_require_active_group(v_n.group_id);
  select gm.role into v_role from public.group_members gm
  where gm.group_id = v_n.group_id and gm.user_id = v_uid and gm.status = 'active';
  if v_n.created_by <> v_uid and v_role not in ('owner', 'admin') then
    raise exception 'EDIT_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_pinned is not null and p_pinned <> v_n.pinned and v_role not in ('owner', 'admin') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 120 then
    raise exception 'INVALID_TITLE';
  end if;
  if p_body is null or char_length(p_body) > 2000 then
    raise exception 'NOTE_TOO_LONG';
  end if;
  update public.group_notices
  set title = trim(p_title), body = p_body, pinned = coalesce(p_pinned, pinned)
  where id = p_notice_id;
end;
$$;

create or replace function public.delete_notice(p_notice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_n public.group_notices%rowtype;
  v_role text;
begin
  select * into v_n from public.group_notices gn where gn.id = p_notice_id and gn.deleted_at is null for update;
  if not found then
    raise exception 'NOTICE_NOT_FOUND';
  end if;
  v_uid := public.kh_require_role(v_n.group_id, 'member');
  perform public.kh_require_active_group(v_n.group_id);
  select gm.role into v_role from public.group_members gm
  where gm.group_id = v_n.group_id and gm.user_id = v_uid and gm.status = 'active';
  if v_n.created_by <> v_uid and v_role not in ('owner', 'admin') then
    raise exception 'EDIT_NOT_ALLOWED' using errcode = '42501';
  end if;
  update public.group_notices set deleted_at = now(), deleted_by = v_uid where id = p_notice_id;
end;
$$;

revoke all on function public.get_shopping_list(uuid) from public, anon;
revoke all on function public.add_shopping_item(uuid, text, text) from public, anon;
revoke all on function public.set_shopping_item_status(uuid, boolean) from public, anon;
revoke all on function public.remove_shopping_item(uuid) from public, anon;
revoke all on function public.clear_bought_items(uuid) from public, anon;
revoke all on function public.list_notices(uuid) from public, anon;
revoke all on function public.create_notice(uuid, text, text, boolean) from public, anon;
revoke all on function public.update_notice(uuid, text, text, boolean) from public, anon;
revoke all on function public.delete_notice(uuid) from public, anon;

grant execute on function public.get_shopping_list(uuid) to authenticated;
grant execute on function public.add_shopping_item(uuid, text, text) to authenticated;
grant execute on function public.set_shopping_item_status(uuid, boolean) to authenticated;
grant execute on function public.remove_shopping_item(uuid) to authenticated;
grant execute on function public.clear_bought_items(uuid) to authenticated;
grant execute on function public.list_notices(uuid) to authenticated;
grant execute on function public.create_notice(uuid, text, text, boolean) to authenticated;
grant execute on function public.update_notice(uuid, text, text, boolean) to authenticated;
grant execute on function public.delete_notice(uuid) to authenticated;

commit;
