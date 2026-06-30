-- Run in Supabase SQL Editor after schema.sql and whatsapp_features.sql.
-- Also run: status_media_bucket.sql, fix_chat_rls_and_avatars.sql (chat + profile photos).
-- Fixes: (1) storage buckets + upload policies, (2) profiles readable to authenticated users for contact discovery.

-- ─── Storage buckets ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', true, 52428800)
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 10485760)
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- ─── Storage policies: chat-media ─────────────────────────────────────────────
drop policy if exists "chat_media_insert_own_paths" on storage.objects;
create policy "chat_media_insert_own_paths"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and (
      (
        split_part(name, '/', 1) = 'avatar'
        and split_part(name, '/', 2) = (auth.uid())::text
      )
      or (
        split_part(name, '/', 1) = 'status'
        and split_part(name, '/', 2) = (auth.uid())::text
      )
      or exists (
        select 1
        from public.conversation_participants cp
        where cp.user_id = auth.uid()
          and cp.conversation_id::text = split_part(name, '/', 1)
      )
    )
  );

drop policy if exists "chat_media_update_own_paths" on storage.objects;
create policy "chat_media_update_own_paths"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      (
        split_part(name, '/', 1) = 'avatar'
        and split_part(name, '/', 2) = (auth.uid())::text
      )
      or (
        split_part(name, '/', 1) = 'status'
        and split_part(name, '/', 2) = (auth.uid())::text
      )
      or exists (
        select 1
        from public.conversation_participants cp
        where cp.user_id = auth.uid()
          and cp.conversation_id::text = split_part(name, '/', 1)
      )
    )
  )
  with check (
    bucket_id = 'chat-media'
    and (
      (
        split_part(name, '/', 1) = 'avatar'
        and split_part(name, '/', 2) = (auth.uid())::text
      )
      or (
        split_part(name, '/', 1) = 'status'
        and split_part(name, '/', 2) = (auth.uid())::text
      )
      or exists (
        select 1
        from public.conversation_participants cp
        where cp.user_id = auth.uid()
          and cp.conversation_id::text = split_part(name, '/', 1)
      )
    )
  );

drop policy if exists "chat_media_delete_own_paths" on storage.objects;
create policy "chat_media_delete_own_paths"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      (
        split_part(name, '/', 1) = 'avatar'
        and split_part(name, '/', 2) = (auth.uid())::text
      )
      or (
        split_part(name, '/', 1) = 'status'
        and split_part(name, '/', 2) = (auth.uid())::text
      )
      or exists (
        select 1
        from public.conversation_participants cp
        where cp.user_id = auth.uid()
          and cp.conversation_id::text = split_part(name, '/', 1)
      )
    )
  );

-- ─── Storage policies: avatars ────────────────────────────────────────────────
drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (auth.uid())::text
  );

drop policy if exists "avatars_update_own_folder" on storage.objects;
create policy "avatars_update_own_folder"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (auth.uid())::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (auth.uid())::text);

drop policy if exists "avatars_delete_own_folder" on storage.objects;
create policy "avatars_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (auth.uid())::text);

-- ─── Profiles RLS: allow read for discovery; keep write self-only ─────────────
drop policy if exists "profiles_self" on public.profiles;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id);
