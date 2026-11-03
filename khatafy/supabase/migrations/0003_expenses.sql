-- ============================================================
-- KHATAFY | 0003 EXPENSE DIARY
-- categories, expenses, immutable split snapshots, revisions,
-- receipts, budgets, deterministic split engine, transactional RPCs.
-- Money is ALWAYS integer paise (bigint). Max single amount: 10,000,000,000
-- paise (INR 10 crore) so that amount * 10000 (basis points) stays far below
-- the bigint limit and JavaScript's safe-integer limit.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Categories (system defined, read-only for clients)
-- ------------------------------------------------------------
create table if not exists public.expense_categories (
  key text primary key check (key ~ '^[a-z_]{2,30}$'),
  name_en text not null,
  name_hi text not null,
  sort_order integer not null default 0
);

insert into public.expense_categories (key, name_en, name_hi, sort_order) values
  ('rent',        'Rent',        'किराया',     10),
  ('grocery',     'Grocery',     'किराना',     20),
  ('food',        'Food',        'खाना',       30),
  ('electricity', 'Electricity', 'बिजली',      40),
  ('water',       'Water',       'पानी',       50),
  ('gas',         'Gas',         'गैस',        60),
  ('internet',    'Internet',    'इंटरनेट',    70),
  ('cleaning',    'Cleaning',    'सफाई',       80),
  ('travel',      'Travel',      'यात्रा',     90),
  ('other',       'Other',       'अन्य',       100)
on conflict (key) do update
  set name_en = excluded.name_en, name_hi = excluded.name_hi, sort_order = excluded.sort_order;

-- ------------------------------------------------------------
-- 2. Expenses and immutable split snapshots
-- ------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 120),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 10000000000),
  category_key text not null references public.expense_categories(key),
  spent_at timestamptz not null,
  paid_by uuid not null references public.profiles(id),
  split_mode text not null check (split_mode in ('equal', 'amount', 'percent')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'active' check (status in ('active', 'voided')),
  version integer not null default 1 check (version >= 1),
  idempotency_key uuid not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  void_reason text,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  unique (id, group_id),
  unique (group_id, created_by, idempotency_key),
  check ((status = 'voided') = (voided_at is not null))
);
create index if not exists idx_expenses_group_spent on public.expenses(group_id, spent_at desc, id desc);
create index if not exists idx_expenses_group_payer on public.expenses(group_id, paid_by);
create index if not exists idx_expenses_group_status_spent on public.expenses(group_id, status, spent_at);

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  group_id uuid not null,
  version integer not null check (version >= 1),
  user_id uuid not null references public.profiles(id),
  share_paise bigint not null check (share_paise >= 0),
  percent_bps integer check (percent_bps is null or percent_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  foreign key (expense_id, group_id) references public.expenses(id, group_id) on delete restrict,
  unique (expense_id, version, user_id)
);
create index if not exists idx_expense_splits_expense on public.expense_splits(expense_id, version);
create index if not exists idx_expense_splits_group_user on public.expense_splits(group_id, user_id);

create table if not exists public.expense_revisions (
  id bigint generated always as identity primary key,
  expense_id uuid not null,
  group_id uuid not null,
  version integer not null,
  change_type text not null check (change_type in ('edit', 'void')),
  reason text not null check (char_length(trim(reason)) between 3 and 300),
  snapshot jsonb not null,
  changed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (expense_id, group_id) references public.expenses(id, group_id) on delete restrict
);
create index if not exists idx_expense_revisions_expense on public.expense_revisions(expense_id, id desc);

create table if not exists public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  group_id uuid not null,
  storage_path text not null unique check (char_length(storage_path) <= 400),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles(id),
  foreign key (expense_id, group_id) references public.expenses(id, group_id) on delete restrict
);
create index if not exists idx_expense_receipts_expense on public.expense_receipts(expense_id);

create table if not exists public.group_budgets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  category_key text references public.expense_categories(key),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 10000000000),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_group_budget_scope
  on public.group_budgets(group_id, coalesce(category_key, '__all__'));

-- ------------------------------------------------------------
-- 3. Integrity triggers (defence in depth; clients cannot write anyway)
-- ------------------------------------------------------------
create or replace function public.kh_user_in_group(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.group_members gm where gm.group_id = p_group_id and gm.user_id = p_user_id);
$$;

create or replace function public.enforce_expense_members()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.kh_user_in_group(new.group_id, new.paid_by) then
    raise exception 'PAYER_NOT_MEMBER';
  end if;
  if not public.kh_user_in_group(new.group_id, new.created_by) then
    raise exception 'NOT_A_MEMBER';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_split_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.kh_user_in_group(new.group_id, new.user_id) then
    raise exception 'PARTICIPANT_NOT_MEMBER';
  end if;
  return new;
end;
$$;

create or replace function public.block_hard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'HARD_DELETE_FORBIDDEN' using hint = 'Financial records are void/reverse only.';
end;
$$;

create or replace function public.block_row_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'IMMUTABLE_RECORD';
end;
$$;

