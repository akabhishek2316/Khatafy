-- 0016: Close = a marker + saved summary (NOTHING is deleted when you close).
-- * Admin closes up to a date, after a confirmation. No waiting / objection window.
-- * Closed periods are read-only; Expenses shows only the open (not yet closed) expenses.
-- * Balances show the current position: only records after the last close, plus any earlier unpaid dues as a separate "earlier balance".
-- * Old data is removed by a monthly cleanup on the LAST DAY of each month: everything older than the last 12 months
--   (expenses, payments, receipts, closed-period summaries) is deleted; unpaid dues are carried so balances stay correct.
begin;

-- ---------- 0. Remove the review/objection machinery of 0014 ----------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('khatafy-close-finalize'); exception when others then null; end;
    begin perform cron.unschedule('khatafy-retention-purge'); exception when others then null; end;
  end if;
end $$;
drop function if exists public.kh_finalize_due_closes();
drop function if exists public.kh_finalize_period_close(uuid);
drop function if exists public.request_period_close(uuid, date);
drop function if exists public.object_period_close(uuid, text);
drop function if exists public.withdraw_period_objection(uuid);
drop function if exists public.cancel_period_close(uuid);
drop function if exists public.list_period_closes(uuid);
drop table if exists public.period_close_objections;
update public.period_closes set status = 'cancelled' where status = 'pending';

-- ---------- 1. Closed periods are read-only ----------
create or replace function public.guard_closed_period()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cut timestamptz;
begin
  if current_setting('khatafy.purge', true) = 'on' then return new; end if;
  select max(c.cut_at) into v_cut from public.period_closes c where c.group_id = new.group_id and c.status = 'closed';
  if v_cut is null then return new; end if;
  if tg_table_name = 'expenses' then
    if new.spent_at < v_cut then raise exception 'PERIOD_CLOSED'; end if;
    if tg_op = 'UPDATE' then
      if old.spent_at < v_cut then raise exception 'PERIOD_CLOSED'; end if;
    end if;
  else
    if tg_op = 'INSERT' then
      if new.paid_at < v_cut then raise exception 'PERIOD_CLOSED'; end if;
    elsif new.paid_at is distinct from old.paid_at and new.paid_at < v_cut then
      raise exception 'PERIOD_CLOSED';
    end if;
  end if;
  return new;
end $$;

-- ---------- 2. Summary of one period (since the previous close) + dues after it ----------
create or replace function public.kh_close_summary(p_group_id uuid, p_cut timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_prev timestamptz;
begin
  select max(c.cut_at) into v_prev from public.period_closes c where c.group_id = p_group_id and c.status = 'closed' and c.cut_at < p_cut;
  return (
    with exp as (select e.id, e.version, e.paid_by, e.amount_paise, e.spent_at from public.expenses e
                 where e.group_id = p_group_id and e.status = 'active' and e.spent_at < p_cut and (v_prev is null or e.spent_at >= v_prev)),
    paid as (select x.paid_by as uid, sum(x.amount_paise) as s from exp x group by x.paid_by),
    shares as (select es.user_id as uid, sum(es.share_paise) as s from public.expense_splits es
               join exp x on x.id = es.expense_id and x.version = es.version where es.group_id = p_group_id group by es.user_id),
    pays as (select pm.from_user, pm.to_user, pm.amount_paise, pm.method, pm.paid_at from public.payments pm
             where pm.group_id = p_group_id and pm.status = 'confirmed' and pm.paid_at < p_cut and (v_prev is null or pm.paid_at >= v_prev)),
    -- everything up to the cut (all time) -> what is still owed after this close
    a_exp as (select e.id, e.version, e.paid_by, e.amount_paise from public.expenses e
              where e.group_id = p_group_id and e.status = 'active' and e.spent_at < p_cut),
    a_src as (
      select x.paid_by as uid, x.amount_paise as s from a_exp x
      union all select es.user_id, -es.share_paise from public.expense_splits es join a_exp x on x.id = es.expense_id and x.version = es.version where es.group_id = p_group_id
      union all select pm.from_user, pm.amount_paise from public.payments pm where pm.group_id = p_group_id and pm.status = 'confirmed' and pm.paid_at < p_cut
      union all select pm.to_user, -pm.amount_paise from public.payments pm where pm.group_id = p_group_id and pm.status = 'confirmed' and pm.paid_at < p_cut
      union all select c.user_id, c.carry_paise from public.group_balance_carry c where c.group_id = p_group_id),
    nets as (select uid, sum(s)::bigint as net from a_src group by uid),
    people as (select uid from paid union select uid from shares union select uid from nets),
    rows as (select pe.uid, coalesce(pd.s, 0) as paid, coalesce(sh.s, 0) as share, coalesce(n.net, 0) as net
             from people pe left join paid pd on pd.uid = pe.uid left join shares sh on sh.uid = pe.uid left join nets n on n.uid = pe.uid)
    select jsonb_build_object(
      'from_date', coalesce((select min(spent_at) from exp), v_prev),
      'to_date', p_cut - interval '1 second',
      'total_paise', coalesce((select sum(amount_paise) from exp), 0),
      'expense_count', (select count(*) from exp),
      'per_head_paise', coalesce((select round(sum(amount_paise)::numeric / nullif((select count(*) from rows where share > 0), 0)) from exp), 0),
      'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.uid, 'name', p.full_name,
                   'paid_paise', r.paid, 'share_paise', r.share, 'net_paise', r.net) order by lower(p.full_name))
                 from rows r join public.profiles p on p.id = r.uid where r.paid <> 0 or r.share <> 0 or r.net <> 0), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('from_name', pf.full_name, 'to_name', pt.full_name,
                   'amount_paise', y.amount_paise, 'method', y.method, 'paid_at', y.paid_at) order by y.paid_at)
                 from pays y join public.profiles pf on pf.id = y.from_user join public.profiles pt on pt.id = y.to_user), '[]'::jsonb)));
