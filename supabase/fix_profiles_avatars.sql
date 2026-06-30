-- Legacy fix for profile photos. Prefer: fix_chat_rls_and_avatars.sql (chat RLS + avatars + chat-media paths).
-- Safe to re-run.

-- ─── profiles columns (older DBs may lack these) ─────────────────────────────
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists phone_number text;

-- ─── avatars bucket ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 10485760)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- ─── storage RLS: avatars (upload / replace / delete own folder) ─────────────
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
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (auth.uid())::text
  );

drop policy if exists "avatars_delete_own_folder" on storage.objects;
create policy "avatars_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (auth.uid())::text
  );

-- Public bucket: allow read via API (URLs work; this helps some clients)
drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- ─── profiles RLS (read for discovery, write own row only) ───────────────────
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