create or replace function public.guard_expense_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_fin_changed boolean;
begin
  if old.status = 'voided' then
    raise exception 'EXPENSE_VOIDED';
  end if;
  if new.group_id <> old.group_id or new.created_by <> old.created_by
     or new.idempotency_key <> old.idempotency_key or new.created_at <> old.created_at then
    raise exception 'IMMUTABLE_RECORD';
  end if;

  v_fin_changed := (new.title, new.amount_paise, new.category_key, new.spent_at, new.paid_by, new.split_mode, new.note)
    is distinct from (old.title, old.amount_paise, old.category_key, old.spent_at, old.paid_by, old.split_mode, old.note);

  if new.status = 'voided' then
    if v_fin_changed or new.version <> old.version then
      raise exception 'IMMUTABLE_RECORD';
    end if;
  elsif v_fin_changed then
    if new.version <> old.version + 1 then
      raise exception 'VERSION_CONFLICT';
    end if;
  elsif new.version <> old.version then
    raise exception 'VERSION_CONFLICT';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Split shares of the current version must sum exactly to the amount (checked at COMMIT).
create or replace function public.check_expense_split_sum()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_sum bigint; v_cnt integer;
begin
  select coalesce(sum(es.share_paise), 0), count(*) into v_sum, v_cnt
  from public.expense_splits es where es.expense_id = new.id and es.version = new.version;
  if v_cnt = 0 then raise exception 'NO_PARTICIPANTS'; end if;
  if v_sum <> new.amount_paise then raise exception 'SPLIT_SUM_MISMATCH'; end if;
  return null;
end;
$$;

drop trigger if exists trg_expenses_members on public.expenses;
create trigger trg_expenses_members before insert or update on public.expenses
  for each row execute function public.enforce_expense_members();
drop trigger if exists trg_expenses_guard on public.expenses;
create trigger trg_expenses_guard before update on public.expenses
  for each row execute function public.guard_expense_update();
drop trigger if exists trg_expenses_no_delete on public.expenses;
create trigger trg_expenses_no_delete before delete on public.expenses
  for each row execute function public.block_hard_delete();
drop trigger if exists trg_expenses_split_sum on public.expenses;
create constraint trigger trg_expenses_split_sum after insert or update on public.expenses
  deferrable initially deferred for each row execute function public.check_expense_split_sum();

drop trigger if exists trg_splits_member on public.expense_splits;
create trigger trg_splits_member before insert on public.expense_splits
  for each row execute function public.enforce_split_member();
drop trigger if exists trg_splits_immutable on public.expense_splits;
create trigger trg_splits_immutable before update on public.expense_splits
  for each row execute function public.block_row_update();
drop trigger if exists trg_splits_no_delete on public.expense_splits;
create trigger trg_splits_no_delete before delete on public.expense_splits
  for each row execute function public.block_hard_delete();

drop trigger if exists trg_revisions_immutable on public.expense_revisions;
create trigger trg_revisions_immutable before update on public.expense_revisions
  for each row execute function public.block_row_update();
drop trigger if exists trg_revisions_no_delete on public.expense_revisions;
create trigger trg_revisions_no_delete before delete on public.expense_revisions
  for each row execute function public.block_hard_delete();

drop trigger if exists trg_receipts_no_delete on public.expense_receipts;
create trigger trg_receipts_no_delete before delete on public.expense_receipts
  for each row execute function public.block_hard_delete();

drop trigger if exists trg_budgets_updated_at on public.group_budgets;
create trigger trg_budgets_updated_at before update on public.group_budgets
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 4. The split engine (exact integer arithmetic, deterministic remainder)
-- ------------------------------------------------------------
-- p_participants: jsonb array of
--   equal   : {"user_id": uuid}
--   amount  : {"user_id": uuid, "amount_paise": integer}
--   percent : {"user_id": uuid, "percent_bps": integer}   (100.00% = 10000)
-- Remainders: equal -> first N participants ordered by user_id get +1 paise.
--             percent -> largest-remainder method, ties broken by user_id.
create or replace function public.compute_splits(
  p_mode text, p_amount_paise bigint, p_participants jsonb
)
returns table (user_id uuid, share_paise bigint, percent_bps integer)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n integer;
  v_distinct integer;
  v_sum bigint;
  v_leftover bigint;
