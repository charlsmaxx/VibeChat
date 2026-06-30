-- ═══════════════════════════════════════════════════════════════════════════════
-- Allow a sender to delete their own messages (long-press → Delete in chat).
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

drop policy if exists "messages_sender_delete" on public.messages;
create policy "messages_sender_delete" on public.messages for delete to authenticated
  using (sender_id = auth.uid());

-- Ensure realtime emits the old row id to other clients on delete so their UI updates.
alter table public.messages replica identity full;
