-- 0014: "Close period" (settle & close) replaces the time-based auto-delete of 0013.
-- Flow: admin/owner requests a close up to a date -> every member is notified -> 7-day review window
-- (any member can object; admin/owner can cancel) -> a daily job finalises: a permanent SUMMARY is stored,
-- remaining dues are carried forward as a balance (never lost), then the detailed expenses/payments are deleted.
begin;

-- ---------- 0. Remove the time-based retention from 0013 (safe if 0013 was never applied) ----------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('khatafy-retention-purge'); exception when others then null; end;
  end if;
end $$;
drop function if exists public.set_group_retention(uuid, integer);
drop function if exists public.get_group_retention(uuid);
drop function if exists public.kh_purge_expired_data();
alter table public.groups drop column if exists retention_months;
alter table public.groups drop column if exists retention_effective_at;
-- foundation kept from 0013: group_balance_carry, storage_cleanup_queue, block_hard_delete bypass, get_group_balances(carry)
create table if not exists public.group_balance_carry (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  carry_paise bigint not null,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id));
create table if not exists public.storage_cleanup_queue (
  id bigint generated always as identity primary key, bucket text not null default 'receipts',
  storage_path text not null, queued_at timestamptz not null default now(), done_at timestamptz);
alter table public.group_balance_carry enable row level security;
alter table public.storage_cleanup_queue enable row level security;
revoke all on public.group_balance_carry, public.storage_cleanup_queue from anon, authenticated;

-- ---------- 1. Tables ----------
create table if not exists public.period_closes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  period_end date not null,                       -- inclusive, in the group's timezone
  cut_at timestamptz not null,                    -- start of the day after period_end
  status text not null default 'pending' check (status in ('pending', 'closed', 'cancelled')),
  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default now(),
  effective_at timestamptz not null,
  closed_at timestamptz,
  summary jsonb
);
create unique index if not exists uq_period_close_one_pending on public.period_closes(group_id) where status = 'pending';
create index if not exists idx_period_closes_group on public.period_closes(group_id, cut_at desc);
create table if not exists public.period_close_objections (
  close_id uuid not null references public.period_closes(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  reason text not null check (char_length(trim(reason)) between 3 and 300),
  created_at timestamptz not null default now(),
  primary key (close_id, user_id));
alter table public.period_closes enable row level security;
alter table public.period_close_objections enable row level security;
revoke all on public.period_closes, public.period_close_objections from anon, authenticated;

-- ---------- 2. Closed periods are read-only: no new/back-dated records before the cut ----------
create or replace function public.guard_closed_period()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_col text := case tg_table_name when 'expenses' then 'spent_at' else 'paid_at' end;
        v_ts timestamptz; v_cut timestamptz;
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) ->> v_col) is not distinct from (to_jsonb(old) ->> v_col) then return new; end if;
  v_ts := (to_jsonb(new) ->> v_col)::timestamptz;
  select max(c.cut_at) into v_cut from public.period_closes c where c.group_id = new.group_id and c.status = 'closed';
  if v_cut is not null and v_ts < v_cut then raise exception 'PERIOD_CLOSED'; end if;
  return new;
end $$;
drop trigger if exists trg_expenses_closed_period on public.expenses;
create trigger trg_expenses_closed_period before insert or update on public.expenses for each row execute function public.guard_closed_period();
drop trigger if exists trg_payments_closed_period on public.payments;
create trigger trg_payments_closed_period before insert or update on public.payments for each row execute function public.guard_closed_period();

revoke all on function public.guard_closed_period() from public, anon, authenticated;