begin
  if p_mode is null or p_mode not in ('equal', 'amount', 'percent') then
    raise exception 'INVALID_SPLIT_MODE';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 or p_amount_paise > 10000000000 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_participants is null or jsonb_typeof(p_participants) <> 'array'
     or jsonb_array_length(p_participants) = 0 then
    raise exception 'NO_PARTICIPANTS';
  end if;
  if jsonb_array_length(p_participants) > 1000 then
    raise exception 'TOO_MANY_PARTICIPANTS';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_participants) e
    where jsonb_typeof(e) <> 'object' or public.try_uuid(e ->> 'user_id') is null
  ) then
    raise exception 'INVALID_PARTICIPANT';
  end if;

  select count(*), count(distinct (e ->> 'user_id')::uuid) into v_n, v_distinct
  from jsonb_array_elements(p_participants) e;
  if v_n <> v_distinct then
    raise exception 'DUPLICATE_PARTICIPANT';
  end if;

  if p_mode = 'equal' then
    return query
      select r.uid,
             (p_amount_paise / v_n) + case when r.rn <= (p_amount_paise % v_n) then 1 else 0 end,
             null::integer
      from (
        select (e ->> 'user_id')::uuid as uid,
               row_number() over (order by (e ->> 'user_id')::uuid) as rn
        from jsonb_array_elements(p_participants) e
      ) r
      order by r.uid;

  elsif p_mode = 'amount' then
    if exists (
      select 1 from jsonb_array_elements(p_participants) e
      where (e ->> 'amount_paise') is null or (e ->> 'amount_paise') !~ '^[0-9]{1,11}$'
    ) then
      raise exception 'INVALID_SPLIT';
    end if;
    select sum((e ->> 'amount_paise')::bigint) into v_sum from jsonb_array_elements(p_participants) e;
    if v_sum <> p_amount_paise then
      raise exception 'SPLIT_SUM_MISMATCH';
    end if;
    return query
      select (e ->> 'user_id')::uuid, (e ->> 'amount_paise')::bigint, null::integer
      from jsonb_array_elements(p_participants) e
      order by 1;

  else -- percent
    if exists (
      select 1 from jsonb_array_elements(p_participants) e
      where (e ->> 'percent_bps') is null or (e ->> 'percent_bps') !~ '^[0-9]{1,5}$'
         or (e ->> 'percent_bps')::integer > 10000
    ) then
      raise exception 'INVALID_SPLIT';
    end if;
    select sum((e ->> 'percent_bps')::bigint) into v_sum from jsonb_array_elements(p_participants) e;
    if v_sum <> 10000 then
      raise exception 'PERCENT_SUM_INVALID';
    end if;
    select p_amount_paise - sum((p_amount_paise * (e ->> 'percent_bps')::bigint) / 10000)
    into v_leftover from jsonb_array_elements(p_participants) e;

    return query
      select x.uid, x.fl + case when x.rk <= v_leftover then 1 else 0 end, x.bps
      from (
        select s.uid, s.bps, s.fl,
               row_number() over (order by s.rem desc, s.uid) as rk
        from (
          select (e ->> 'user_id')::uuid as uid,
                 (e ->> 'percent_bps')::integer as bps,
                 (p_amount_paise * (e ->> 'percent_bps')::bigint) / 10000 as fl,
                 (p_amount_paise * (e ->> 'percent_bps')::bigint) % 10000 as rem
          from jsonb_array_elements(p_participants) e
        ) s
      ) x
      order by x.uid;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 5. Budget alerts (in-app, once per level per month)
-- ------------------------------------------------------------
create or replace function public.kh_check_budgets(p_group_id uuid, p_spent_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_local_month timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_month text;
  b record;
  v_spent bigint;
  v_level integer;
begin
  select g.timezone into v_tz from public.groups g where g.id = p_group_id;
  v_local_month := date_trunc('month', p_spent_at at time zone v_tz);
  v_start := v_local_month at time zone v_tz;
  v_end := (v_local_month + interval '1 month') at time zone v_tz;
  v_month := to_char(v_local_month, 'YYYY-MM');

  for b in select gb.id, gb.category_key, gb.amount_paise from public.group_budgets gb where gb.group_id = p_group_id loop
    select coalesce(sum(e.amount_paise), 0) into v_spent
    from public.expenses e
    where e.group_id = p_group_id and e.status = 'active'
      and e.spent_at >= v_start and e.spent_at < v_end
      and (b.category_key is null or e.category_key = b.category_key);

    v_level := case
      when v_spent >= b.amount_paise then 100
      when v_spent * 100 >= b.amount_paise * 80 then 80
      else 0 end;

    if v_level > 0 then
      perform public.kh_notify_admins(
        p_group_id, 'budget_alert',
        jsonb_build_object('category_key', b.category_key, 'level', v_level,
                           'spent_paise', v_spent, 'budget_paise', b.amount_paise, 'month', v_month),
        null, 'budget' || v_level || ':' || b.id::text || ':' || v_month
      );
    end if;
  end loop;
end;
$$;

-- Shared validation for create/edit. p_expense_id is null on create; on edit,
-- people already on the expense stay valid even if they have left the group since.
create or replace function public.kh_validate_expense_input(
  p_group_id uuid, p_expense_id uuid, p_title text, p_amount_paise bigint, p_category_key text,
  p_spent_at timestamptz, p_paid_by uuid, p_participants jsonb, p_note text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_title is null or char_length(trim(p_title)) not between 1 and 120 then
    raise exception 'INVALID_TITLE';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 or p_amount_paise > 10000000000 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'NOTE_TOO_LONG';
  end if;
  if not exists (select 1 from public.expense_categories c where c.key = p_category_key) then
    raise exception 'INVALID_CATEGORY';
  end if;
  if p_spent_at is null or p_spent_at > now() + interval '1 day' or p_spent_at < now() - interval '10 years' then
    raise exception 'INVALID_DATE';
  end if;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = p_paid_by and gm.status = 'active'
  ) and not (
    p_expense_id is not null and exists (
      select 1 from public.expenses e where e.id = p_expense_id and e.paid_by = p_paid_by
    )
  ) then
    raise exception 'PAYER_NOT_MEMBER';
  end if;

  if p_participants is null or jsonb_typeof(p_participants) <> 'array' then
    raise exception 'NO_PARTICIPANTS';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_participants) pe
    where public.try_uuid(pe ->> 'user_id') is not null
      and not exists (
        select 1 from public.group_members gm
        where gm.group_id = p_group_id and gm.user_id = (pe ->> 'user_id')::uuid and gm.status = 'active'
      )
      and not (
        p_expense_id is not null and exists (
          select 1 from public.expense_splits es
          join public.expenses e on e.id = es.expense_id and e.version = es.version
          where es.expense_id = p_expense_id and es.user_id = (pe ->> 'user_id')::uuid
        )
      )
  ) then
    raise exception 'PARTICIPANT_NOT_MEMBER';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 6. Write RPCs
