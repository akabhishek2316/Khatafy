-- 0023: (1) Expenses "Paid by" filter shows only expenses that person PAID (not expenses they merely share);
--       (2) payments are explicit: each payment is either for the EARLIER dues (closed period) or for the CURRENT period.
begin;

alter table public.payments add column if not exists for_earlier boolean not null default false;

create or replace function public.kh_earlier_balances(p_group_id uuid)
returns table(uid uuid, s bigint) language plpgsql stable security definer set search_path = '' as $$
declare v_cut timestamptz;
begin
  select max(c.cut_at) into v_cut from public.period_closes c where c.group_id = p_group_id and c.status = 'closed';
  return query
  select cs.u, sum(cs.v)::bigint from (
    select c.user_id as u, c.carry_paise as v from public.group_balance_carry c where c.group_id = p_group_id
    union all select e.paid_by, e.amount_paise from public.expenses e
      where v_cut is not null and e.group_id = p_group_id and e.status = 'active' and e.spent_at < v_cut
    union all select es.user_id, -es.share_paise from public.expense_splits es
      join public.expenses e on e.id = es.expense_id and e.version = es.version
      where v_cut is not null and e.group_id = p_group_id and e.status = 'active' and e.spent_at < v_cut
    union all select pm.from_user, pm.amount_paise from public.payments pm
      where v_cut is not null and pm.group_id = p_group_id and pm.status = 'confirmed' and pm.paid_at < v_cut
    union all select pm.to_user, -pm.amount_paise from public.payments pm
      where v_cut is not null and pm.group_id = p_group_id and pm.status = 'confirmed' and pm.paid_at < v_cut
    union all select pm.from_user, pm.amount_paise from public.payments pm
      where v_cut is not null and pm.group_id = p_group_id and pm.status = 'confirmed' and pm.for_earlier and pm.paid_at >= v_cut
    union all select pm.to_user, -pm.amount_paise from public.payments pm
      where v_cut is not null and pm.group_id = p_group_id and pm.status = 'confirmed' and pm.for_earlier and pm.paid_at >= v_cut
  ) cs group by cs.u;
end $$;

revoke all on function public.kh_earlier_balances(uuid) from public, anon, authenticated;   -- internal: no membership check

create or replace function public.get_group_balances(
  p_group_id uuid, p_from timestamptz default null, p_to timestamptz default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_cut timestamptz; v_until date; v_carry jsonb := '{}'::jsonb; rec record;
begin
  perform public.kh_require_role(p_group_id, 'member');
  if p_from is null then
    select c.cut_at, c.period_end into v_cut, v_until from public.period_closes c
      where c.group_id = p_group_id and c.status = 'closed' order by c.cut_at desc limit 1;
    -- EARLIER balance per member (closed periods) after payments that were explicitly made for it
    for rec in select k.uid, k.s from public.kh_earlier_balances(p_group_id) k loop
      v_carry := v_carry || jsonb_build_object(rec.uid::text, rec.s);
    end loop;
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
    paid as (select x.paid_by as uid, sum(x.amount_paise) as s from exp x group by x.paid_by),
    shares as (
      select es.user_id as uid, sum(es.share_paise) as s from public.expense_splits es
      join exp x on x.id = es.expense_id and x.version = es.version group by es.user_id
    ),
    pay as (   -- current view: only payments made for the CURRENT period
      select pm.from_user, pm.to_user, pm.amount_paise from public.payments pm
      where pm.group_id = p_group_id and pm.status = 'confirmed'
        and (p_from is null or pm.paid_at >= p_from) and (p_to is null or pm.paid_at < p_to)
        and (v_cut is null or pm.paid_at >= v_cut)
        and (p_from is not null or not pm.for_earlier)
    ),
    pout as (select from_user as uid, sum(amount_paise) as s from pay group by from_user),
    pin as (select to_user as uid, sum(amount_paise) as s from pay group by to_user),
    rows as (
      select m.user_id, m.status, coalesce(pd.s, 0) as paid_paise, coalesce(sh.s, 0) as share_paise,
             coalesce(po.s, 0) as settlement_paid_paise, coalesce(pi.s, 0) as settlement_received_paise,
             coalesce(cy.s, 0) as carry_paise
      from members m left join paid pd on pd.uid = m.user_id left join shares sh on sh.uid = m.user_id
      left join pout po on po.uid = m.user_id left join pin pi on pi.uid = m.user_id left join carry cy on cy.uid = m.user_id
    )
    select jsonb_agg(jsonb_build_object(
      'user_id', r.user_id, 'full_name', p.full_name, 'is_deleted', p.deleted_at is not null, 'status', r.status,
      'paid_paise', r.paid_paise, 'share_paise', r.share_paise,
      'settlement_paid_paise', r.settlement_paid_paise, 'settlement_received_paise', r.settlement_received_paise,
      'carry_paise', r.carry_paise,
      'current_paise', r.paid_paise - r.share_paise + r.settlement_paid_paise - r.settlement_received_paise,
      'net_paise', r.paid_paise - r.share_paise + r.settlement_paid_paise - r.settlement_received_paise + r.carry_paise,
      'earlier_until', v_until
    ) order by (r.status = 'active') desc, lower(p.full_name))
    from rows r join public.profiles p on p.id = r.user_id
    where r.status = 'active' or r.paid_paise <> 0 or r.share_paise <> 0 or r.settlement_paid_paise <> 0
       or r.settlement_received_paise <> 0 or r.carry_paise <> 0
  ), '[]'::jsonb);
