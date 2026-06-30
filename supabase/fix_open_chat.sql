-- Run this in Supabase SQL Editor to fix "tap user → nothing happens" when starting a chat.
-- Safe to re-run.

-- Creator must read conversation right after insert (before participants exist).
drop policy if exists "conversations_members_only" on public.conversations;
create policy "conversations_members_only"
  on public.conversations for select to authenticated
  using (
    public.user_is_conversation_member(id)
    or created_by = auth.uid()
  );

-- RLS helper (skip if already created).
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

-- Atomic: find or create DM (bypasses client-side RLS timing issues).
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
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_peer_id is null or p_peer_id = v_uid then
    raise exception 'Cannot start a chat with yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_peer_id) then
    raise exception 'That user has no profile yet';
  end if;

  select a.conversation_id into v_id
  from public.conversation_participants a
  inner join public.conversation_participants b on b.conversation_id = a.conversation_id
  inner join public.conversations c on c.id = a.conversation_id
  where a.user_id = v_uid
    and b.user_id = p_peer_id
    and c.is_group = false
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.conversations (title, is_group, created_by)
  values (v_title, false, v_uid)
  returning id into v_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_id, v_uid), (v_id, p_peer_id);

  return v_id;
end;
$$;

revoke all on function public.create_direct_conversation(uuid, text) from public;
grant execute on function public.create_direct_conversation(uuid, text) to authenticated;
