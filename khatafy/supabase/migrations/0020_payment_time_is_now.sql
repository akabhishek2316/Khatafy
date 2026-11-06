-- 0020: a payment is always recorded with the current date and time (cannot be chosen or back-dated).
begin;

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

  -- date and time are always "now": nobody can choose or back-date a payment
  p_paid_at := now();

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

commit;
