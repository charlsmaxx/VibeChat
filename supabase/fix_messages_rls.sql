-- Run if chat opens but messages won't load/send. Requires user_is_conversation_member() from fix_chat_rls_and_avatars.sql.

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

drop policy if exists "conversations_update_member" on public.conversations;
create policy "conversations_update_member"
  on public.conversations for update to authenticated
  using (public.user_is_conversation_member(id))
  with check (public.user_is_conversation_member(id));
