-- ============================================================
-- KHATAFY | 0007 ACCOUNT EXPORT + DELETION (privacy)
-- ============================================================

begin;

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := public.kh_uid();
begin
  perform public.kh_rate_limit('export_data', 5, 3600);
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'deleted_at' from public.profiles p where p.id = v_uid),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'group_id', gm.group_id, 'group_name', g.name, 'role', gm.role, 'status', gm.status,
        'joined_at', gm.joined_at, 'left_at', gm.left_at))
      from public.group_members gm join public.groups g on g.id = gm.group_id
      where gm.user_id = v_uid), '[]'::jsonb),
    'expenses_paid_or_created', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'group_id', e.group_id, 'title', e.title, 'amount_paise', e.amount_paise,
        'category', e.category_key, 'spent_at', e.spent_at, 'paid_by_me', e.paid_by = v_uid,
        'created_by_me', e.created_by = v_uid, 'status', e.status, 'note', e.note))
      from public.expenses e where e.paid_by = v_uid or e.created_by = v_uid), '[]'::jsonb),
    'my_expense_shares', coalesce((
      select jsonb_agg(jsonb_build_object(
        'expense_id', es.expense_id, 'group_id', es.group_id, 'share_paise', es.share_paise, 'version', es.version))
      from public.expense_splits es where es.user_id = v_uid), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pm.id, 'group_id', pm.group_id, 'from_user', pm.from_user, 'to_user', pm.to_user,
        'amount_paise', pm.amount_paise, 'method', pm.method, 'paid_at', pm.paid_at,
        'status', pm.status, 'reference', pm.reference, 'note', pm.note))
      from public.payments pm where pm.from_user = v_uid or pm.to_user = v_uid), '[]'::jsonb),
    'join_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', jr.id, 'group_id', jr.group_id, 'status', jr.status, 'created_at', jr.created_at))
      from public.join_requests jr where jr.user_id = v_uid), '[]'::jsonb)
  );
end;
$$;

-- Anonymises the profile (financial history stays readable to other members as
-- "Deleted user"), removes the person from every group and deletes the login.
-- Group owners with other active members must transfer ownership first.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.kh_uid();
begin
  perform public.kh_rate_limit('delete_account', 5, 3600);

  if exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.user_id = v_uid and gm.status = 'active' and gm.role = 'owner' and g.status = 'active'
      and exists (select 1 from public.group_members o
                  where o.group_id = gm.group_id and o.status = 'active' and o.user_id <> v_uid)
  ) then
    raise exception 'OWNER_MUST_TRANSFER';
  end if;

  -- groups where the user is the only remaining member get archived
  update public.groups g set status = 'archived'
  where g.status = 'active'
    and exists (select 1 from public.group_members gm
                where gm.group_id = g.id and gm.user_id = v_uid and gm.status = 'active' and gm.role = 'owner')
    and not exists (select 1 from public.group_members o
                    where o.group_id = g.id and o.status = 'active' and o.user_id <> v_uid);
  update public.group_invitations gi set revoked_at = coalesce(gi.revoked_at, now())
  where gi.revoked_at is null
    and exists (select 1 from public.groups g where g.id = gi.group_id and g.status = 'archived');

  update public.join_requests
  set status = 'cancelled', reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  where user_id = v_uid and status = 'pending';

  update public.payments
  set status = 'cancelled', decided_by = v_uid, decided_at = now(), decision_note = 'account deleted'
  where status = 'pending' and (from_user = v_uid or created_by = v_uid);

  update public.group_members set status = 'left', left_at = now()
  where user_id = v_uid and status = 'active';

  delete from public.push_tokens where user_id = v_uid;
  delete from public.notifications where user_id = v_uid;

  update public.profiles
  set full_name = 'Deleted user', phone = null, avatar_url = null, deleted_at = now()
  where id = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.export_my_data() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;

commit;
