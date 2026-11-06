-- 0019: (1) closing up to today cuts at the moment of closing, so expenses added later the same day work;
--       (2) expenses always get the current date/time (no choosing or back-dating); an existing expense keeps its time.
begin;

create or replace function public.kh_close_cut(p_group_id uuid, p_period_end date)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare g public.groups%rowtype; v_cut timestamptz; v_prev timestamptz;
begin
  select * into g from public.groups where id = p_group_id;
  if p_period_end is null or p_period_end > (now() at time zone g.timezone)::date then raise exception 'INVALID_CLOSE_DATE'; end if;
  -- closing "up to today" cuts at THIS moment, so expenses added later the same day belong to the new period
  v_cut := least(((p_period_end + 1)::timestamp at time zone g.timezone), now());
  select max(c.cut_at) into v_prev from public.period_closes c where c.group_id = p_group_id and c.status = 'closed';
  if v_prev is not null and v_cut <= v_prev then raise exception 'INVALID_CLOSE_DATE'; end if;
  if not exists (select 1 from public.expenses e where e.group_id = p_group_id and e.status = 'active'
                 and e.spent_at < v_cut and (v_prev is null or e.spent_at >= v_prev)) then raise exception 'NOTHING_TO_CLOSE'; end if;
  return v_cut;
end $$;

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
  -- people can only record expenses they paid themselves
  if p_paid_by is distinct from v_uid then
    raise exception 'PAYER_MUST_BE_YOU' using errcode = '42501';
  end if;
  -- date and time are always "now": nobody can choose or back-date an expense
  p_spent_at := now();
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

  -- the payer of an expense can never be changed (nobody can re-assign who paid)
  if p_paid_by is distinct from v_exp.paid_by then
    raise exception 'PAYER_CHANGE_NOT_ALLOWED' using errcode = '42501';
  end if;
  -- the date and time of an expense never change
  p_spent_at := v_exp.spent_at;

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

commit;
