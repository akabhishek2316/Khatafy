-- ============================================================
-- KHATAFY | 0004 PAYMENTS, LEDGER, BALANCES, REPORTS, REMINDERS
--
-- Balance formula (per member, confirmed records only):
--   net = paid_for_group - allocated_share + settlements_paid_out - settlements_received
-- Positive net  => the member should RECEIVE money ("You will get").
-- Negative net  => the member OWES money ("You need to pay").
--
-- NOTE: the original build pack wrote the settlement terms with the opposite
-- signs ("- settlement paid + settlement received"). That would make a debtor
-- who pays back appear to owe MORE, so the economically correct signs are
-- used here and covered by tests (a full settlement brings the net to 0).
-- ============================================================

begin;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  from_user uuid not null references public.profiles(id),
  to_user uuid not null references public.profiles(id),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 10000000000),
  method text not null check (method in ('cash', 'upi', 'bank', 'other')),
  paid_at timestamptz not null,
  reference text check (reference is null or char_length(reference) <= 100),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'cancelled', 'reversed')),
  created_by uuid not null references public.profiles(id),
  idempotency_key uuid not null,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  reversed_by uuid references public.profiles(id),
  reversed_at timestamptz,
  reverse_reason text check (reverse_reason is null or char_length(reverse_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_user <> to_user),
  check ((status = 'pending') = (decided_at is null)),
  check ((status = 'reversed') = (reversed_at is not null)),
  unique (id, group_id),
  unique (group_id, created_by, idempotency_key)
);
create index if not exists idx_payments_group_paid on public.payments(group_id, paid_at desc, id desc);
create index if not exists idx_payments_group_from on public.payments(group_id, from_user);
create index if not exists idx_payments_group_to on public.payments(group_id, to_user);
create index if not exists idx_payments_group_status on public.payments(group_id, status);

create or replace function public.enforce_payment_members()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.kh_user_in_group(new.group_id, new.from_user)
     or not public.kh_user_in_group(new.group_id, new.to_user)
     or not public.kh_user_in_group(new.group_id, new.created_by) then
    raise exception 'PAYMENT_PARTY_NOT_MEMBER';
  end if;
  return new;
end;
$$;

create or replace function public.guard_payment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.group_id, new.from_user, new.to_user, new.amount_paise, new.method, new.paid_at,
      new.created_by, new.idempotency_key, new.created_at)
     is distinct from
     (old.group_id, old.from_user, old.to_user, old.amount_paise, old.method, old.paid_at,
      old.created_by, old.idempotency_key, old.created_at) then
    raise exception 'IMMUTABLE_RECORD';
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending' and new.status in ('confirmed', 'rejected', 'cancelled'))
      or (old.status = 'confirmed' and new.status = 'reversed')
    ) then
      raise exception 'INVALID_PAYMENT_TRANSITION';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_payments_members on public.payments;
create trigger trg_payments_members before insert on public.payments
  for each row execute function public.enforce_payment_members();
drop trigger if exists trg_payments_guard on public.payments;
create trigger trg_payments_guard before update on public.payments
  for each row execute function public.guard_payment_update();
drop trigger if exists trg_payments_no_delete on public.payments;
create trigger trg_payments_no_delete before delete on public.payments
  for each row execute function public.block_hard_delete();

alter table public.payments enable row level security;
drop policy if exists payments_select_members on public.payments;
create policy payments_select_members on public.payments for select to authenticated
  using (public.is_group_member(group_id));
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

-- ------------------------------------------------------------
-- Write RPCs
-- ------------------------------------------------------------
-- Who confirms?  Only the RECEIVER confirms a payment (or an admin when the
-- receiver has left the group). A payment recorded by the receiver is
-- confirmed immediately because the receiver is acknowledging it themselves.
-- Recording is a manual bookkeeping action - it is NOT proof of a bank/UPI transfer.
create or replace function public.record_payment(
  p_group_id uuid,
  p_idempotency_key uuid,
  p_from_user uuid,
  p_to_user uuid,
  p_amount_paise bigint,
  p_method text,
  p_paid_at timestamptz,
  p_reference text default null,
  p_note text default null
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
    status, created_by, idempotency_key, decided_by, decided_at
  )
  values (
    p_group_id, p_from_user, p_to_user, p_amount_paise, p_method, p_paid_at,
    nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_note, '')), ''),
    v_status, v_uid, p_idempotency_key,
    case when v_status = 'confirmed' then v_uid end,
    case when v_status = 'confirmed' then now() end
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

