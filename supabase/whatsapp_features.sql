-- Run after schema.sql. Adds WhatsApp-style Status updates (24h expiry).
-- Storage: reuse existing `chat-media` bucket with paths like `status/<userId>/<filename>`.

create table if not exists public.status_updates (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  caption text,
  media_url text,
  media_type text not null default 'text' check (media_type in ('text', 'image', 'video')),
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '24 hours')
);

create index if not exists status_updates_expires_idx on public.status_updates (expires_at desc);
create index if not exists status_updates_user_created_idx on public.status_updates (user_id, created_at desc);

alter table public.status_updates enable row level security;

-- Drop first so this migration can be re-run safely.
drop policy if exists "status_updates_select_authenticated" on public.status_updates;
drop policy if exists "status_updates_insert_own" on public.status_updates;
drop policy if exists "status_updates_update_own" on public.status_updates;
drop policy if exists "status_updates_delete_own" on public.status_updates;

-- Any signed-in user can read active statuses (contacts-only policies can be added later).
create policy "status_updates_select_authenticated"
  on public.status_updates for select
  using (auth.role() = 'authenticated' and expires_at > now());

create policy "status_updates_insert_own"
  on public.status_updates for insert
  with check (auth.uid() = user_id);

create policy "status_updates_update_own"
  on public.status_updates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "status_updates_delete_own"
  on public.status_updates for delete
  using (auth.uid() = user_id);