-- ------------------------------------------------------------
create or replace function public.create_expense(
  p_group_id uuid,
  p_idempotency_key uuid,
  p_title text,
  p_amount_paise bigint,
  p_category_key text,
  p_spent_at timestamptz,
  p_paid_by uuid,
  p_split_mode text,
  p_participants jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_id uuid;
  v_name text;
begin
  v_uid := public.kh_require_role(p_group_id, 'member');
  perform public.kh_require_active_group(p_group_id);
  if p_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  -- Idempotent replay: same key from same user in same group returns the original expense.
  select e.id into v_id from public.expenses e
  where e.group_id = p_group_id and e.created_by = v_uid and e.idempotency_key = p_idempotency_key;
  if v_id is not null then
    return v_id;
  end if;

  perform public.kh_rate_limit('create_expense', 300, 3600);
  perform public.kh_validate_expense_input(
    p_group_id, null, p_title, p_amount_paise, p_category_key, p_spent_at, p_paid_by, p_participants, p_note);

  -- compute first so invalid splits fail before anything is written
  perform 1 from public.compute_splits(p_split_mode, p_amount_paise, p_participants);

  insert into public.expenses (
    group_id, title, amount_paise, category_key, spent_at, paid_by, split_mode, note,
    idempotency_key, created_by, updated_by
  )
  values (
    p_group_id, trim(p_title), p_amount_paise, p_category_key, p_spent_at, p_paid_by, p_split_mode,
    nullif(trim(coalesce(p_note, '')), ''), p_idempotency_key, v_uid, v_uid
  )
  on conflict (group_id, created_by, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then  -- lost a race with an identical concurrent request
    select e.id into v_id from public.expenses e
    where e.group_id = p_group_id and e.created_by = v_uid and e.idempotency_key = p_idempotency_key;
    return v_id;
  end if;

  insert into public.expense_splits (expense_id, group_id, version, user_id, share_paise, percent_bps)
  select v_id, p_group_id, 1, s.user_id, s.share_paise, s.percent_bps
  from public.compute_splits(p_split_mode, p_amount_paise, p_participants) s;

  perform public.kh_audit(p_group_id, 'expense.created', 'expenses', v_id::text,
    jsonb_build_object('title', trim(p_title), 'amount_paise', p_amount_paise, 'paid_by', p_paid_by,
                       'split_mode', p_split_mode, 'category_key', p_category_key));

  select p.full_name into v_name from public.profiles p where p.id = v_uid;
  perform public.kh_notify(
    es.user_id, p_group_id, 'expense_added',
    jsonb_build_object('title', trim(p_title), 'amount_paise', p_amount_paise,
                       'share_paise', es.share_paise, 'name', v_name, 'expense_id', v_id), null)
  from public.expense_splits es
  where es.expense_id = v_id and es.version = 1 and es.user_id <> v_uid and es.share_paise > 0;

  perform public.kh_check_budgets(p_group_id, p_spent_at);
  return v_id;
end;
$$;

create or replace function public.edit_expense(
  p_expense_id uuid,
  p_expected_version integer,
  p_reason text,
  p_title text,
  p_amount_paise bigint,
  p_category_key text,
  p_spent_at timestamptz,
  p_paid_by uuid,
  p_split_mode text,
  p_participants jsonb,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_exp public.expenses%rowtype;
  v_role text;
  v_new_version integer;
  v_name text;
  v_old_splits jsonb;
begin
  select * into v_exp from public.expenses e where e.id = p_expense_id for update;
  if not found then
    raise exception 'EXPENSE_NOT_FOUND';
  end if;
  v_uid := public.kh_require_role(v_exp.group_id, 'member');
  perform public.kh_require_active_group(v_exp.group_id);

  select gm.role into v_role from public.group_members gm
  where gm.group_id = v_exp.group_id and gm.user_id = v_uid and gm.status = 'active';
  if v_exp.created_by <> v_uid and v_role not in ('owner', 'admin') then
    raise exception 'EDIT_NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_exp.status <> 'active' then
    raise exception 'EXPENSE_VOIDED';
  end if;
  if p_expected_version is distinct from v_exp.version then
    raise exception 'VERSION_CONFLICT';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 or char_length(p_reason) > 300 then
    raise exception 'REASON_REQUIRED';
  end if;

  perform public.kh_rate_limit('edit_expense', 200, 3600);
  perform public.kh_validate_expense_input(
    v_exp.group_id, p_expense_id, p_title, p_amount_paise, p_category_key, p_spent_at, p_paid_by, p_participants, p_note);
  perform 1 from public.compute_splits(p_split_mode, p_amount_paise, p_participants);

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', es.user_id, 'share_paise', es.share_paise, 'percent_bps', es.percent_bps) order by es.user_id), '[]'::jsonb)
  into v_old_splits
  from public.expense_splits es where es.expense_id = v_exp.id and es.version = v_exp.version;

  insert into public.expense_revisions (expense_id, group_id, version, change_type, reason, snapshot, changed_by)
  values (v_exp.id, v_exp.group_id, v_exp.version, 'edit', trim(p_reason),
    jsonb_build_object(
      'title', v_exp.title, 'amount_paise', v_exp.amount_paise, 'category_key', v_exp.category_key,
      'spent_at', v_exp.spent_at, 'paid_by', v_exp.paid_by, 'split_mode', v_exp.split_mode,
      'note', v_exp.note, 'splits', v_old_splits),
    v_uid);

  v_new_version := v_exp.version + 1;

  update public.expenses
  set title = trim(p_title), amount_paise = p_amount_paise, category_key = p_category_key,
      spent_at = p_spent_at, paid_by = p_paid_by, split_mode = p_split_mode,
      note = nullif(trim(coalesce(p_note, '')), ''), version = v_new_version, updated_by = v_uid
  where id = v_exp.id;

  insert into public.expense_splits (expense_id, group_id, version, user_id, share_paise, percent_bps)
  select v_exp.id, v_exp.group_id, v_new_version, s.user_id, s.share_paise, s.percent_bps
  from public.compute_splits(p_split_mode, p_amount_paise, p_participants) s;

  perform public.kh_audit(v_exp.group_id, 'expense.edited', 'expenses', v_exp.id::text,
    jsonb_build_object('version', v_new_version, 'reason', trim(p_reason),
      'old_amount_paise', v_exp.amount_paise, 'new_amount_paise', p_amount_paise,
      'old_title', v_exp.title, 'new_title', trim(p_title)));

  select p.full_name into v_name from public.profiles p where p.id = v_uid;
  perform public.kh_notify(u.user_id, v_exp.group_id, 'expense_edited',
    jsonb_build_object('title', trim(p_title), 'name', v_name, 'expense_id', v_exp.id), null)
  from (
    select es.user_id from public.expense_splits es
    where es.expense_id = v_exp.id and es.version in (v_exp.version, v_new_version)
    union
    select v_exp.paid_by union select p_paid_by
  ) u
  where u.user_id <> v_uid;

  perform public.kh_check_budgets(v_exp.group_id, p_spent_at);
  return v_new_version;
end;
$$;

create or replace function public.void_expense(
  p_expense_id uuid, p_expected_version integer, p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_exp public.expenses%rowtype;
  v_role text;
  v_splits jsonb;
  v_name text;
begin
  select * into v_exp from public.expenses e where e.id = p_expense_id for update;
  if not found then
    raise exception 'EXPENSE_NOT_FOUND';
  end if;
  v_uid := public.kh_require_role(v_exp.group_id, 'member');
  perform public.kh_require_active_group(v_exp.group_id);

  select gm.role into v_role from public.group_members gm
  where gm.group_id = v_exp.group_id and gm.user_id = v_uid and gm.status = 'active';
  if v_exp.created_by <> v_uid and v_role not in ('owner', 'admin') then
    raise exception 'EDIT_NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_exp.status <> 'active' then
    raise exception 'EXPENSE_VOIDED';
  end if;
  if p_expected_version is distinct from v_exp.version then
    raise exception 'VERSION_CONFLICT';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 or char_length(p_reason) > 300 then
    raise exception 'REASON_REQUIRED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', es.user_id, 'share_paise', es.share_paise, 'percent_bps', es.percent_bps) order by es.user_id), '[]'::jsonb)
  into v_splits
  from public.expense_splits es where es.expense_id = v_exp.id and es.version = v_exp.version;

  insert into public.expense_revisions (expense_id, group_id, version, change_type, reason, snapshot, changed_by)
  values (v_exp.id, v_exp.group_id, v_exp.version, 'void', trim(p_reason),
    jsonb_build_object(
      'title', v_exp.title, 'amount_paise', v_exp.amount_paise, 'category_key', v_exp.category_key,
      'spent_at', v_exp.spent_at, 'paid_by', v_exp.paid_by, 'split_mode', v_exp.split_mode,
      'note', v_exp.note, 'splits', v_splits),
    v_uid);

  update public.expenses
  set status = 'voided', void_reason = trim(p_reason), voided_at = now(), voided_by = v_uid, updated_by = v_uid
  where id = v_exp.id;

  perform public.kh_audit(v_exp.group_id, 'expense.voided', 'expenses', v_exp.id::text,
    jsonb_build_object('reason', trim(p_reason), 'amount_paise', v_exp.amount_paise, 'title', v_exp.title));

  select p.full_name into v_name from public.profiles p where p.id = v_uid;
  perform public.kh_notify(es.user_id, v_exp.group_id, 'expense_voided',
    jsonb_build_object('title', v_exp.title, 'name', v_name, 'expense_id', v_exp.id), null)
  from public.expense_splits es
  where es.expense_id = v_exp.id and es.version = v_exp.version and es.user_id <> v_uid;
end;
$$;

create or replace function public.add_expense_receipt(
  p_expense_id uuid, p_storage_path text, p_file_name text, p_mime_type text, p_size_bytes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_exp public.expenses%rowtype;
  v_role text;
  v_id uuid;
begin
  select * into v_exp from public.expenses e where e.id = p_expense_id;
  if not found then
    raise exception 'EXPENSE_NOT_FOUND';
  end if;
  v_uid := public.kh_require_role(v_exp.group_id, 'member');
  perform public.kh_require_active_group(v_exp.group_id);
  select gm.role into v_role from public.group_members gm
  where gm.group_id = v_exp.group_id and gm.user_id = v_uid and gm.status = 'active';
  if v_exp.status <> 'active' then
    raise exception 'EXPENSE_VOIDED';
  end if;
  if v_uid not in (v_exp.created_by, v_exp.paid_by) and v_role not in ('owner', 'admin') then
    raise exception 'EDIT_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_storage_path is null or left(p_storage_path, char_length(v_exp.group_id::text || '/' || v_exp.id::text || '/'))
       <> v_exp.group_id::text || '/' || v_exp.id::text || '/' then
    raise exception 'INVALID_RECEIPT_PATH';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'INVALID_FILE_TYPE';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 5242880 then
    raise exception 'FILE_TOO_LARGE';
  end if;
  if (select count(*) from public.expense_receipts r where r.expense_id = p_expense_id and r.removed_at is null) >= 5 then
    raise exception 'TOO_MANY_RECEIPTS';
  end if;
  perform public.kh_rate_limit('add_receipt', 60, 3600);

  insert into public.expense_receipts (expense_id, group_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (p_expense_id, v_exp.group_id, p_storage_path, left(p_file_name, 200), p_mime_type, p_size_bytes, v_uid)
  returning id into v_id;

  perform public.kh_audit(v_exp.group_id, 'expense.receipt_added', 'expenses', p_expense_id::text,
    jsonb_build_object('receipt_id', v_id, 'file_name', left(p_file_name, 200)));
  return v_id;
end;
$$;

create or replace function public.remove_expense_receipt(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_r public.expense_receipts%rowtype;
  v_role text;
begin
  select * into v_r from public.expense_receipts r where r.id = p_receipt_id for update;
  if not found then
    raise exception 'RECEIPT_NOT_FOUND';
  end if;
  v_uid := public.kh_require_role(v_r.group_id, 'member');
  perform public.kh_require_active_group(v_r.group_id);
  select gm.role into v_role from public.group_members gm
  where gm.group_id = v_r.group_id and gm.user_id = v_uid and gm.status = 'active';
  if v_r.uploaded_by <> v_uid and v_role not in ('owner', 'admin') then
    raise exception 'EDIT_NOT_ALLOWED' using errcode = '42501';
  end if;
  update public.expense_receipts set removed_at = coalesce(removed_at, now()), removed_by = v_uid where id = p_receipt_id;
  perform public.kh_audit(v_r.group_id, 'expense.receipt_removed', 'expenses', v_r.expense_id::text,
    jsonb_build_object('receipt_id', p_receipt_id));
end;
$$;

-- ------------------------------------------------------------
-- 7. Budgets
-- ------------------------------------------------------------
-- p_amount_paise = 0 removes the budget. category NULL = overall monthly budget.
create or replace function public.set_group_budget(
  p_group_id uuid, p_category_key text, p_amount_paise bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid;
begin
  v_uid := public.kh_require_role(p_group_id, 'admin');
  perform public.kh_require_active_group(p_group_id);
  if p_category_key is not null and not exists (select 1 from public.expense_categories c where c.key = p_category_key) then
    raise exception 'INVALID_CATEGORY';
  end if;
  if p_amount_paise is null or p_amount_paise < 0 or p_amount_paise > 10000000000 then
    raise exception 'INVALID_AMOUNT';
  end if;

  if p_amount_paise = 0 then
    delete from public.group_budgets gb
    where gb.group_id = p_group_id and coalesce(gb.category_key, '__all__') = coalesce(p_category_key, '__all__');
  else
    insert into public.group_budgets (group_id, category_key, amount_paise, created_by, updated_by)
    values (p_group_id, p_category_key, p_amount_paise, v_uid, v_uid)
    on conflict (group_id, coalesce(category_key, '__all__'))
    do update set amount_paise = excluded.amount_paise, updated_by = v_uid;
  end if;

  perform public.kh_audit(p_group_id, 'budget.set', 'group_budgets', coalesce(p_category_key, 'all'),
    jsonb_build_object('category_key', p_category_key, 'amount_paise', p_amount_paise));
end;
$$;

create or replace function public.list_group_budgets(p_group_id uuid)
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
      'id', gb.id, 'category_key', gb.category_key, 'amount_paise', gb.amount_paise
    ) order by gb.category_key nulls first)
    from public.group_budgets gb where gb.group_id = p_group_id
  ), '[]'::jsonb);
end;
$$;

-- ------------------------------------------------------------
-- 8. Read RPCs
-- ------------------------------------------------------------
create or replace function public.list_expense_categories()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', c.key, 'name_en', c.name_en, 'name_hi', c.name_hi) order by c.sort_order), '[]'::jsonb)
  from public.expense_categories c
  where (select auth.uid()) is not null;
$$;

create or replace function public.list_expenses(
  p_group_id uuid,
  p_limit integer default 30,
  p_before_ts timestamptz default null,
  p_before_id uuid default null,
  p_search text default null,
  p_category_key text default null,
  p_member_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.kh_require_role(p_group_id, 'member');
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_rows jsonb;
  v_count integer;
  v_search text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  select coalesce(jsonb_agg(t.j order by t.spent_at desc, t.id desc), '[]'::jsonb), count(*)
  into v_rows, v_count
  from (
    select e.id, e.spent_at, jsonb_build_object(
      'id', e.id, 'title', e.title, 'amount_paise', e.amount_paise, 'category_key', e.category_key,
      'spent_at', e.spent_at, 'paid_by', e.paid_by, 'paid_by_name', pp.full_name,
      'split_mode', e.split_mode, 'status', e.status, 'version', e.version, 'note', e.note,
      'created_by', e.created_by, 'created_at', e.created_at,
      'my_share_paise', (select es.share_paise from public.expense_splits es
                         where es.expense_id = e.id and es.version = e.version and es.user_id = v_uid),
      'participant_count', (select count(*) from public.expense_splits es
                            where es.expense_id = e.id and es.version = e.version),
      'receipt_count', (select count(*) from public.expense_receipts r
                        where r.expense_id = e.id and r.removed_at is null)
    ) as j
    from public.expenses e
    join public.profiles pp on pp.id = e.paid_by
    where e.group_id = p_group_id
      and (p_status is null or e.status = p_status)
      and (p_category_key is null or e.category_key = p_category_key)
      and (p_from is null or e.spent_at >= p_from)
      and (p_to is null or e.spent_at < p_to)
      and (v_search is null or position(v_search in lower(e.title)) > 0)
      and (p_member_id is null or e.paid_by = p_member_id or exists (
            select 1 from public.expense_splits es
            where es.expense_id = e.id and es.version = e.version and es.user_id = p_member_id))
      and (p_before_ts is null or p_before_id is null or (e.spent_at, e.id) < (p_before_ts, p_before_id))
    order by e.spent_at desc, e.id desc
    limit v_limit + 1
  ) t;

  if v_count > v_limit then
    v_rows := v_rows - v_limit;  -- drop the sentinel row
    return jsonb_build_object(
      'items', v_rows,
      'next', jsonb_build_object(
        'ts', v_rows -> (v_limit - 1) ->> 'spent_at',
        'id', v_rows -> (v_limit - 1) ->> 'id')
    );
  end if;
  return jsonb_build_object('items', v_rows, 'next', null);
end;
$$;

create or replace function public.get_expense(p_expense_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_exp public.expenses%rowtype;
begin
  select * into v_exp from public.expenses e where e.id = p_expense_id;
  if not found then
    raise exception 'EXPENSE_NOT_FOUND';
  end if;
  perform public.kh_require_role(v_exp.group_id, 'member');

  return jsonb_build_object(
    'expense', jsonb_build_object(
      'id', v_exp.id, 'group_id', v_exp.group_id, 'title', v_exp.title, 'amount_paise', v_exp.amount_paise,
      'category_key', v_exp.category_key, 'spent_at', v_exp.spent_at, 'paid_by', v_exp.paid_by,
      'paid_by_name', (select p.full_name from public.profiles p where p.id = v_exp.paid_by),
      'split_mode', v_exp.split_mode, 'note', v_exp.note, 'status', v_exp.status, 'version', v_exp.version,
      'created_by', v_exp.created_by,
      'created_by_name', (select p.full_name from public.profiles p where p.id = v_exp.created_by),
      'created_at', v_exp.created_at, 'updated_at', v_exp.updated_at,
      'void_reason', v_exp.void_reason, 'voided_at', v_exp.voided_at,
      'voided_by_name', (select p.full_name from public.profiles p where p.id = v_exp.voided_by)
    ),
    'splits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', es.user_id, 'full_name', p.full_name, 'share_paise', es.share_paise,
        'percent_bps', es.percent_bps) order by es.user_id)
      from public.expense_splits es join public.profiles p on p.id = es.user_id
      where es.expense_id = v_exp.id and es.version = v_exp.version
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'file_name', r.file_name, 'mime_type', r.mime_type, 'size_bytes', r.size_bytes,
        'storage_path', r.storage_path, 'uploaded_by', r.uploaded_by, 'created_at', r.created_at) order by r.created_at)
      from public.expense_receipts r where r.expense_id = v_exp.id and r.removed_at is null
    ), '[]'::jsonb),
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rv.id, 'version', rv.version, 'change_type', rv.change_type, 'reason', rv.reason,
        'changed_by', rv.changed_by, 'changed_by_name', p.full_name, 'created_at', rv.created_at,
        'snapshot', rv.snapshot) order by rv.id desc)
      from public.expense_revisions rv join public.profiles p on p.id = rv.changed_by
      where rv.expense_id = v_exp.id
    ), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------
