-- Fix profile photo for a specific user (or all users) when upload works but DB does not update,
-- or when profiles.id does not match auth.uid(). Safe to re-run.

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists phone_number text;

-- Remove legacy single policy that can block updates when re-applied with newer policies.
drop policy if exists "profiles_self" on public.profiles;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Reliable avatar_url write for the signed-in user (bypasses RLS edge cases).
create or replace function public.set_my_avatar_url(p_avatar_url text)
returns table (id uuid, avatar_url text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_username text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    v_username := 'user_' || replace(substr(v_uid::text, 1, 8), '-', '');
    if exists (select 1 from public.profiles p where p.username = v_username) then
      v_username := v_username || '_' || replace(substr(v_uid::text, 9, 4), '-', '');
    end if;
    insert into public.profiles (id, username) values (v_uid, v_username);
  end if;

  return query
  update public.profiles
  set avatar_url = nullif(trim(p_avatar_url), '')
  where public.profiles.id = v_uid
  returning public.profiles.id, public.profiles.avatar_url;
end;
$$;

revoke all on function public.set_my_avatar_url(text) from public;
grant execute on function public.set_my_avatar_url(text) to authenticated;

-- ─── Diagnostic for one user (run in SQL Editor if a specific account still fails) ─
-- Replace with the profile id from public.profiles:
--
-- select u.id as auth_user_id, p.id as profile_id, p.username, p.avatar_url
-- from public.profiles p
-- left join auth.users u on u.id = p.id
-- where p.id = '884b5def-1594-49e7-b849-7e4199ecd604';
--
-- auth_user_id MUST equal profile_id. If auth_user_id is NULL, that profile row is orphaned
-- (no login). The user must sign in with the account that owns that auth.users row, or
-- delete the orphan profile row and sign up again.

-- Storage: avatar folder must match signed-in user (case-insensitive UUID text).
drop policy if exists "chat_media_insert_own_paths" on storage.objects;
create policy "chat_media_insert_own_paths"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (
      (
        lower(split_part(name, '/', 1)) = 'avatar'
        and lower(split_part(name, '/', 2)) = lower((auth.uid())::text)
      )
      or (
        lower(split_part(name, '/', 1)) = 'status'
        and lower(split_part(name, '/', 2)) = lower((auth.uid())::text)
      )
      or exists (
        select 1 from public.conversation_participants cp
        where cp.user_id = auth.uid()
          and lower(cp.conversation_id::text) = lower(split_part(name, '/', 1))
      )
    )
  );

drop policy if exists "chat_media_update_own_paths" on storage.objects;
create policy "chat_media_update_own_paths"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      (
        lower(split_part(name, '/', 1)) = 'avatar'
        and lower(split_part(name, '/', 2)) = lower((auth.uid())::text)
      )
      or (
        lower(split_part(name, '/', 1)) = 'status'
        and lower(split_part(name, '/', 2)) = lower((auth.uid())::text)
      )
      or exists (
        select 1 from public.conversation_participants cp
        where cp.user_id = auth.uid()
          and lower(cp.conversation_id::text) = lower(split_part(name, '/', 1))
      )
    )
  )
  with check (
    bucket_id = 'chat-media'
    and (
      (
        lower(split_part(name, '/', 1)) = 'avatar'
        and lower(split_part(name, '/', 2)) = lower((auth.uid())::text)
      )
      or (
        lower(split_part(name, '/', 1)) = 'status'
        and lower(split_part(name, '/', 2)) = lower((auth.uid())::text)
      )
      or exists (
        select 1 from public.conversation_participants cp
        where cp.user_id = auth.uid()
          and lower(cp.conversation_id::text) = lower(split_part(name, '/', 1))
      )
    )
  );