-- p_action: 'confirm' | 'reject' | 'cancel' | 'reverse'
create or replace function public.update_payment_status(
  p_payment_id uuid, p_action text, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_pm public.payments%rowtype;
  v_role text;
  v_receiver_active boolean;
  v_is_receiver boolean;
  v_can_decide boolean;
  v_name text;
  v_other uuid;
  v_type text;
begin
  if p_action is null or p_action not in ('confirm', 'reject', 'cancel', 'reverse') then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_pm from public.payments pm where pm.id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  v_uid := public.kh_require_role(v_pm.group_id, 'member');
  perform public.kh_require_active_group(v_pm.group_id);

  select gm.role into v_role from public.group_members gm
  where gm.group_id = v_pm.group_id and gm.user_id = v_uid and gm.status = 'active';
  v_receiver_active := exists (
    select 1 from public.group_members gm
    where gm.group_id = v_pm.group_id and gm.user_id = v_pm.to_user and gm.status = 'active');
  v_is_receiver := (v_uid = v_pm.to_user);
  v_can_decide := v_is_receiver or (v_role in ('owner', 'admin') and not v_receiver_active);

  if p_action = 'confirm' then
    if v_pm.status <> 'pending' then raise exception 'PAYMENT_NOT_PENDING'; end if;
    if not v_can_decide then raise exception 'PAYMENT_ACTION_NOT_ALLOWED' using errcode = '42501'; end if;
    update public.payments set status = 'confirmed', decided_by = v_uid, decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), '') where id = v_pm.id;
    v_type := 'payment_confirmed';

  elsif p_action = 'reject' then
    if v_pm.status <> 'pending' then raise exception 'PAYMENT_NOT_PENDING'; end if;
    if not v_can_decide then raise exception 'PAYMENT_ACTION_NOT_ALLOWED' using errcode = '42501'; end if;
    if p_note is null or char_length(trim(p_note)) < 3 then raise exception 'REASON_REQUIRED'; end if;
    update public.payments set status = 'rejected', decided_by = v_uid, decided_at = now(),
      decision_note = left(trim(p_note), 300) where id = v_pm.id;
    v_type := 'payment_rejected';

  elsif p_action = 'cancel' then
    if v_pm.status <> 'pending' then raise exception 'PAYMENT_NOT_PENDING'; end if;
    if v_uid not in (v_pm.created_by, v_pm.from_user) then
      raise exception 'PAYMENT_ACTION_NOT_ALLOWED' using errcode = '42501';
    end if;
    update public.payments set status = 'cancelled', decided_by = v_uid, decided_at = now(),
      decision_note = nullif(left(trim(coalesce(p_note, '')), 300), '') where id = v_pm.id;
    v_type := 'payment_cancelled';

  else -- reverse
    if v_pm.status <> 'confirmed' then raise exception 'PAYMENT_NOT_CONFIRMED'; end if;
    if not (v_is_receiver or v_role in ('owner', 'admin')) then
      raise exception 'PAYMENT_ACTION_NOT_ALLOWED' using errcode = '42501';
    end if;
    if p_note is null or char_length(trim(p_note)) < 3 then raise exception 'REASON_REQUIRED'; end if;
    update public.payments set status = 'reversed', reversed_by = v_uid, reversed_at = now(),
      reverse_reason = left(trim(p_note), 300) where id = v_pm.id;
    v_type := 'payment_reversed';
  end if;

  perform public.kh_audit(v_pm.group_id, 'payment.' || p_action, 'payments', v_pm.id::text,
    jsonb_build_object('amount_paise', v_pm.amount_paise, 'from', v_pm.from_user, 'to', v_pm.to_user,
                       'note', nullif(left(trim(coalesce(p_note, '')), 300), '')));

  select p.full_name into v_name from public.profiles p where p.id = v_uid;
  for v_other in
    select u from (values (v_pm.from_user), (v_pm.to_user), (v_pm.created_by)) t(u) group by u
  loop
    if v_other <> v_uid then
      perform public.kh_notify(v_other, v_pm.group_id, v_type,
        jsonb_build_object('name', v_name, 'amount_paise', v_pm.amount_paise, 'payment_id', v_pm.id), null);
    end if;
  end loop;
