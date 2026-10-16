-- Movie Deck: fetch_queue table
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run.
-- This creates the queue table for background video-import processing.

create table if not exists public.fetch_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'done', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for polling pending items per user
create index if not exists fetch_queue_user_status_idx
  on public.fetch_queue (user_id, status, created_at);

-- Keep updated_at fresh
create or replace function public.touch_fetch_queue_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_fetch_queue_updated_at on public.fetch_queue;
create trigger trg_fetch_queue_updated_at
  before update on public.fetch_queue
  for each row execute function public.touch_fetch_queue_updated_at();

-- Row Level Security: users only see their own queue rows
alter table public.fetch_queue enable row level security;

drop policy if exists "own queue rows" on public.fetch_queue;
create policy "own queue rows"
  on public.fetch_queue
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
