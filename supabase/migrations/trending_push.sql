-- Movie Deck: trending-push tables + pg_cron schedule
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run.
--
-- MANUAL STEPS (Harpreet):
-- 1. Replace <ANON_KEY> below with the project's anon key
--    (Supabase Dashboard → Settings → API → Project API keys → anon public).
-- 2. Deploy the function (Dashboard → Edge Functions → trending-push →
--    Deploy, or: supabase functions deploy trending-push).
-- 3. Run this SQL, then check the run fires:
--    select * from cron.job_run_details order by start_time desc limit 3;
-- If `create extension` errors, enable pg_cron and pg_net instead in
-- Dashboard → Database → Extensions, then re-run from the cron.schedule line.

-- One row per device token. `token` is unique: the app upserts on it, so a
-- token re-registering (same device, new login) updates the row in place
-- instead of duplicating it.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for per-user token lookups
create index if not exists push_tokens_user_idx
  on public.push_tokens (user_id);

-- Keep updated_at fresh
create or replace function public.touch_push_tokens_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_push_tokens_updated_at on public.push_tokens;
create trigger trg_push_tokens_updated_at
  before update on public.push_tokens
  for each row execute function public.touch_push_tokens_updated_at();

-- Row Level Security: same pattern as fetch_queue — users only see and
-- write their own tokens (the app upserts with its anonymous user id).
alter table public.push_tokens enable row level security;

drop policy if exists "own push tokens" on public.push_tokens;
create policy "own push tokens"
  on public.push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- One row per country: the last title set the weekly check sent a push
-- for. The function compares the fresh Trending list against this row and
-- only pushes when a title is new.
create table if not exists public.trending_snapshots (
  country text primary key,
  titles jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh
create or replace function public.touch_trending_snapshots_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_trending_snapshots_updated_at on public.trending_snapshots;
create trigger trg_trending_snapshots_updated_at
  before update on public.trending_snapshots
  for each row execute function public.touch_trending_snapshots_updated_at();

-- Row Level Security: server-only table (the app never reads or writes it).
-- RLS is on with no permissive policy, so only the service role — which
-- bypasses RLS — can touch it.
alter table public.trending_snapshots enable row level security;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- pg_cron weekly Friday 9:00 AM Toronto (most of the year) -> trending-push.
-- pg_cron runs on the database clock (UTC) and has no timezone support:
-- 13:00 UTC is 9:00 AM EDT in daylight time (Mar-Nov); in winter (EST,
-- UTC-5) it fires at 8:00 AM Toronto.
select cron.schedule('trending-push-weekly', '0 13 * * 5', $$
  select net.http_post(
    url := 'https://auizpgdhwelyhlrundbc.supabase.co/functions/v1/trending-push',
    headers := '{"Content-Type":"application/json","apikey":"<ANON_KEY>","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