-- 9. RLS (direct reads stay membership-scoped; no client writes)
-- ------------------------------------------------------------
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.expense_revisions enable row level security;
alter table public.expense_receipts enable row level security;
alter table public.group_budgets enable row level security;

drop policy if exists expense_categories_read on public.expense_categories;
create policy expense_categories_read on public.expense_categories for select to authenticated using (true);
drop policy if exists expenses_select_members on public.expenses;
create policy expenses_select_members on public.expenses for select to authenticated
  using (public.is_group_member(group_id));
drop policy if exists expense_splits_select_members on public.expense_splits;
create policy expense_splits_select_members on public.expense_splits for select to authenticated
  using (public.is_group_member(group_id));
drop policy if exists expense_revisions_select_members on public.expense_revisions;
create policy expense_revisions_select_members on public.expense_revisions for select to authenticated
  using (public.is_group_member(group_id));
drop policy if exists expense_receipts_select_members on public.expense_receipts;
create policy expense_receipts_select_members on public.expense_receipts for select to authenticated
  using (public.is_group_member(group_id));
drop policy if exists group_budgets_select_members on public.group_budgets;
create policy group_budgets_select_members on public.group_budgets for select to authenticated
  using (public.is_group_member(group_id));

revoke all on public.expense_categories, public.expenses, public.expense_splits, public.expense_revisions,
  public.expense_receipts, public.group_budgets from anon, authenticated;
