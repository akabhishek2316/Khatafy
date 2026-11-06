-- 0018: keep EARLIER (closed-period) dues separate from the CURRENT period.
-- get_group_balances (current view) now returns, per member:
--   carry_paise    = earlier unpaid balance (everything up to the last close), AFTER payments made since then that settled it
--   current_paise  = this period only (expenses/shares after the last close, and payments NOT used for earlier dues)
--   net_paise      = carry + current
--   earlier_until  = end date of the last closed period
-- Rule for payments made after a close: a payment from A to B first reduces A's earlier dues to B (only while A owes and B is owed);
-- any remainder counts for the current period. New expenses / shared items after the close never change earlier dues.
begin;

create or replace function public.get_group_balances(
  p_group_id uuid, p_from timestamptz default null, p_to timestamptz default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_cut timestamptz; v_until date;
  v_carry jsonb := '{}'::jsonb; v_aout jsonb := '{}'::jsonb; v_ain jsonb := '{}'::jsonb;
  rec record; v_f bigint; v_t bigint; v_use bigint;
begin
  perform public.kh_require_role(p_group_id, 'member');
  if p_from is null then
    select c.cut_at, c.period_end into v_cut, v_until from public.period_closes c
      where c.group_id = p_group_id and c.status = 'closed' order by c.cut_at desc limit 1;
    -- earlier balance per member = cleanup carry + net effect of everything before the last close
    for rec in
      select cs.uid, sum(cs.s)::bigint as s from (
        select c.user_id as uid, c.carry_paise as s from public.group_balance_carry c where c.group_id = p_group_id
        union all select e.paid_by, e.amount_paise from public.expenses e
          where v_cut is not null and e.group_id = p_group_id and e.status = 'active' and e.spent_at < v_cut
        union all select es.user_id, -es.share_paise from public.expense_splits es
          join public.expenses e on e.id = es.expense_id and e.version = es.version
          where v_cut is not null and e.group_id = p_group_id and e.status = 'active' and e.spent_at < v_cut
        union all select pm.from_user, pm.amount_paise from public.payments pm
          where v_cut is not null and pm.group_id = p_group_id and pm.status = 'confirmed' and pm.paid_at < v_cut
        union all select pm.to_user, -pm.amount_paise from public.payments pm
          where v_cut is not null and pm.group_id = p_group_id and pm.status = 'confirmed' and pm.paid_at < v_cut
      ) cs group by cs.uid
    loop v_carry := v_carry || jsonb_build_object(rec.uid::text, rec.s); end loop;

    -- payments after the close first settle earlier dues (oldest first)
    if v_cut is not null then
      for rec in select pm.from_user, pm.to_user, pm.amount_paise from public.payments pm
               where pm.group_id = p_group_id and pm.status = 'confirmed' and pm.paid_at >= v_cut order by pm.paid_at, pm.id
      loop
        v_f := coalesce((v_carry ->> rec.from_user::text)::bigint, 0);
        v_t := coalesce((v_carry ->> rec.to_user::text)::bigint, 0);
        v_use := least(rec.amount_paise, greatest(0, -v_f), greatest(0, v_t));
        if v_use > 0 then
          v_carry := v_carry || jsonb_build_object(rec.from_user::text, v_f + v_use, rec.to_user::text, v_t - v_use);
          v_aout := v_aout || jsonb_build_object(rec.from_user::text, coalesce((v_aout ->> rec.from_user::text)::bigint, 0) + v_use);
          v_ain  := v_ain  || jsonb_build_object(rec.to_user::text,   coalesce((v_ain  ->> rec.to_user::text)::bigint, 0) + v_use);
        end if;
      end loop;
    end if;
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
    carry as (select k.key::uuid as uid, k.value::bigint as s from jsonb_each_text(v_carry) k),
    aout as (select k.key::uuid as uid, k.value::bigint as s from jsonb_each_text(v_aout) k),
    ain  as (select k.key::uuid as uid, k.value::bigint as s from jsonb_each_text(v_ain) k),
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
             coalesce(po.s, 0) as settlement_paid_paise, coalesce(pi.s, 0) as settlement_received_paise,
             coalesce(cy.s, 0) as carry_paise, coalesce(ao.s, 0) as alloc_out, coalesce(ai.s, 0) as alloc_in
      from members m left join paid pd on pd.uid = m.user_id left join shares sh on sh.uid = m.user_id
      left join pout po on po.uid = m.user_id left join pin pi on pi.uid = m.user_id
      left join carry cy on cy.uid = m.user_id left join aout ao on ao.uid = m.user_id left join ain ai on ai.uid = m.user_id
    )
    select jsonb_agg(jsonb_build_object(
      'user_id', r.user_id, 'full_name', p.full_name, 'is_deleted', p.deleted_at is not null, 'status', r.status,
      'paid_paise', r.paid_paise, 'share_paise', r.share_paise,
      'settlement_paid_paise', r.settlement_paid_paise, 'settlement_received_paise', r.settlement_received_paise,
      'carry_paise', r.carry_paise,
      'current_paise', r.paid_paise - r.share_paise + r.settlement_paid_paise - r.settlement_received_paise - r.alloc_out + r.alloc_in,
      'net_paise', r.paid_paise - r.share_paise + r.settlement_paid_paise - r.settlement_received_paise - r.alloc_out + r.alloc_in + r.carry_paise,
      'earlier_until', v_until
    ) order by (r.status = 'active') desc, lower(p.full_name))
    from rows r join public.profiles p on p.id = r.user_id
    where r.status = 'active' or r.paid_paise <> 0 or r.share_paise <> 0 or r.settlement_paid_paise <> 0
       or r.settlement_received_paise <> 0 or r.carry_paise <> 0
  ), '[]'::jsonb);
end $$;

commit;
