-- ============================================================
-- KHATAFY | 0008: 1-hour edit window + date-range statement
-- ============================================================
begin;

-- 1. An expense can only be EDITED during the first hour after it was added.
--    (Cancelling/voiding stays possible at any time; the history is kept either way.)
--    The window length must match EDIT_WINDOW_MINUTES in packages/core/src/dates.ts.
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
    if now() > old.created_at + interval '60 minutes' then
      raise exception 'EDIT_WINDOW_EXPIRED' using errcode = '42501';
    end if;
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

-- 2. Statement for a month / custom date range: every expense with who paid and who it was split on.
--    Dates are interpreted in the group's time zone (inclusive). Voided expenses are left out.
create or replace function public.get_group_statement(p_group_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_name text;
  v_from timestamptz;
  v_to timestamptz;
  v_limit constant integer := 3000;
  v_count integer;
  v_exp jsonb;
  v_members jsonb;
  v_pay jsonb;
  v_total bigint;
begin
  perform public.kh_require_role(p_group_id, 'member');
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  if p_to - p_from > 1100 then
    raise exception 'DATE_RANGE_TOO_LARGE';
  end if;
  select g.timezone, g.name into v_tz, v_name from public.groups g where g.id = p_group_id;
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;

  with ex as (
    select e.* from public.expenses e
    where e.group_id = p_group_id and e.status = 'active' and e.spent_at >= v_from and e.spent_at < v_to
    order by e.spent_at, e.id
    limit v_limit + 1
  )
  select count(*) into v_count from ex;

  with ex as (
    select e.* from public.expenses e
    where e.group_id = p_group_id and e.status = 'active' and e.spent_at >= v_from and e.spent_at < v_to
    order by e.spent_at, e.id
    limit v_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', ex.id, 'title', ex.title, 'category_key', ex.category_key, 'spent_at', ex.spent_at,
      'amount_paise', ex.amount_paise, 'paid_by', ex.paid_by,
      'paid_by_name', (select p.full_name from public.profiles p where p.id = ex.paid_by),
      'note', ex.note, 'version', ex.version, 'split_mode', ex.split_mode,
      'splits', coalesce((
        select jsonb_agg(jsonb_build_object('user_id', es.user_id, 'full_name', p.full_name, 'share_paise', es.share_paise)
                         order by p.full_name, es.user_id)
        from public.expense_splits es join public.profiles p on p.id = es.user_id
        where es.expense_id = ex.id and es.version = ex.version), '[]'::jsonb)
    ) order by ex.spent_at, ex.id), '[]'::jsonb),
    coalesce(sum(ex.amount_paise), 0)
  into v_exp, v_total
  from ex;

  with ex as (
    select e.id, e.paid_by, e.amount_paise, e.version from public.expenses e
    where e.group_id = p_group_id and e.status = 'active' and e.spent_at >= v_from and e.spent_at < v_to
    order by e.spent_at, e.id limit v_limit
  ), paid as (
    select ex.paid_by as user_id, sum(ex.amount_paise) as paid_paise from ex group by ex.paid_by
  ), shares as (
    select es.user_id, sum(es.share_paise) as share_paise
    from ex join public.expense_splits es on es.expense_id = ex.id and es.version = ex.version group by es.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', m.user_id, 'full_name', p.full_name, 'status', m.status,
      'paid_paise', coalesce(paid.paid_paise, 0), 'share_paise', coalesce(shares.share_paise, 0)
    ) order by p.full_name, m.user_id), '[]'::jsonb)
  into v_members
  from public.group_members m
  join public.profiles p on p.id = m.user_id
  left join paid on paid.user_id = m.user_id
  left join shares on shares.user_id = m.user_id
  where m.group_id = p_group_id
    and (m.status = 'active' or paid.paid_paise is not null or shares.share_paise is not null);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pm.id, 'from_user', pm.from_user, 'from_name', pf.full_name, 'to_user', pm.to_user, 'to_name', pt.full_name,
      'amount_paise', pm.amount_paise, 'paid_at', pm.paid_at, 'method', pm.method
    ) order by pm.paid_at, pm.id), '[]'::jsonb)
  into v_pay
  from public.payments pm
  join public.profiles pf on pf.id = pm.from_user
  join public.profiles pt on pt.id = pm.to_user
  where pm.group_id = p_group_id and pm.status = 'confirmed' and pm.paid_at >= v_from and pm.paid_at < v_to;

  return jsonb_build_object(
    'group_name', v_name, 'timezone', v_tz, 'from', p_from, 'to', p_to,
    'total_paise', v_total, 'expense_count', least(v_count, v_limit), 'truncated', v_count > v_limit,
    'expenses', v_exp, 'members', v_members, 'payments', v_pay
  );
end;
$$;

revoke all on function public.get_group_statement(uuid, date, date) from public, anon;
grant execute on function public.get_group_statement(uuid, date, date) to authenticated;

commit;