end $$;

-- ---------- 3. Close now (admin) / preview ----------
create or replace function public.kh_close_cut(p_group_id uuid, p_period_end date)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare g public.groups%rowtype; v_cut timestamptz; v_prev timestamptz;
begin
  select * into g from public.groups where id = p_group_id;
  if p_period_end is null or p_period_end > (now() at time zone g.timezone)::date then raise exception 'INVALID_CLOSE_DATE'; end if;
  v_cut := ((p_period_end + 1)::timestamp at time zone g.timezone);
  select max(c.cut_at) into v_prev from public.period_closes c where c.group_id = p_group_id and c.status = 'closed';
  if v_prev is not null and v_cut <= v_prev then raise exception 'INVALID_CLOSE_DATE'; end if;
  if not exists (select 1 from public.expenses e where e.group_id = p_group_id and e.status = 'active'
                 and e.spent_at < v_cut and (v_prev is null or e.spent_at >= v_prev)) then raise exception 'NOTHING_TO_CLOSE'; end if;
  return v_cut;
end $$;

create or replace function public.preview_period_close(p_group_id uuid, p_period_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.kh_require_role(p_group_id, 'admin');
  return public.kh_close_summary(p_group_id, public.kh_close_cut(p_group_id, p_period_end));
end $$;

create or replace function public.close_period(p_group_id uuid, p_period_end date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.kh_require_role(p_group_id, 'admin'); v_cut timestamptz; v_id uuid; v_name text; m record;
begin
  perform public.kh_require_active_group(p_group_id);
  perform public.kh_rate_limit('period_close', 10, 3600);
  perform 1 from public.groups where id = p_group_id for update;     -- no two closes at once
  v_cut := public.kh_close_cut(p_group_id, p_period_end);
  insert into public.period_closes (group_id, period_end, cut_at, status, requested_by, requested_at, effective_at, closed_at, summary)
    values (p_group_id, p_period_end, v_cut, 'closed', v_uid, now(), now(), now(), public.kh_close_summary(p_group_id, v_cut))
    returning id into v_id;
  perform public.kh_audit(p_group_id, 'period_closed', 'group', p_group_id::text, jsonb_build_object('period_end', p_period_end));
  select full_name into v_name from public.profiles where id = v_uid;
  for m in select gm.user_id from public.group_members gm where gm.group_id = p_group_id and gm.status = 'active' and gm.user_id <> v_uid loop
    perform public.kh_notify(m.user_id, p_group_id, 'close_done', jsonb_build_object('name', v_name, 'period_end', p_period_end));
  end loop;
  return v_id;
end $$;

create or replace function public.list_period_closes(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.kh_require_role(p_group_id, 'member');
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'period_end', c.period_end, 'closed_at', c.closed_at,
            'closed_by_name', p.full_name, 'summary', c.summary) order by c.cut_at desc)
          from public.period_closes c join public.profiles p on p.id = c.requested_by
          where c.group_id = p_group_id and c.status = 'closed'), '[]'::jsonb);
end $$;

-- ---------- 4. Expenses list: open (not closed) expenses only ----------
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
  v_open_from timestamptz;
begin
  -- expenses of closed periods are history (see Statement / Close & history), not part of the open list
  select max(c.cut_at) into v_open_from from public.period_closes c where c.group_id = p_group_id and c.status = 'closed';
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
      and (v_open_from is null or e.spent_at >= v_open_from)
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


