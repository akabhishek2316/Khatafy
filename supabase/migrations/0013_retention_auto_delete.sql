-- 0013: owner-controlled auto-delete (data retention) with balance carry-forward.
-- * Only the group OWNER can set it (6 / 9 / 12 months, or off). Default: off.
-- * 7-day grace period after every change; all members are notified.
-- * Old expenses, payments, notices, shopping items, notifications and audit rows are deleted by a daily job.
-- * Balances stay correct: the net effect of deleted records is stored in group_balance_carry (amounts only, no details).
-- * Receipt FILES are queued in storage_cleanup_queue and removed by the purge-receipts Edge Function (see README).
begin;

alter table public.groups add column if not exists retention_months smallint
  check (retention_months is null or retention_months in (6, 9, 12));
alter table public.groups add column if not exists retention_effective_at timestamptz;

create table if not exists public.group_balance_carry (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  carry_paise bigint not null,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists public.storage_cleanup_queue (
  id bigint generated always as identity primary key,
  bucket text not null default 'receipts',
  storage_path text not null,
  queued_at timestamptz not null default now(),
  done_at timestamptz
);
alter table public.group_balance_carry enable row level security;
alter table public.storage_cleanup_queue enable row level security;
revoke all on public.group_balance_carry, public.storage_cleanup_queue from anon, authenticated;

-- Allow deletes ONLY inside the purge job (it sets a transaction-local flag clients cannot set).
create or replace function public.block_hard_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('khatafy.purge', true) = 'on' then return old; end if;
  raise exception 'HARD_DELETE_FORBIDDEN' using hint = 'Financial records are void/reverse only.';
end;
$$;

-- Balances now include the carry-forward (lifetime view only).
create or replace function public.get_group_balances(
  p_group_id uuid, p_from timestamptz default null, p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.kh_require_role(p_group_id, 'member');
  return coalesce((
    with members as (
      select distinct on (gm.user_id) gm.user_id, gm.status
      from public.group_members gm
      where gm.group_id = p_group_id
      order by gm.user_id, (gm.status = 'active') desc, gm.joined_at desc
    ),
    exp as (
      select e.id, e.version, e.paid_by, e.amount_paise
      from public.expenses e
      where e.group_id = p_group_id and e.status = 'active'
        and (p_from is null or e.spent_at >= p_from) and (p_to is null or e.spent_at < p_to)
    ),
    carry as (
      select c.user_id as uid, c.carry_paise as s from public.group_balance_carry c
      where c.group_id = p_group_id and p_from is null
    ),
    paid as (select x.paid_by as uid, sum(x.amount_paise) as s from exp x group by x.paid_by),
    shares as (
      select es.user_id as uid, sum(es.share_paise) as s
      from public.expense_splits es join exp x on x.id = es.expense_id and x.version = es.version
      group by es.user_id
    ),
    pay as (
      select pm.from_user, pm.to_user, pm.amount_paise
      from public.payments pm
      where pm.group_id = p_group_id and pm.status = 'confirmed'
        and (p_from is null or pm.paid_at >= p_from) and (p_to is null or pm.paid_at < p_to)
    ),
    pout as (select from_user as uid, sum(amount_paise) as s from pay group by from_user),
    pin as (select to_user as uid, sum(amount_paise) as s from pay group by to_user),
    rows as (
      select m.user_id, m.status,
             coalesce(pd.s, 0) as paid_paise,
             coalesce(sh.s, 0) as share_paise,
             coalesce(po.s, 0) as settlement_paid_paise,
             coalesce(pi.s, 0) as settlement_received_paise,
             coalesce(cy.s, 0) as carry_paise
      from members m
      left join paid pd on pd.uid = m.user_id
      left join shares sh on sh.uid = m.user_id
      left join pout po on po.uid = m.user_id
      left join pin pi on pi.uid = m.user_id
      left join carry cy on cy.uid = m.user_id
    )
    select jsonb_agg(jsonb_build_object(
      'user_id', r.user_id, 'full_name', p.full_name, 'is_deleted', p.deleted_at is not null,
      'status', r.status,
      'paid_paise', r.paid_paise, 'share_paise', r.share_paise,
      'settlement_paid_paise', r.settlement_paid_paise,
      'settlement_received_paise', r.settlement_received_paise,
      'carry_paise', r.carry_paise,
      'net_paise', r.paid_paise - r.share_paise + r.settlement_paid_paise - r.settlement_received_paise + r.carry_paise
    ) order by (r.status = 'active') desc, lower(p.full_name))
    from rows r join public.profiles p on p.id = r.user_id
    where r.status = 'active'
       or r.paid_paise <> 0 or r.share_paise <> 0 or r.settlement_paid_paise <> 0 or r.settlement_received_paise <> 0 or r.carry_paise <> 0
  ), '[]'::jsonb);
end;
$$;


create or replace function public.get_group_retention(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := public.kh_require_role(p_group_id, 'member'); v_role text;
begin
  select gm.role into v_role from public.group_members gm where gm.group_id = p_group_id and gm.user_id = v_uid and gm.status = 'active';
  return (select jsonb_build_object('months', g.retention_months, 'effective_at', g.retention_effective_at, 'can_edit', v_role = 'owner')
          from public.groups g where g.id = p_group_id);
end $$;

create or replace function public.set_group_retention(p_group_id uuid, p_months integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.kh_require_role(p_group_id, 'owner'); v_name text; m record; v_eff timestamptz;
begin
  perform public.kh_require_active_group(p_group_id);
  if p_months is not null and p_months not in (6, 9, 12) then raise exception 'INVALID_RETENTION'; end if;
  v_eff := case when p_months is null then null else now() + interval '7 days' end;
  update public.groups set retention_months = p_months, retention_effective_at = v_eff where id = p_group_id;
  perform public.kh_audit(p_group_id, 'retention_changed', 'group', p_group_id::text, jsonb_build_object('months', p_months));
  select full_name into v_name from public.profiles where id = v_uid;
  for m in select gm.user_id from public.group_members gm where gm.group_id = p_group_id and gm.status = 'active' and gm.user_id <> v_uid loop
    perform public.kh_notify(m.user_id, p_group_id, case when p_months is null then 'retention_off' else 'retention_on' end,
      jsonb_build_object('name', v_name, 'months', p_months));
  end loop;
  return jsonb_build_object('months', p_months, 'effective_at', v_eff);
end $$;

-- Daily job. Internal only (not callable by clients).
create or replace function public.kh_purge_expired_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record; v_cut timestamptz; n_exp int; n_pay int; n_misc int; t_exp int := 0; t_pay int := 0;
begin
  perform set_config('khatafy.purge', 'on', true);
  for g in select id, retention_months from public.groups
           where retention_months is not null and retention_effective_at is not null and retention_effective_at <= now() loop
    v_cut := now() - make_interval(months => g.retention_months);

    -- 1) keep balances correct: store the net effect of what is about to be removed
    with old_exp as (
      select e.id, e.version, e.paid_by, e.amount_paise from public.expenses e
      where e.group_id = g.id and e.status = 'active' and e.spent_at < v_cut),
    d as (
      select x.paid_by as uid, x.amount_paise as amt from old_exp x
      union all select es.user_id, -es.share_paise from public.expense_splits es
                join old_exp x on x.id = es.expense_id and x.version = es.version where es.group_id = g.id
      union all select pm.from_user, pm.amount_paise from public.payments pm where pm.group_id = g.id and pm.status = 'confirmed' and pm.paid_at < v_cut
      union all select pm.to_user, -pm.amount_paise from public.payments pm where pm.group_id = g.id and pm.status = 'confirmed' and pm.paid_at < v_cut),
    s as (select uid, sum(amt)::bigint as net from d group by uid having sum(amt) <> 0)
    insert into public.group_balance_carry (group_id, user_id, carry_paise)
    select g.id, s.uid, s.net from s
    on conflict (group_id, user_id) do update
      set carry_paise = public.group_balance_carry.carry_paise + excluded.carry_paise, updated_at = now();

    -- 2) queue receipt files, then delete rows (children first)
    insert into public.storage_cleanup_queue (storage_path)
      select r.storage_path from public.expense_receipts r join public.expenses e on e.id = r.expense_id and e.group_id = r.group_id
      where e.group_id = g.id and e.spent_at < v_cut;
    delete from public.expense_receipts r using public.expenses e where r.expense_id = e.id and r.group_id = e.group_id and e.group_id = g.id and e.spent_at < v_cut;
    delete from public.expense_revisions r using public.expenses e where r.expense_id = e.id and r.group_id = e.group_id and e.group_id = g.id and e.spent_at < v_cut;
    delete from public.expense_splits s2 using public.expenses e where s2.expense_id = e.id and s2.group_id = e.group_id and e.group_id = g.id and e.spent_at < v_cut;
    delete from public.expenses where group_id = g.id and spent_at < v_cut;
    get diagnostics n_exp = row_count;
    delete from public.payments where group_id = g.id and paid_at < v_cut;
    get diagnostics n_pay = row_count;
    delete from public.group_notices where group_id = g.id and created_at < v_cut and pinned = false;
    delete from public.shopping_list_items where group_id = g.id and created_at < v_cut;
    delete from public.notifications where group_id = g.id and created_at < v_cut;
    delete from public.audit_logs where group_id = g.id and created_at < v_cut and action <> 'retention_purge';
    get diagnostics n_misc = row_count;

    if n_exp > 0 or n_pay > 0 then
      perform public.kh_audit(g.id, 'retention_purge', 'group', g.id::text,
        jsonb_build_object('months', g.retention_months, 'expenses', n_exp, 'payments', n_pay));
    end if;
    t_exp := t_exp + n_exp; t_pay := t_pay + n_pay;
  end loop;
  return jsonb_build_object('expenses_deleted', t_exp, 'payments_deleted', t_pay);
end $$;

revoke all on function public.get_group_retention(uuid) from public, anon;
revoke all on function public.set_group_retention(uuid, integer) from public, anon;
revoke all on function public.kh_purge_expired_data() from public, anon, authenticated;
grant execute on function public.get_group_retention(uuid) to authenticated;
grant execute on function public.set_group_retention(uuid, integer) to authenticated;

-- Schedule the daily job (03:00 India time) if pg_cron is enabled (Dashboard -> Integrations -> Cron / Database -> Extensions).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('khatafy-retention-purge'); exception when others then null; end;
    perform cron.schedule('khatafy-retention-purge', '30 21 * * *', 'select public.kh_purge_expired_data()');
  else
    raise notice 'pg_cron is not enabled: enable it, then re-run this block (see README) or the auto-delete will not run.';
  end if;
end $$;

commit;
