-- Run after schema.sql. Extends calls for 1:1 + group audio/video.

alter table public.calls add column if not exists conversation_id uuid references public.conversations(id) on delete set null;
alter table public.calls add column if not exists call_type text not null default 'audio' check (call_type in ('audio', 'video'));
alter table public.calls add column if not exists is_group boolean not null default false;

-- Group calls have no single callee.
alter table public.calls alter column callee_id drop not null;

create index if not exists calls_conversation_status_idx on public.calls (conversation_id, status, created_at desc);

drop policy if exists "calls_participants" on public.calls;
drop policy if exists "calls_insert_caller" on public.calls;
drop policy if exists "calls_select_participant" on public.calls;
drop policy if exists "calls_update_participant" on public.calls;

create policy "calls_select_participant"
  on public.calls for select
  to authenticated
  using (
    caller_id = auth.uid()
    or callee_id = auth.uid()
    or (
      is_group = true
      and conversation_id is not null
      and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = calls.conversation_id
          and cp.user_id = auth.uid()
      )
    )
  );

create policy "calls_insert_caller"
  on public.calls for insert
  to authenticated
  with check (caller_id = auth.uid());

create policy "calls_update_participant"
  on public.calls for update
  to authenticated
  using (
    caller_id = auth.uid()
    or callee_id = auth.uid()
    or (
      is_group = true
      and conversation_id is not null
      and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = calls.conversation_id
          and cp.user_id = auth.uid()
      )
    )
  )
  with check (
    caller_id = auth.uid()
    or callee_id = auth.uid()
    or (
      is_group = true
      and conversation_id is not null
      and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = calls.conversation_id
          and cp.user_id = auth.uid()
      )
    )
  );