-- ---------- 3. Summary (used for the live preview and for the final stored summary) ----------
create or replace function public.kh_close_summary(p_group_id uuid, p_cut timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return (
    with exp as (select e.id, e.version, e.paid_by, e.amount_paise, e.spent_at from public.expenses e
                 where e.group_id = p_group_id and e.status = 'active' and e.spent_at < p_cut),
    paid as (select x.paid_by as uid, sum(x.amount_paise) as s from exp x group by x.paid_by),
    shares as (select es.user_id as uid, sum(es.share_paise) as s from public.expense_splits es
               join exp x on x.id = es.expense_id and x.version = es.version where es.group_id = p_group_id group by es.user_id),
    pays as (select pm.from_user, pm.to_user, pm.amount_paise, pm.method, pm.paid_at from public.payments pm
             where pm.group_id = p_group_id and pm.status = 'confirmed' and pm.paid_at < p_cut),
    pout as (select from_user as uid, sum(amount_paise) as s from pays group by from_user),
    pin as (select to_user as uid, sum(amount_paise) as s from pays group by to_user),
    carry as (select c.user_id as uid, c.carry_paise as s from public.group_balance_carry c where c.group_id = p_group_id),
    people as (select uid from paid union select uid from shares union select uid from pout union select uid from pin union select uid from carry),
    rows as (
      select pe.uid, coalesce(pd.s, 0) as paid, coalesce(sh.s, 0) as share,
             coalesce(pd.s, 0) - coalesce(sh.s, 0) + coalesce(po.s, 0) - coalesce(pi.s, 0) + coalesce(cy.s, 0) as net
      from people pe left join paid pd on pd.uid = pe.uid left join shares sh on sh.uid = pe.uid
      left join pout po on po.uid = pe.uid left join pin pi on pi.uid = pe.uid left join carry cy on cy.uid = pe.uid)
    select jsonb_build_object(
      'from_date', (select min(spent_at) from exp),
      'to_date', p_cut - interval '1 second',
      'total_paise', coalesce((select sum(amount_paise) from exp), 0),
      'expense_count', (select count(*) from exp),
      'per_head_paise', coalesce((select round(sum(amount_paise)::numeric / nullif((select count(*) from rows where share > 0), 0)) from exp), 0),
      'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.uid, 'name', p.full_name,
                   'paid_paise', r.paid, 'share_paise', r.share, 'net_paise', r.net) order by lower(p.full_name))
                 from rows r join public.profiles p on p.id = r.uid), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('from_name', pf.full_name, 'to_name', pt.full_name,
                   'amount_paise', y.amount_paise, 'method', y.method, 'paid_at', y.paid_at) order by y.paid_at)
                 from pays y join public.profiles pf on pf.id = y.from_user join public.profiles pt on pt.id = y.to_user), '[]'::jsonb)));
end $$;

