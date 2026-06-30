-- ═══════════════════════════════════════════════════════════════════════════════
-- Status updates: table + storage bucket + RLS (fixes "blocked by row level security").
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Table ───────────────────────────────────────────────────────────────────
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

grant select, insert, update, delete on public.status_updates to authenticated;

drop policy if exists "status_updates_select_authenticated" on public.status_updates;
create policy "status_updates_select_authenticated"
  on public.status_updates for select to authenticated
  using (expires_at > now());

drop policy if exists "status_updates_insert_own" on public.status_updates;
create policy "status_updates_insert_own"
  on public.status_updates for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "status_updates_update_own" on public.status_updates;
create policy "status_updates_update_own"
  on public.status_updates for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "status_updates_delete_own" on public.status_updates;
create policy "status_updates_delete_own"
  on public.status_updates for delete to authenticated
  using (auth.uid() = user_id);

-- ─── Storage bucket (status-media) ───────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('status-media', 'status-media', true, 52428800)
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "status_media_insert_own_folder" on storage.objects;
create policy "status_media_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'status-media'
    and lower(split_part(name, '/', 1)) = lower((auth.uid())::text)
  );

drop policy if exists "status_media_update_own_folder" on storage.objects;
create policy "status_media_update_own_folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'status-media'
    and lower(split_part(name, '/', 1)) = lower((auth.uid())::text)
  )
  with check (
    bucket_id = 'status-media'
    and lower(split_part(name, '/', 1)) = lower((auth.uid())::text)
  );

drop policy if exists "status_media_delete_own_folder" on storage.objects;
create policy "status_media_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'status-media'
    and lower(split_part(name, '/', 1)) = lower((auth.uid())::text)
  );

drop policy if exists "status_media_select_public" on storage.objects;
create policy "status_media_select_public"
  on storage.objects for select
  using (bucket_id = 'status-media');