grant select on public.expense_categories, public.expenses, public.expense_splits, public.expense_revisions,
  public.expense_receipts, public.group_budgets to authenticated;

-- ------------------------------------------------------------
-- 10. Function privileges
-- ------------------------------------------------------------
revoke all on function public.kh_user_in_group(uuid, uuid) from public, anon, authenticated;
revoke all on function public.enforce_expense_members() from public, anon, authenticated;
revoke all on function public.enforce_split_member() from public, anon, authenticated;
revoke all on function public.block_hard_delete() from public, anon, authenticated;
revoke all on function public.block_row_update() from public, anon, authenticated;
revoke all on function public.guard_expense_update() from public, anon, authenticated;
revoke all on function public.check_expense_split_sum() from public, anon, authenticated;
revoke all on function public.kh_check_budgets(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.kh_validate_expense_input(uuid, uuid, text, bigint, text, timestamptz, uuid, jsonb, text)
  from public, anon, authenticated;

revoke all on function public.compute_splits(text, bigint, jsonb) from public, anon;
revoke all on function public.create_expense(uuid, uuid, text, bigint, text, timestamptz, uuid, text, jsonb, text) from public, anon;
revoke all on function public.edit_expense(uuid, integer, text, text, bigint, text, timestamptz, uuid, text, jsonb, text) from public, anon;
revoke all on function public.void_expense(uuid, integer, text) from public, anon;
revoke all on function public.add_expense_receipt(uuid, text, text, text, integer) from public, anon;
revoke all on function public.remove_expense_receipt(uuid) from public, anon;
revoke all on function public.set_group_budget(uuid, text, bigint) from public, anon;
revoke all on function public.list_group_budgets(uuid) from public, anon;
revoke all on function public.list_expense_categories() from public, anon;
revoke all on function public.list_expenses(uuid, integer, timestamptz, uuid, text, text, uuid, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.get_expense(uuid) from public, anon;

grant execute on function public.compute_splits(text, bigint, jsonb) to authenticated;
grant execute on function public.create_expense(uuid, uuid, text, bigint, text, timestamptz, uuid, text, jsonb, text) to authenticated;
grant execute on function public.edit_expense(uuid, integer, text, text, bigint, text, timestamptz, uuid, text, jsonb, text) to authenticated;
grant execute on function public.void_expense(uuid, integer, text) to authenticated;
grant execute on function public.add_expense_receipt(uuid, text, text, text, integer) to authenticated;
grant execute on function public.remove_expense_receipt(uuid) to authenticated;
grant execute on function public.set_group_budget(uuid, text, bigint) to authenticated;
grant execute on function public.list_group_budgets(uuid) to authenticated;
grant execute on function public.list_expense_categories() to authenticated;
grant execute on function public.list_expenses(uuid, integer, timestamptz, uuid, text, text, uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.get_expense(uuid) to authenticated;

commit;