-- ---------- 4. Finalise one close (internal) ----------
create or replace function public.kh_finalize_period_close(p_close_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.period_closes%rowtype; v_sum jsonb; v_exp uuid[]; v_pay uuid[]; m record;
begin
  select * into c from public.period_closes where id = p_close_id for update;
  if not found or c.status <> 'pending' then return; end if;
  if exists (select 1 from public.period_close_objections o where o.close_id = c.id) then return; end if;
  perform set_config('khatafy.purge', 'on', true);

  v_sum := public.kh_close_summary(c.group_id, c.cut_at);
  v_exp := array(select e.id from public.expenses e where e.group_id = c.group_id and e.spent_at < c.cut_at);
  v_pay := array(select p.id from public.payments p where p.group_id = c.group_id and p.paid_at < c.cut_at and p.status <> 'pending');

  -- remaining dues stay as a carried balance (net effect of the records about to be deleted)
  with old_exp as (select e.id, e.version, e.paid_by, e.amount_paise from public.expenses e
                   where e.group_id = c.group_id and e.status = 'active' and e.spent_at < c.cut_at),
  d as (select x.paid_by as uid, x.amount_paise as amt from old_exp x
        union all select es.user_id, -es.share_paise from public.expense_splits es join old_exp x on x.id = es.expense_id and x.version = es.version where es.group_id = c.group_id
        union all select pm.from_user, pm.amount_paise from public.payments pm where pm.id = any (v_pay) and pm.status = 'confirmed'
        union all select pm.to_user, -pm.amount_paise from public.payments pm where pm.id = any (v_pay) and pm.status = 'confirmed'),
  s as (select uid, sum(amt)::bigint as net from d group by uid having sum(amt) <> 0)
  insert into public.group_balance_carry (group_id, user_id, carry_paise)
  select c.group_id, s.uid, s.net from s
  on conflict (group_id, user_id) do update set carry_paise = public.group_balance_carry.carry_paise + excluded.carry_paise, updated_at = now();

  insert into public.storage_cleanup_queue (storage_path)
    select r.storage_path from public.expense_receipts r where r.group_id = c.group_id and r.expense_id = any (v_exp);
  delete from public.expense_receipts r where r.group_id = c.group_id and r.expense_id = any (v_exp);
  delete from public.expense_revisions r where r.group_id = c.group_id and r.expense_id = any (v_exp);
  delete from public.expense_splits s2 where s2.group_id = c.group_id and s2.expense_id = any (v_exp);
  delete from public.expenses e where e.group_id = c.group_id and e.id = any (v_exp);
  delete from public.payments p where p.id = any (v_pay);
  -- details that would leak what was bought / paid
  delete from public.audit_logs a where a.group_id = c.group_id and a.entity_type in ('expenses', 'payments')
    and a.entity_id = any (array(select x::text from unnest(v_exp || v_pay) x));
  delete from public.notifications n where n.group_id = c.group_id and n.created_at < c.cut_at
    and (n.type like 'expense\_%' or n.type like 'payment\_%');

  update public.period_closes set status = 'closed', closed_at = now(), summary = v_sum where id = c.id;
  perform public.kh_audit(c.group_id, 'period_closed', 'group', c.group_id::text,
    jsonb_build_object('period_end', c.period_end, 'expenses', coalesce(array_length(v_exp, 1), 0)));
  for m in select gm.user_id from public.group_members gm where gm.group_id = c.group_id and gm.status = 'active' loop
    perform public.kh_notify(m.user_id, c.group_id, 'close_done', jsonb_build_object('period_end', c.period_end));
  end loop;
end $$;

create or replace function public.kh_finalize_due_closes()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select id from public.period_closes where status = 'pending' and effective_at <= now() loop
    begin perform public.kh_finalize_period_close(r.id); n := n + 1;
    exception when others then raise warning 'period close % failed: %', r.id, sqlerrm; end;
  end loop;
  return n;
end $$;

-- ---------- 5. Client RPCs ----------
create or replace function public.request_period_close(p_group_id uuid, p_period_end date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.kh_require_role(p_group_id, 'admin'); g public.groups%rowtype; v_cut timestamptz; v_id uuid; v_name text; m record;
begin
  perform public.kh_require_active_group(p_group_id);
  perform public.kh_rate_limit('period_close', 10, 3600);
  select * into g from public.groups where id = p_group_id;
  if p_period_end is null or p_period_end > (now() at time zone g.timezone)::date then raise exception 'INVALID_CLOSE_DATE'; end if;
  v_cut := ((p_period_end + 1)::timestamp at time zone g.timezone);
  if exists (select 1 from public.period_closes c where c.group_id = p_group_id and c.status = 'closed' and c.cut_at >= v_cut) then raise exception 'INVALID_CLOSE_DATE'; end if;
  if exists (select 1 from public.period_closes c where c.group_id = p_group_id and c.status = 'pending') then raise exception 'CLOSE_ALREADY_PENDING'; end if;
  if not exists (select 1 from public.expenses e where e.group_id = p_group_id and e.status = 'active' and e.spent_at < v_cut) then raise exception 'NOTHING_TO_CLOSE'; end if;
  insert into public.period_closes (group_id, period_end, cut_at, requested_by, effective_at)
    values (p_group_id, p_period_end, v_cut, v_uid, now() + interval '7 days') returning id into v_id;
  perform public.kh_audit(p_group_id, 'period_close_requested', 'group', p_group_id::text, jsonb_build_object('period_end', p_period_end));
  select full_name into v_name from public.profiles where id = v_uid;
  for m in select gm.user_id from public.group_members gm where gm.group_id = p_group_id and gm.status = 'active' and gm.user_id <> v_uid loop
    perform public.kh_notify(m.user_id, p_group_id, 'close_requested', jsonb_build_object('name', v_name, 'period_end', p_period_end));
  end loop;
  return v_id;
end $$;

create or replace function public.object_period_close(p_close_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.period_closes%rowtype; v_uid uuid; v_name text;
begin
  select * into c from public.period_closes where id = p_close_id;
  if not found then raise exception 'CLOSE_NOT_FOUND'; end if;
  v_uid := public.kh_require_role(c.group_id, 'member');
  if c.status <> 'pending' then raise exception 'CLOSE_NOT_PENDING'; end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  insert into public.period_close_objections (close_id, user_id, reason) values (c.id, v_uid, left(trim(p_reason), 300))
    on conflict (close_id, user_id) do update set reason = excluded.reason, created_at = now();
  select full_name into v_name from public.profiles where id = v_uid;
  perform public.kh_notify_admins(c.group_id, 'close_objection', jsonb_build_object('name', v_name), v_uid, null);
end $$;

create or replace function public.withdraw_period_objection(p_close_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.kh_uid();
begin
  delete from public.period_close_objections o where o.close_id = p_close_id and o.user_id = v_uid;
end $$;

create or replace function public.cancel_period_close(p_close_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.period_closes%rowtype; v_uid uuid; v_name text; m record;
begin
  select * into c from public.period_closes where id = p_close_id for update;
  if not found then raise exception 'CLOSE_NOT_FOUND'; end if;
  v_uid := public.kh_require_role(c.group_id, 'admin');
  if c.status <> 'pending' then raise exception 'CLOSE_NOT_PENDING'; end if;
  update public.period_closes set status = 'cancelled' where id = c.id;
  perform public.kh_audit(c.group_id, 'period_close_cancelled', 'group', c.group_id::text, '{}'::jsonb);
  select full_name into v_name from public.profiles where id = v_uid;
  for m in select gm.user_id from public.group_members gm where gm.group_id = c.group_id and gm.status = 'active' and gm.user_id <> v_uid loop
    perform public.kh_notify(m.user_id, c.group_id, 'close_cancelled', jsonb_build_object('name', v_name));
  end loop;
end $$;

-- Closed periods (stored summary) + the pending one (live preview). Objection reasons only for admins.
create or replace function public.list_period_closes(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := public.kh_require_role(p_group_id, 'member'); v_admin boolean;
begin
  v_admin := exists (select 1 from public.group_members gm where gm.group_id = p_group_id and gm.user_id = v_uid and gm.status = 'active' and gm.role in ('owner', 'admin'));
  return coalesce((select jsonb_agg(x order by x.cut_at desc) from (
    select c.id, c.status, c.period_end, c.cut_at, c.requested_at, c.effective_at, c.closed_at, rp.full_name as requested_by_name,
      case when c.status = 'pending' then public.kh_close_summary(c.group_id, c.cut_at) else c.summary end as summary,
      (select count(*) from public.period_close_objections o where o.close_id = c.id) as objection_count,
      exists (select 1 from public.period_close_objections o where o.close_id = c.id and o.user_id = v_uid) as my_objection,
      case when v_admin then coalesce((select jsonb_agg(jsonb_build_object('name', op.full_name, 'reason', o.reason))
        from public.period_close_objections o join public.profiles op on op.id = o.user_id where o.close_id = c.id), '[]'::jsonb) else '[]'::jsonb end as objections
    from public.period_closes c join public.profiles rp on rp.id = c.requested_by
    where c.group_id = p_group_id and c.status in ('pending', 'closed')) x), '[]'::jsonb);
end $$;

revoke all on function public.kh_close_summary(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.kh_finalize_period_close(uuid) from public, anon, authenticated;
revoke all on function public.kh_finalize_due_closes() from public, anon, authenticated;
revoke all on function public.request_period_close(uuid, date) from public, anon;
revoke all on function public.object_period_close(uuid, text) from public, anon;
revoke all on function public.withdraw_period_objection(uuid) from public, anon;
revoke all on function public.cancel_period_close(uuid) from public, anon;
revoke all on function public.list_period_closes(uuid) from public, anon;
grant execute on function public.request_period_close(uuid, date) to authenticated;
grant execute on function public.object_period_close(uuid, text) to authenticated;
grant execute on function public.withdraw_period_objection(uuid) to authenticated;
grant execute on function public.cancel_period_close(uuid) to authenticated;
grant execute on function public.list_period_closes(uuid) to authenticated;

-- Daily job, 03:00 India time (needs pg_cron: Dashboard -> Integrations -> Cron).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('khatafy-close-finalize'); exception when others then null; end;
    perform cron.schedule('khatafy-close-finalize', '30 21 * * *', 'select public.kh_finalize_due_closes()');
  else raise notice 'pg_cron is not enabled: closes will not finalise until you enable it and re-run this block.'; end if;
end $$;

commit;