-- ---------- 5. Balances: current position (records after the last close) + earlier unpaid dues as "carry" ----------
create or replace function public.get_group_balances(
  p_group_id uuid, p_from timestamptz default null, p_to timestamptz default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cut timestamptz;
begin
  perform public.kh_require_role(p_group_id, 'member');
  if p_from is null then
    select max(c.cut_at) into v_cut from public.period_closes c where c.group_id = p_group_id and c.status = 'closed';
  end if;
  return coalesce((
    with members as (
      select distinct on (gm.user_id) gm.user_id, gm.status from public.group_members gm
      where gm.group_id = p_group_id order by gm.user_id, (gm.status = 'active') desc, gm.joined_at desc
    ),
    exp as (
      select e.id, e.version, e.paid_by, e.amount_paise from public.expenses e
      where e.group_id = p_group_id and e.status = 'active'
        and (p_from is null or e.spent_at >= p_from) and (p_to is null or e.spent_at < p_to)
        and (v_cut is null or e.spent_at >= v_cut)
    ),
    carry_src as (
      select c.user_id as uid, c.carry_paise as s from public.group_balance_carry c where c.group_id = p_group_id and p_from is null
      union all select e.paid_by, e.amount_paise from public.expenses e
        where v_cut is not null and e.group_id = p_group_id and e.status = 'active' and e.spent_at < v_cut
      union all select es.user_id, -es.share_paise from public.expense_splits es
        join public.expenses e on e.id = es.expense_id and e.version = es.version
        where v_cut is not null and e.group_id = p_group_id and e.status = 'active' and e.spent_at < v_cut
      union all select pm.from_user, pm.amount_paise from public.payments pm
        where v_cut is not null and pm.group_id = p_group_id and pm.status = 'confirmed' and pm.paid_at < v_cut
      union all select pm.to_user, -pm.amount_paise from public.payments pm
        where v_cut is not null and pm.group_id = p_group_id and pm.status = 'confirmed' and pm.paid_at < v_cut
    ),
    carry as (select cs.uid, sum(cs.s)::bigint as s from carry_src cs group by cs.uid),
    paid as (select x.paid_by as uid, sum(x.amount_paise) as s from exp x group by x.paid_by),
    shares as (
      select es.user_id as uid, sum(es.share_paise) as s from public.expense_splits es
      join exp x on x.id = es.expense_id and x.version = es.version group by es.user_id
    ),
    pay as (
      select pm.from_user, pm.to_user, pm.amount_paise from public.payments pm
      where pm.group_id = p_group_id and pm.status = 'confirmed'
        and (p_from is null or pm.paid_at >= p_from) and (p_to is null or pm.paid_at < p_to)
        and (v_cut is null or pm.paid_at >= v_cut)
    ),
    pout as (select from_user as uid, sum(amount_paise) as s from pay group by from_user),
    pin as (select to_user as uid, sum(amount_paise) as s from pay group by to_user),
    rows as (
      select m.user_id, m.status, coalesce(pd.s, 0) as paid_paise, coalesce(sh.s, 0) as share_paise,
             coalesce(po.s, 0) as settlement_paid_paise, coalesce(pi.s, 0) as settlement_received_paise, coalesce(cy.s, 0) as carry_paise
      from members m left join paid pd on pd.uid = m.user_id left join shares sh on sh.uid = m.user_id
      left join pout po on po.uid = m.user_id left join pin pi on pi.uid = m.user_id left join carry cy on cy.uid = m.user_id
    )
    select jsonb_agg(jsonb_build_object(
      'user_id', r.user_id, 'full_name', p.full_name, 'is_deleted', p.deleted_at is not null, 'status', r.status,
      'paid_paise', r.paid_paise, 'share_paise', r.share_paise,
      'settlement_paid_paise', r.settlement_paid_paise, 'settlement_received_paise', r.settlement_received_paise,
      'carry_paise', r.carry_paise,
      'net_paise', r.paid_paise - r.share_paise + r.settlement_paid_paise - r.settlement_received_paise + r.carry_paise
    ) order by (r.status = 'active') desc, lower(p.full_name))
    from rows r join public.profiles p on p.id = r.user_id
    where r.status = 'active' or r.paid_paise <> 0 or r.share_paise <> 0 or r.settlement_paid_paise <> 0 or r.settlement_received_paise <> 0 or r.carry_paise <> 0
  ), '[]'::jsonb);
end $$;

-- ---------- 6. Monthly cleanup: on the last day of each month keep only the last 12 months ----------
create or replace function public.kh_monthly_cleanup(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record; v_today date := (now() at time zone 'Asia/Kolkata')::date;
        v_last date := ((date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '1 month') - interval '1 day')::date;
        v_keep timestamptz; v_exp uuid[]; v_pay uuid[]; t_exp int := 0; t_pay int := 0;
begin
  if not p_force and v_today <> v_last then return jsonb_build_object('skipped', true); end if;
  perform set_config('khatafy.purge', 'on', true);
  for g in select id, timezone from public.groups loop
    v_keep := (date_trunc('month', now() at time zone g.timezone) - interval '11 months') at time zone g.timezone;
    v_exp := array(select e.id from public.expenses e where e.group_id = g.id and e.spent_at < v_keep);
    v_pay := array(select p.id from public.payments p where p.group_id = g.id and p.paid_at < v_keep and p.status <> 'pending');
    if coalesce(array_length(v_exp, 1), 0) > 0 or coalesce(array_length(v_pay, 1), 0) > 0 then
      -- keep what is still owed: store the net effect of the records about to be deleted
      with old_exp as (select e.id, e.version, e.paid_by, e.amount_paise from public.expenses e where e.id = any (v_exp) and e.status = 'active'),
      d as (select x.paid_by as uid, x.amount_paise as amt from old_exp x
            union all select es.user_id, -es.share_paise from public.expense_splits es join old_exp x on x.id = es.expense_id and x.version = es.version
            union all select pm.from_user, pm.amount_paise from public.payments pm where pm.id = any (v_pay) and pm.status = 'confirmed'
            union all select pm.to_user, -pm.amount_paise from public.payments pm where pm.id = any (v_pay) and pm.status = 'confirmed'),
      s as (select uid, sum(amt)::bigint as net from d group by uid having sum(amt) <> 0)
      insert into public.group_balance_carry (group_id, user_id, carry_paise)
      select g.id, s.uid, s.net from s
      on conflict (group_id, user_id) do update set carry_paise = public.group_balance_carry.carry_paise + excluded.carry_paise, updated_at = now();

      insert into public.storage_cleanup_queue (storage_path)
        select r.storage_path from public.expense_receipts r where r.group_id = g.id and r.expense_id = any (v_exp);
      delete from public.expense_receipts r where r.group_id = g.id and r.expense_id = any (v_exp);
      delete from public.expense_revisions r where r.group_id = g.id and r.expense_id = any (v_exp);
      delete from public.expense_splits s2 where s2.group_id = g.id and s2.expense_id = any (v_exp);
      delete from public.expenses e where e.group_id = g.id and e.id = any (v_exp);
      delete from public.payments p where p.id = any (v_pay);
      delete from public.audit_logs a where a.group_id = g.id and a.entity_type in ('expenses', 'payments')
        and a.entity_id = any (array(select x::text from unnest(v_exp || v_pay) x));
      delete from public.notifications n where n.group_id = g.id and n.created_at < v_keep
        and (n.type like 'expense\_%' or n.type like 'payment\_%');
      perform public.kh_audit(g.id, 'monthly_cleanup', 'group', g.id::text,
        jsonb_build_object('expenses', coalesce(array_length(v_exp, 1), 0), 'payments', coalesce(array_length(v_pay, 1), 0)));
      t_exp := t_exp + coalesce(array_length(v_exp, 1), 0); t_pay := t_pay + coalesce(array_length(v_pay, 1), 0);
    end if;
    delete from public.period_closes c where c.group_id = g.id and c.cut_at < v_keep;   -- history older than 12 months
  end loop;
  return jsonb_build_object('expenses_deleted', t_exp, 'payments_deleted', t_pay);
end $$;

-- ---------- 7. Grants ----------
revoke all on function public.kh_close_summary(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.kh_close_cut(uuid, date) from public, anon, authenticated;
revoke all on function public.kh_monthly_cleanup(boolean) from public, anon, authenticated;
revoke all on function public.preview_period_close(uuid, date) from public, anon;
revoke all on function public.close_period(uuid, date) from public, anon;
revoke all on function public.list_period_closes(uuid) from public, anon;
grant execute on function public.preview_period_close(uuid, date) to authenticated;
grant execute on function public.close_period(uuid, date) to authenticated;
grant execute on function public.list_period_closes(uuid) to authenticated;

-- Runs on days 28-31 at 22:00 India time; the function itself acts only on the real last day of the month.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('khatafy-monthly-cleanup'); exception when others then null; end;
    perform cron.schedule('khatafy-monthly-cleanup', '30 16 28-31 * *', 'select public.kh_monthly_cleanup()');
  else raise notice 'pg_cron is not enabled: the monthly cleanup will not run until you enable it and re-run this block.'; end if;
end $$;

commit;
