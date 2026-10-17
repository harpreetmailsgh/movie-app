-- Movie Deck: process-queue support columns + pg_cron schedule
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run.
--
-- MANUAL STEPS (Harpreet):
-- 1. Replace <ANON_KEY> below with the project's anon key
--    (Supabase Dashboard → Settings → API → Project API keys → anon public).
-- 2. Set the TMDB_API_KEY secret for the process-queue function
--    (Dashboard → Edge Functions → process-queue → Secrets) — without it,
--    no TMDB matching happens and every video falls through to
--    Gemini titles saved as unverified.
-- 3. Deploy the function (Dashboard → Edge Functions → process-queue →
--    Deploy, or: supabase functions deploy process-queue).
-- 4. Run this SQL, then check the run fires:
--    select * from cron.job_run_details order by start_time desc limit 3;
-- If `create extension` errors, enable pg_cron and pg_net instead in
-- Dashboard → Database → Extensions, then re-run from the cron.schedule line.

alter table public.fetch_queue add column if not exists push_token text;
alter table public.fetch_queue add column if not exists notified_at timestamptz;

-- Index for the batch-push scan (done rows not yet notified)
create index if not exists fetch_queue_done_unnotified_idx
  on public.fetch_queue (status, notified_at)
  where status = 'done' and notified_at is null;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- pg_cron every 60s → process-queue
select cron.schedule('process-queue-every-minute', '* * * * *', $$
  select net.http_post(
    url := 'https://auizpgdhwelyhlrundbc.supabase.co/functions/v1/process-queue',
    headers := '{"Content-Type":"application/json","apikey":"<ANON_KEY>","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
