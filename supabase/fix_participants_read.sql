-- Run in Supabase SQL Editor after schema.sql.
-- Prefer fix_chat_rls_and_avatars.sql (includes this fix + storage + avatars).

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

drop policy if exists "participants_self" on public.conversation_participants;

drop policy if exists "participants_select_member" on public.conversation_participants;
create policy "participants_select_member"
  on public.conversation_participants for select
  to authenticated
  using (public.user_is_conversation_member(conversation_id));

drop policy if exists "conversations_members_only" on public.conversations;
create policy "conversations_members_only"
  on public.conversations for select
  to authenticated
  using (public.user_is_conversation_member(id));
