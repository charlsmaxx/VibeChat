-- ═══════════════════════════════════════════════════════════════════════════════
-- VibeChat critical fix — run ONCE in Supabase SQL Editor (safe to re-run).
-- Fixes: (1) tap user → app closes, (2) some users cannot update profile photo.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. RLS helper (no infinite recursion on participants) ───────────────────
create or replace function public.user_is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid()
  );
$$;
revoke all on function public.user_is_conversation_member(uuid) from public;
grant execute on function public.user_is_conversation_member(uuid) to authenticated;

-- ─── 2. Profiles ─────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists phone_number text;

drop policy if exists "profiles_self" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.set_my_avatar_url(p_avatar_url text)
returns table (id uuid, avatar_url text)
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_username text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    v_username := 'user_' || replace(substr(v_uid::text, 1, 8), '-', '');
    if exists (select 1 from public.profiles p where p.username = v_username) then
      v_username := v_username || '_' || replace(substr(v_uid::text, 9, 4), '-', '');
    end if;
    insert into public.profiles (id, username) values (v_uid, v_username);
  end if;
  return query update public.profiles set avatar_url = nullif(trim(p_avatar_url), '')
    where public.profiles.id = v_uid returning public.profiles.id, public.profiles.avatar_url;
end;
$$;
revoke all on function public.set_my_avatar_url(text) from public;
grant execute on function public.set_my_avatar_url(text) to authenticated;

-- ─── 3. Conversations + participants (open chat) ─────────────────────────────
drop policy if exists "conversations_members_only" on public.conversations;
create policy "conversations_members_only" on public.conversations for select to authenticated
  using (public.user_is_conversation_member(id) or created_by = auth.uid());

drop policy if exists "participants_self" on public.conversation_participants;
drop policy if exists "participants_select_member" on public.conversation_participants;
create policy "participants_select_member" on public.conversation_participants for select to authenticated
  using (public.user_is_conversation_member(conversation_id));

drop policy if exists "participants_insert_by_owner" on public.conversation_participants;
create policy "participants_insert_by_owner" on public.conversation_participants for insert to authenticated
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.conversations c where c.id = conversation_participants.conversation_id and c.created_by = auth.uid())
  );

create or replace function public.create_direct_conversation(p_peer_id uuid, p_title text default 'Chat')
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_uid uuid := auth.uid(); v_title text := coalesce(nullif(trim(p_title), ''), 'Chat');
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_peer_id is null or p_peer_id = v_uid then raise exception 'Cannot start a chat with yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_peer_id) then raise exception 'That user has no profile yet'; end if;
  select a.conversation_id into v_id from public.conversation_participants a
    inner join public.conversation_participants b on b.conversation_id = a.conversation_id
    inner join public.conversations c on c.id = a.conversation_id
    where a.user_id = v_uid and b.user_id = p_peer_id and c.is_group = false limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.conversations (title, is_group, created_by) values (v_title, false, v_uid) returning id into v_id;
  insert into public.conversation_participants (conversation_id, user_id) values (v_id, v_uid), (v_id, p_peer_id);
  return v_id;
end;
$$;
revoke all on function public.create_direct_conversation(uuid, text) from public;
grant execute on function public.create_direct_conversation(uuid, text) to authenticated;

-- ─── 4. Messages (load + send in chat) ───────────────────────────────────────
drop policy if exists "messages_participants_read" on public.messages;
create policy "messages_participants_read" on public.messages for select to authenticated
  using (public.user_is_conversation_member(conversation_id));
drop policy if exists "messages_sender_insert" on public.messages;
create policy "messages_sender_insert" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.user_is_conversation_member(conversation_id));
drop policy if exists "messages_participant_update" on public.messages;
create policy "messages_participant_update" on public.messages for update to authenticated
  using (public.user_is_conversation_member(conversation_id))
  with check (public.user_is_conversation_member(conversation_id));

drop policy if exists "conversations_update_member" on public.conversations;
create policy "conversations_update_member" on public.conversations for update to authenticated
  using (public.user_is_conversation_member(id)) with check (public.user_is_conversation_member(id));

-- ─── 5. Storage (profile photos + chat media) ────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', true, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 10485760)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "chat_media_insert_own_paths" on storage.objects;
create policy "chat_media_insert_own_paths" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media' and (
      (lower(split_part(name, '/', 1)) = 'avatar' and lower(split_part(name, '/', 2)) = lower((auth.uid())::text))
      or (lower(split_part(name, '/', 1)) = 'status' and lower(split_part(name, '/', 2)) = lower((auth.uid())::text))
      or exists (select 1 from public.conversation_participants cp where cp.user_id = auth.uid()
        and lower(cp.conversation_id::text) = lower(split_part(name, '/', 1)))
    )
  );
drop policy if exists "chat_media_update_own_paths" on storage.objects;
create policy "chat_media_update_own_paths" on storage.objects for update to authenticated
  using (
    bucket_id = 'chat-media' and (
      (lower(split_part(name, '/', 1)) = 'avatar' and lower(split_part(name, '/', 2)) = lower((auth.uid())::text))
      or (lower(split_part(name, '/', 1)) = 'status' and lower(split_part(name, '/', 2)) = lower((auth.uid())::text))
      or exists (select 1 from public.conversation_participants cp where cp.user_id = auth.uid()
        and lower(cp.conversation_id::text) = lower(split_part(name, '/', 1)))
    )
  )
  with check (
    bucket_id = 'chat-media' and (
      (lower(split_part(name, '/', 1)) = 'avatar' and lower(split_part(name, '/', 2)) = lower((auth.uid())::text))
      or (lower(split_part(name, '/', 1)) = 'status' and lower(split_part(name, '/', 2)) = lower((auth.uid())::text))
      or exists (select 1 from public.conversation_participants cp where cp.user_id = auth.uid()
        and lower(cp.conversation_id::text) = lower(split_part(name, '/', 1)))
    )
  );
drop policy if exists "chat_media_select_public" on storage.objects;
create policy "chat_media_select_public" on storage.objects for select using (bucket_id = 'chat-media');

drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and lower(split_part(name, '/', 1)) = lower((auth.uid())::text));
drop policy if exists "avatars_update_own_folder" on storage.objects;
create policy "avatars_update_own_folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and lower(split_part(name, '/', 1)) = lower((auth.uid())::text))
  with check (bucket_id = 'avatars' and lower(split_part(name, '/', 1)) = lower((auth.uid())::text));
drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public" on storage.objects for select using (bucket_id = 'avatars');
