-- Run this manually in the Supabase dashboard (SQL editor).
-- Silent telemetry table for API-key auth failures, reported by the app
-- via src/lib/keyFailures.ts (one row per service+error-code per session).

create table key_failures (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  service text not null,
  error_code int,
  app_version text
);

alter table key_failures enable row level security;

create policy "anon insert" on key_failures for insert to anon with check (true);
