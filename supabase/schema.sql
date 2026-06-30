create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  phone_number text unique,
  avatar_url text,
  bio text,
  last_seen timestamptz default now(),
  is_online boolean default false
);

create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  created_by uuid references public.profiles(id) on delete set null,
  is_group boolean default false,
  last_message text,
  updated_at timestamptz default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid references public.profiles(id) on delete cascade,
  group_id uuid,
  content text,
  media_url text,
  type text not null check (type in ('text','image','video','audio')),
  status text not null check (status in ('sent','delivered','read')) default 'sent',
  created_at timestamptz default now()
);

create table if not exists public.push_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token text not null,
  updated_at timestamptz default now()
);

create table if not exists public.calls (
  id uuid primary key default uuid_generate_v4(),
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null,
  status text not null default 'ringing',
  created_at timestamptz default now()
);

-- Existing databases: CREATE TABLE IF NOT EXISTS does not add columns to tables that already exist.
-- If conversations was created from an older schema, policies below reference created_by and will fail until added.
alter table public.conversations add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.conversations add column if not exists is_group boolean default false;
alter table public.conversations add column if not exists last_message text;
alter table public.conversations add column if not exists updated_at timestamptz default now();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.push_tokens enable row level security;
alter table public.calls enable row level security;

-- RLS helper: avoids infinite recursion when policies query conversation_participants.
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

-- Policies: drop first so this file can be re-run safely after partial applies.
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

drop policy if exists "conversations_members_only" on public.conversations;
create policy "conversations_members_only" on public.conversations for select to authenticated using (
  public.user_is_conversation_member(id) or created_by = auth.uid()
);

drop policy if exists "conversations_insert_owner" on public.conversations;
create policy "conversations_insert_owner" on public.conversations for insert with check (
  created_by = auth.uid()
);

drop policy if exists "conversations_update_owner" on public.conversations;
create policy "conversations_update_owner" on public.conversations for update using (
  created_by = auth.uid()
) with check (
  created_by = auth.uid()
);

drop policy if exists "participants_self" on public.conversation_participants;
drop policy if exists "participants_select_member" on public.conversation_participants;
create policy "participants_select_member"
  on public.conversation_participants for select
  to authenticated
  using (public.user_is_conversation_member(conversation_id));
drop policy if exists "participants_insert_by_owner" on public.conversation_participants;
create policy "participants_insert_by_owner" on public.conversation_participants for insert with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.conversations c
    where c.id = conversation_participants.conversation_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists "messages_participants_read" on public.messages;
create policy "messages_participants_read" on public.messages for select to authenticated using (
  public.user_is_conversation_member(conversation_id)
);

drop policy if exists "messages_sender_insert" on public.messages;
create policy "messages_sender_insert" on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and public.user_is_conversation_member(conversation_id)
);
drop policy if exists "messages_participant_update" on public.messages;
create policy "messages_participant_update" on public.messages for update to authenticated using (
  public.user_is_conversation_member(conversation_id)
) with check (
  public.user_is_conversation_member(conversation_id)
);

drop policy if exists "conversations_update_member" on public.conversations;
create policy "conversations_update_member" on public.conversations for update to authenticated using (
  public.user_is_conversation_member(id)
) with check (
  public.user_is_conversation_member(id)
);
drop policy if exists "push_tokens_self" on public.push_tokens;
create policy "push_tokens_self" on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "calls_participants" on public.calls;
create policy "calls_participants" on public.calls for all using (caller_id = auth.uid() or callee_id = auth.uid()) with check (caller_id = auth.uid() or callee_id = auth.uid());

create or replace function public.on_message_insert_update_conversation()
returns trigger language plpgsql security definer as $$
begin
  update public.conversations
  set
    last_message = coalesce(new.content, '[media]'),
    updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_message_update_conversation on public.messages;
create trigger trg_message_update_conversation
after insert on public.messages
for each row execute function public.on_message_insert_update_conversation();
