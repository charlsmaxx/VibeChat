-- Run in Supabase SQL Editor after storage_and_profiles_access.sql (or any time).
-- Dedicated bucket for status images/videos (paths: <userId>/<timestamp>.ext).

insert into storage.buckets (id, name, public, file_size_limit)
values ('status-media', 'status-media', true, 52428800)
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "status_media_insert_own_folder" on storage.objects;
create policy "status_media_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'status-media'
    and split_part(name, '/', 1) = (auth.uid())::text
  );

drop policy if exists "status_media_update_own_folder" on storage.objects;
create policy "status_media_update_own_folder"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'status-media' and split_part(name, '/', 1) = (auth.uid())::text)
  with check (bucket_id = 'status-media' and split_part(name, '/', 1) = (auth.uid())::text);

drop policy if exists "status_media_delete_own_folder" on storage.objects;
create policy "status_media_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'status-media' and split_part(name, '/', 1) = (auth.uid())::text);
