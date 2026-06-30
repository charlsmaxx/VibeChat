-- Run in Supabase SQL Editor (fixes: chat hang / no response, profile photo upload).
-- Safe to re-run. Run AFTER schema.sql.

-- ─── RLS helpers (avoid infinite recursion on conversation_participants) ─────
create or replace function public.user_is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.user_is_conversation_member(uuid) from public;
grant execute on function public.user_is_conversation_member(uuid) to authenticated;

-- ─── profiles columns + RLS ─────────────────────────────────────────────────
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists phone_number text;

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

-- ─── conversations + participants RLS ─────────────────────────────────────────
drop policy if exists "conversations_members_only" on public.conversations;
create policy "conversations_members_only"
  on public.conversations for select to authenticated
  using (
    public.user_is_conversation_member(id)
    or created_by = auth.uid()
  );

drop policy if exists "participants_self" on public.conversation_participants;
drop policy if exists "participants_select_member" on public.conversation_participants;
create policy "participants_select_member"
  on public.conversation_participants for select to authenticated
  using (public.user_is_conversation_member(conversation_id));

drop policy if exists "participants_insert_by_owner" on public.conversation_participants;
create policy "participants_insert_by_owner"
  on public.conversation_participants for insert to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_participants.conversation_id
        and c.created_by = auth.uid()
    )
  );

-- ─── storage: chat-media bucket (profile photos use avatar/{userId}/ path) ───
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', true, 52428800)
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 10485760)
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "chat_media_insert_own_paths" on storage.objects;
create policy "chat_media_insert_own_paths"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (
      (split_part(name, '/', 1) = 'avatar' and split_part(name, '/', 2) = (auth.uid())::text)
      or (split_part(name, '/', 1) = 'status' and split_part(name, '/', 2) = (auth.uid())::text)
      or exists (
        select 1 from public.conversation_participants cp
        where cp.user_id = auth.uid()
          and cp.conversation_id::text = split_part(name, '/', 1)
      )
    )
  );

drop policy if exists "chat_media_update_own_paths" on storage.objects;
create policy "chat_media_update_own_paths"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      (split_part(name, '/', 1) = 'avatar' and split_part(name, '/', 2) = (auth.uid())::text)
      or (split_part(name, '/', 1) = 'status' and split_part(name, '/', 2) = (auth.uid())::text)
      or exists (
        select 1 from public.conversation_participants cp
        where cp.user_id = auth.uid()
          and cp.conversation_id::text = split_part(name, '/', 1)
      )
    )
  )
  with check (
    bucket_id = 'chat-media'
    and (
      (split_part(name, '/', 1) = 'avatar' and split_part(name, '/', 2) = (auth.uid())::text)
      or (split_part(name, '/', 1) = 'status' and split_part(name, '/', 2) = (auth.uid())::text)
      or exists (
        select 1 from public.conversation_participants cp
        where cp.user_id = auth.uid()
          and cp.conversation_id::text = split_part(name, '/', 1)
      )
    )
  );

drop policy if exists "chat_media_delete_own_paths" on storage.objects;
create policy "chat_media_delete_own_paths"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      (split_part(name, '/', 1) = 'avatar' and split_part(name, '/', 2) = (auth.uid())::text)
      or (split_part(name, '/', 1) = 'status' and split_part(name, '/', 2) = (auth.uid())::text)
      or exists (
        select 1 from public.conversation_participants cp
        where cp.user_id = auth.uid()
          and cp.conversation_id::text = split_part(name, '/', 1)
      )
    )
  );

drop policy if exists "chat_media_select_public" on storage.objects;
create policy "chat_media_select_public"
  on storage.objects for select
  using (bucket_id = 'chat-media');

drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (auth.uid())::text);

drop policy if exists "avatars_update_own_folder" on storage.objects;
create policy "avatars_update_own_folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (auth.uid())::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (auth.uid())::text);

drop policy if exists "avatars_delete_own_folder" on storage.objects;
create policy "avatars_delete_own_folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (auth.uid())::text);

drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- ─── messages RLS (read/send/update for conversation members) ─────────────────
drop policy if exists "messages_participants_read" on public.messages;
create policy "messages_participants_read"
  on public.messages for select to authenticated
  using (public.user_is_conversation_member(conversation_id));

drop policy if exists "messages_sender_insert" on public.messages;
create policy "messages_sender_insert"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.user_is_conversation_member(conversation_id)
  );

drop policy if exists "messages_participant_update" on public.messages;
create policy "messages_participant_update"
  on public.messages for update to authenticated
  using (public.user_is_conversation_member(conversation_id))
  with check (public.user_is_conversation_member(conversation_id));

-- Allow conversation metadata updates when new messages arrive (trigger uses security definer).
drop policy if exists "conversations_update_member" on public.conversations;
create policy "conversations_update_member"
  on public.conversations for update to authenticated
  using (public.user_is_conversation_member(id))
  with check (public.user_is_conversation_member(id));

-- Atomic open/create DM (fixes tap-to-chat doing nothing).
create or replace function public.create_direct_conversation(p_peer_id uuid, p_title text default 'Chat')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_title text := coalesce(nullif(trim(p_title), ''), 'Chat');
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_peer_id is null or p_peer_id = v_uid then raise exception 'Cannot start a chat with yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_peer_id) then
    raise exception 'That user has no profile yet';
  end if;

  select a.conversation_id into v_id
  from public.conversation_participants a
  inner join public.conversation_participants b on b.conversation_id = a.conversation_id
  inner join public.conversations c on c.id = a.conversation_id
  where a.user_id = v_uid and b.user_id = p_peer_id and c.is_group = false
  limit 1;

  if v_id is not null then return v_id; end if;

  insert into public.conversations (title, is_group, created_by) values (v_title, false, v_uid) returning id into v_id;
  insert into public.conversation_participants (conversation_id, user_id) values (v_id, v_uid), (v_id, p_peer_id);
  return v_id;
end;
$$;

revoke all on function public.create_direct_conversation(uuid, text) from public;
grant execute on function public.create_direct_conversation(uuid, text) to authenticated;
