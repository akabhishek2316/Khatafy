-- ============================================================
-- KHATAFY | 0006 STORAGE BUCKETS + REALTIME
-- receipts  : PRIVATE bucket, path  <group_id>/<expense_id>/<file>
-- avatars   : public-read bucket, path <user_id>/<file>
-- ============================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Receipts: only ACTIVE members of the group in the first path segment.
drop policy if exists khatafy_receipts_select on storage.objects;
create policy khatafy_receipts_select on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and public.is_group_member(public.try_uuid((storage.foldername(name))[1]))
);

drop policy if exists khatafy_receipts_insert on storage.objects;
create policy khatafy_receipts_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and array_length(storage.foldername(name), 1) = 2
  and public.is_group_member(public.try_uuid((storage.foldername(name))[1]))
  and exists (
    select 1 from public.expenses e
    where e.id = public.try_uuid((storage.foldername(name))[2])
      and e.group_id = public.try_uuid((storage.foldername(name))[1])
      and e.status = 'active'
  )
);
-- No update/delete policies on receipts: files are evidence and are never overwritten or deleted by clients.

-- Avatars: anyone signed in may read; users only write inside their own folder.
drop policy if exists khatafy_avatars_select on storage.objects;
create policy khatafy_avatars_select on storage.objects for select to authenticated
using (bucket_id = 'avatars');

drop policy if exists khatafy_avatars_insert on storage.objects;
create policy khatafy_avatars_insert on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists khatafy_avatars_update on storage.objects;
create policy khatafy_avatars_update on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists khatafy_avatars_delete on storage.objects;
create policy khatafy_avatars_delete on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Realtime: clients only receive rows their RLS select policies allow.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['expenses', 'payments', 'group_members', 'join_requests',
                             'notifications', 'shopping_list_items', 'group_notices']
    loop
      if not exists (
        select 1 from pg_publication_tables pt
        where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' and pt.tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

commit;
