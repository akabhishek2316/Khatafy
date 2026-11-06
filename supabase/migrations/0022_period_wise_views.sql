-- 0022: period-wise (close-wise) views next to the monthly ones.
--  * list_period_closes now also returns cut_at and from_at (the exact boundaries of every period)
--  * get_group_report_range / get_group_statement_range: same as the monthly versions but for any [from, to) timestamps
begin;

create or replace function public.list_period_closes(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.kh_require_role(p_group_id, 'member');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'period_end', x.period_end, 'closed_at', x.closed_at,
             'closed_by_name', x.full_name, 'summary', x.summary, 'cut_at', x.cut_at, 'from_at', x.from_at) order by x.cut_at desc)
    from (
      select c.id, c.period_end, c.closed_at, c.summary, c.cut_at, p.full_name,
             lag(c.cut_at) over (order by c.cut_at) as from_at
      from public.period_closes c join public.profiles p on p.id = c.requested_by
      where c.group_id = p_group_id and c.status = 'closed'
    ) x), '[]'::jsonb);
end $$;

create or replace function public.get_group_report_range(p_group_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_local_month timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_total bigint;
  v_count bigint;
  v_by_cat jsonb;
  v_by_member jsonb;
  v_monthly jsonb;
  v_budgets jsonb;
begin
  perform public.kh_require_role(p_group_id, 'member');
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'INVALID_DATE';
  end if;
  select g.timezone into v_tz from public.groups g where g.id = p_group_id;
  v_start := p_from;
  v_end := p_to;
  v_local_month := date_trunc('month', (p_to - interval '1 second') at time zone v_tz);

  select coalesce(sum(e.amount_paise), 0), count(*) into v_total, v_count
  from public.expenses e
  where e.group_id = p_group_id and e.status = 'active' and e.spent_at >= v_start and e.spent_at < v_end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'category_key', c.category_key, 'total_paise', c.total, 'count', c.cnt) order by c.total desc), '[]'::jsonb)
  into v_by_cat
  from (
    select e.category_key, sum(e.amount_paise) as total, count(*) as cnt
    from public.expenses e
    where e.group_id = p_group_id and e.status = 'active' and e.spent_at >= v_start and e.spent_at < v_end
    group by e.category_key
  ) c;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', b ->> 'user_id', 'full_name', b ->> 'full_name', 'status', b ->> 'status',
    'paid_paise', (b ->> 'paid_paise')::bigint, 'share_paise', (b ->> 'share_paise')::bigint,
    'net_paise', (b ->> 'net_paise')::bigint)), '[]'::jsonb)
  into v_by_member
  from jsonb_array_elements(public.get_group_balances(p_group_id, v_start, v_end)) b;

  select coalesce(jsonb_agg(jsonb_build_object('month', m.label, 'total_paise', m.total) order by m.label), '[]'::jsonb)
  into v_monthly
  from (
    select to_char(ms.m_local, 'YYYY-MM') as label,
           coalesce((
             select sum(e.amount_paise) from public.expenses e
             where e.group_id = p_group_id and e.status = 'active'
               and e.spent_at >= (ms.m_local at time zone v_tz)
               and e.spent_at < ((ms.m_local + interval '1 month') at time zone v_tz)
           ), 0) as total
    from (select v_local_month - (n || ' month')::interval as m_local from generate_series(0, 5) n) ms
  ) m;

  select coalesce(jsonb_agg(jsonb_build_object(
    'category_key', gb.category_key, 'amount_paise', gb.amount_paise,
    'spent_paise', case when gb.category_key is null then v_total else coalesce((
        select sum(e.amount_paise) from public.expenses e
        where e.group_id = p_group_id and e.status = 'active' and e.category_key = gb.category_key
          and e.spent_at >= v_start and e.spent_at < v_end), 0) end
  ) order by gb.category_key nulls first), '[]'::jsonb)
  into v_budgets
  from public.group_budgets gb where gb.group_id = p_group_id;

  return jsonb_build_object(
    'month', to_char(v_local_month, 'YYYY-MM'), 'from', v_start, 'to', v_end, 'timezone', v_tz,
    'total_paise', v_total, 'expense_count', v_count,
    'by_category', v_by_cat, 'by_member', v_by_member, 'monthly_totals', v_monthly, 'budgets', v_budgets
  );
end;
$$;

create or replace function public.get_group_statement_range(p_group_id uuid, p_from timestamptz, p_to timestamptz)
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
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  if p_to - p_from > interval '1100 days' then
    raise exception 'DATE_RANGE_TOO_LARGE';
  end if;
  select g.timezone, g.name into v_tz, v_name from public.groups g where g.id = p_group_id;
  v_from := p_from;
  v_to := p_to;

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
    'group_name', v_name, 'timezone', v_tz, 'from', (p_from at time zone v_tz)::date, 'to', ((p_to - interval '1 second') at time zone v_tz)::date,
    'total_paise', v_total, 'expense_count', least(v_count, v_limit), 'truncated', v_count > v_limit,
    'expenses', v_exp, 'members', v_members, 'payments', v_pay
  );
end;
$$;

revoke all on function public.get_group_report_range(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.get_group_statement_range(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_group_report_range(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_group_statement_range(uuid, timestamptz, timestamptz) to authenticated;

commit;