end;
$$;

-- Friendly nudge (in-app notification). Max one per target per 12 hours.
create or replace function public.send_payment_reminder(p_group_id uuid, p_to_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_net bigint;
  v_name text;
  v_group_name text;
begin
  v_uid := public.kh_require_role(p_group_id, 'member');
  perform public.kh_require_active_group(p_group_id);
  if p_to_user = v_uid then
    raise exception 'INVALID_PAYMENT_PARTIES';
  end if;
  if not exists (select 1 from public.group_members gm
                 where gm.group_id = p_group_id and gm.user_id = p_to_user and gm.status = 'active') then
    raise exception 'PAYMENT_PARTY_NOT_MEMBER';
  end if;

  select coalesce((
    select (b ->> 'net_paise')::bigint
    from jsonb_array_elements(public.get_group_balances(p_group_id, null, null)) b
    where (b ->> 'user_id')::uuid = p_to_user
  ), 0) into v_net;
  if v_net >= 0 then
    raise exception 'NOTHING_TO_REMIND';
  end if;

  perform public.kh_rate_limit('remind:' || p_to_user::text, 1, 43200);

  select p.full_name into v_name from public.profiles p where p.id = v_uid;
  select g.name into v_group_name from public.groups g where g.id = p_group_id;
  perform public.kh_notify(p_to_user, p_group_id, 'payment_reminder',
    jsonb_build_object('name', v_name, 'owed_paise', -v_net, 'group_name', v_group_name), null);
end;
$$;

-- ------------------------------------------------------------
-- Balances & ledger
-- ------------------------------------------------------------
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
             coalesce(pi.s, 0) as settlement_received_paise
      from members m
      left join paid pd on pd.uid = m.user_id
      left join shares sh on sh.uid = m.user_id
      left join pout po on po.uid = m.user_id
      left join pin pi on pi.uid = m.user_id
    )
    select jsonb_agg(jsonb_build_object(
      'user_id', r.user_id, 'full_name', p.full_name, 'is_deleted', p.deleted_at is not null,
      'status', r.status,
      'paid_paise', r.paid_paise, 'share_paise', r.share_paise,
      'settlement_paid_paise', r.settlement_paid_paise,
      'settlement_received_paise', r.settlement_received_paise,
      'net_paise', r.paid_paise - r.share_paise + r.settlement_paid_paise - r.settlement_received_paise
    ) order by (r.status = 'active') desc, lower(p.full_name))
    from rows r join public.profiles p on p.id = r.user_id
    where r.status = 'active'
       or r.paid_paise <> 0 or r.share_paise <> 0 or r.settlement_paid_paise <> 0 or r.settlement_received_paise <> 0
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_member_ledger(
  p_group_id uuid, p_user_id uuid, p_limit integer default 50, p_offset integer default 0,
  p_from timestamptz default null, p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_summary jsonb;
  v_entries jsonb;
  v_total bigint;
begin
  perform public.kh_require_role(p_group_id, 'member');
  if not public.kh_user_in_group(p_group_id, p_user_id) then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;

  select b into v_summary
  from jsonb_array_elements(public.get_group_balances(p_group_id, p_from, p_to)) b
  where (b ->> 'user_id')::uuid = p_user_id;
  if v_summary is null then
    v_summary := jsonb_build_object('user_id', p_user_id, 'paid_paise', 0, 'share_paise', 0,
      'settlement_paid_paise', 0, 'settlement_received_paise', 0, 'net_paise', 0);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', t.kind, 'id', t.ref_id, 'title', t.title, 'occurred_at', t.occurred_at,
    'paid_paise', t.paid_paise, 'share_paise', t.share_paise, 'effect_paise', t.effect_paise,
    'status', t.status, 'counterparty_id', t.counterparty_id, 'counterparty_name', t.counterparty_name,
    'category_key', t.category_key
  ) order by t.occurred_at desc, t.ref_id desc), '[]'::jsonb), coalesce(max(t.total), 0)
  into v_entries, v_total
  from (
    select u.*, count(*) over () as total
    from (
      select 'expense'::text as kind, e.id as ref_id, e.title as title, e.spent_at as occurred_at,
             case when e.paid_by = p_user_id then e.amount_paise else 0 end as paid_paise,
             coalesce(es.share_paise, 0) as share_paise,
             (case when e.paid_by = p_user_id then e.amount_paise else 0 end - coalesce(es.share_paise, 0)) as effect_paise,
             'active'::text as status, null::uuid as counterparty_id, null::text as counterparty_name,
             e.category_key as category_key
      from public.expenses e
      left join public.expense_splits es
        on es.expense_id = e.id and es.version = e.version and es.user_id = p_user_id
      where e.group_id = p_group_id and e.status = 'active'
        and (e.paid_by = p_user_id or es.user_id is not null)
        and (p_from is null or e.spent_at >= p_from) and (p_to is null or e.spent_at < p_to)
      union all
      select case when pm.from_user = p_user_id then 'payment_out' else 'payment_in' end,
             pm.id, coalesce(pm.reference, pm.method), pm.paid_at,
             0::bigint, 0::bigint,
             case when pm.status <> 'confirmed' then 0::bigint
                  when pm.from_user = p_user_id then pm.amount_paise
                  else -pm.amount_paise end,
             pm.status,
             case when pm.from_user = p_user_id then pm.to_user else pm.from_user end,
             (select pp.full_name from public.profiles pp
              where pp.id = case when pm.from_user = p_user_id then pm.to_user else pm.from_user end),
             null::text
      from public.payments pm
      where pm.group_id = p_group_id and (pm.from_user = p_user_id or pm.to_user = p_user_id)
        and (p_from is null or pm.paid_at >= p_from) and (p_to is null or pm.paid_at < p_to)
    ) u
    order by u.occurred_at desc, u.ref_id desc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object(
    'summary', v_summary, 'entries', v_entries, 'total', v_total,
    'has_more', (v_offset + v_limit) < v_total
  );
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

-- ------------------------------------------------------------
-- Monthly report (month boundaries follow the GROUP timezone)
-- ------------------------------------------------------------
create or replace function public.get_group_report(p_group_id uuid, p_month date)
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
  if p_month is null then
    raise exception 'INVALID_DATE';
  end if;
  select g.timezone into v_tz from public.groups g where g.id = p_group_id;
  v_local_month := date_trunc('month', p_month::timestamp);
  v_start := v_local_month at time zone v_tz;
  v_end := (v_local_month + interval '1 month') at time zone v_tz;

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

-- ------------------------------------------------------------
-- Privileges
-- ------------------------------------------------------------
revoke all on function public.enforce_payment_members() from public, anon, authenticated;
revoke all on function public.guard_payment_update() from public, anon, authenticated;

revoke all on function public.record_payment(uuid, uuid, uuid, uuid, bigint, text, timestamptz, text, text) from public, anon;
revoke all on function public.update_payment_status(uuid, text, text) from public, anon;
revoke all on function public.send_payment_reminder(uuid, uuid) from public, anon;
revoke all on function public.get_group_balances(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.get_member_ledger(uuid, uuid, integer, integer, timestamptz, timestamptz) from public, anon;
revoke all on function public.list_payments(uuid, integer, timestamptz, uuid, text, uuid) from public, anon;
revoke all on function public.get_group_report(uuid, date) from public, anon;

grant execute on function public.record_payment(uuid, uuid, uuid, uuid, bigint, text, timestamptz, text, text) to authenticated;
grant execute on function public.update_payment_status(uuid, text, text) to authenticated;
grant execute on function public.send_payment_reminder(uuid, uuid) to authenticated;
grant execute on function public.get_group_balances(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_member_ledger(uuid, uuid, integer, integer, timestamptz, timestamptz) to authenticated;
grant execute on function public.list_payments(uuid, integer, timestamptz, uuid, text, uuid) to authenticated;
grant execute on function public.get_group_report(uuid, date) to authenticated;

commit;
