-- Save My Movie: fetch_queue retry columns
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run.
-- Adds automatic-retry columns for the fetch queue (backlog #98):
-- a transient Gemini failure re-queues the row with a retry time
-- instead of marking it failed. Idempotent — safe to run more than once.

alter table public.fetch_queue add column if not exists retry_at timestamptz;
alter table public.fetch_queue add column if not exists retry_count int not null default 0;
alter table public.fetch_queue add column if not exists retry_reason text;
alter table public.fetch_queue add column if not exists retry_status int;

create index if not exists fetch_queue_retry_due_idx
  on public.fetch_queue (status, retry_at) where status = 'queued';