end $$;

-- record_payment gets a new parameter -> replace the old signature
drop function if exists public.record_payment(uuid, uuid, uuid, uuid, bigint, text, timestamptz, text, text);
create or replace function public.record_payment(
  p_group_id uuid,
  p_idempotency_key uuid,
  p_from_user uuid,
  p_to_user uuid,
  p_amount_paise bigint,
  p_method text,
  p_paid_at timestamptz,
  p_reference text default null,
  p_note text default null,
  p_for_earlier boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ef bigint; v_et bigint;
  v_uid uuid;
  v_role text;
  v_id uuid;
  v_status text;
  v_name text;
begin
  v_uid := public.kh_require_role(p_group_id, 'member');
  perform public.kh_require_active_group(p_group_id);
  if p_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  select pm.id into v_id from public.payments pm
  where pm.group_id = p_group_id and pm.created_by = v_uid and pm.idempotency_key = p_idempotency_key;
  if v_id is not null then
    return v_id;
  end if;

  perform public.kh_rate_limit('record_payment', 120, 3600);

  -- date and time are always "now": nobody can choose or back-date a payment
  p_paid_at := now();

  -- a payment is EITHER for the earlier (closed-period) dues OR for the current period, never both
  if p_for_earlier then
    select coalesce((select k.s from public.kh_earlier_balances(p_group_id) k where k.uid = p_from_user), 0) into v_ef;
    select coalesce((select k.s from public.kh_earlier_balances(p_group_id) k where k.uid = p_to_user), 0) into v_et;
    if v_ef >= 0 or v_et <= 0 then raise exception 'NO_EARLIER_DUES'; end if;
    if p_amount_paise > least(-v_ef, v_et) then raise exception 'EARLIER_AMOUNT_TOO_HIGH'; end if;
  end if;

  select gm.role into v_role from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = v_uid and gm.status = 'active';

  if p_from_user is null or p_to_user is null or p_from_user = p_to_user then
    raise exception 'INVALID_PAYMENT_PARTIES';
  end if;
  if v_uid not in (p_from_user, p_to_user) and v_role not in ('owner', 'admin') then
    raise exception 'PAYMENT_ACTION_NOT_ALLOWED' using errcode = '42501';
  end if;
  if not public.kh_user_in_group(p_group_id, p_from_user) or not public.kh_user_in_group(p_group_id, p_to_user) then
    raise exception 'PAYMENT_PARTY_NOT_MEMBER';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 or p_amount_paise > 10000000000 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_method is null or p_method not in ('cash', 'upi', 'bank', 'other') then
    raise exception 'INVALID_METHOD';
  end if;
  if p_paid_at is null or p_paid_at > now() + interval '1 day' or p_paid_at < now() - interval '10 years' then
    raise exception 'INVALID_DATE';
  end if;
  if p_reference is not null and char_length(p_reference) > 100 then
    raise exception 'REFERENCE_TOO_LONG';
  end if;
  if p_note is not null and char_length(p_note) > 300 then
    raise exception 'NOTE_TOO_LONG';
  end if;

  v_status := case when v_uid = p_to_user then 'confirmed' else 'pending' end;

  insert into public.payments (
    group_id, from_user, to_user, amount_paise, method, paid_at, reference, note,
    status, created_by, idempotency_key, decided_by, decided_at, for_earlier
  )
  values (
    p_group_id, p_from_user, p_to_user, p_amount_paise, p_method, p_paid_at,
    nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_note, '')), ''),
    v_status, v_uid, p_idempotency_key,
    case when v_status = 'confirmed' then v_uid end,
    case when v_status = 'confirmed' then now() end,
    p_for_earlier
  )
  on conflict (group_id, created_by, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select pm.id into v_id from public.payments pm
    where pm.group_id = p_group_id and pm.created_by = v_uid and pm.idempotency_key = p_idempotency_key;
    return v_id;
  end if;

  perform public.kh_audit(p_group_id, 'payment.recorded', 'payments', v_id::text,
    jsonb_build_object('from', p_from_user, 'to', p_to_user, 'amount_paise', p_amount_paise,
                       'method', p_method, 'status', v_status));

  select p.full_name into v_name from public.profiles p where p.id = v_uid;
  if v_status = 'pending' then
    perform public.kh_notify(p_to_user, p_group_id, 'payment_pending',
      jsonb_build_object('name', v_name, 'amount_paise', p_amount_paise, 'payment_id', v_id), null);
  end if;
  if p_from_user <> v_uid then
    perform public.kh_notify(p_from_user, p_group_id, 'payment_recorded',
      jsonb_build_object('name', v_name, 'amount_paise', p_amount_paise, 'payment_id', v_id,
                         'status', v_status), null);
  end if;
  return v_id;
end;
$$;

create or replace function public.list_payments(
  p_group_id uuid,
  p_limit integer default 30,
  p_before_ts timestamptz default null,
  p_before_id uuid default null,
  p_status text default null,
  p_member_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_rows jsonb;
  v_count integer;
begin
  perform public.kh_require_role(p_group_id, 'member');
  select coalesce(jsonb_agg(t.j order by t.paid_at desc, t.id desc), '[]'::jsonb), count(*)
  into v_rows, v_count
  from (
    select pm.id, pm.paid_at, jsonb_build_object(
      'id', pm.id, 'from_user', pm.from_user, 'from_name', pf.full_name,
      'to_user', pm.to_user, 'to_name', pt.full_name,
      'amount_paise', pm.amount_paise, 'method', pm.method, 'paid_at', pm.paid_at,
      'reference', pm.reference, 'note', pm.note, 'status', pm.status,
      'created_by', pm.created_by, 'decided_by', pm.decided_by, 'decided_at', pm.decided_at,
      'decision_note', pm.decision_note, 'reverse_reason', pm.reverse_reason, 'created_at', pm.created_at,
      'for_earlier', pm.for_earlier,
      'receiver_active', exists (select 1 from public.group_members gm
                                 where gm.group_id = pm.group_id and gm.user_id = pm.to_user and gm.status = 'active')
    ) as j
    from public.payments pm
    join public.profiles pf on pf.id = pm.from_user
    join public.profiles pt on pt.id = pm.to_user
    where pm.group_id = p_group_id
      and (p_status is null or pm.status = p_status)
      and (p_member_id is null or pm.from_user = p_member_id or pm.to_user = p_member_id)
      and (p_before_ts is null or p_before_id is null or (pm.paid_at, pm.id) < (p_before_ts, p_before_id))
    order by pm.paid_at desc, pm.id desc
    limit v_limit + 1
  ) t;

  if v_count > v_limit then
    v_rows := v_rows - v_limit;
    return jsonb_build_object('items', v_rows, 'next', jsonb_build_object(
      'ts', v_rows -> (v_limit - 1) ->> 'paid_at', 'id', v_rows -> (v_limit - 1) ->> 'id'));
  end if;
  return jsonb_build_object('items', v_rows, 'next', null);
end;
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
      and (p_member_id is null or e.paid_by = p_member_id)
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

revoke all on function public.record_payment(uuid, uuid, uuid, uuid, bigint, text, timestamptz, text, text, boolean) from public, anon;
grant execute on function public.record_payment(uuid, uuid, uuid, uuid, bigint, text, timestamptz, text, text, boolean) to authenticated;

commit;
