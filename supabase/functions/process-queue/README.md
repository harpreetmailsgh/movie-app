# process-queue

Supabase Edge Function (Deno) that processes `fetch_queue` rows the app's
local worker hasn't finished within 90 seconds (app closed or backgrounded).

## What it does (per cron run, every 60s)

1. Claims up to 3 `status='queued'` rows older than 90s whose URL is a
   YouTube link (`youtube.com` / `youtu.be`), oldest first. The claim
   (`UPDATE ... WHERE status='queued'`) is atomic — 0 rows affected means
   the app's local worker got there first, and the row is skipped.
2. Processes each claimed row with 2s stagger between starts (Harpreet's
   rate limits):
   - YouTube oEmbed title → caption-first TMDB match (ported `bestMatch`
     from `src/lib/tmdb.ts`) → verified movie.
   - No TMDB match → POSTs the `gemini-titles` function over HTTP, matches
     each returned title via ported `bestMatches`; titles TMDB can't match
     are saved unverified (title=raw, year 0, `tmdbID` 0) — same as the app.
   - Upserts `movie_cache` (shared id via the FNV-1a `cacheIdFor` port from
     `src/lib/sync.ts`, so server and app rows share ids), then upserts
     `user_movies` (`status='watchlist'`, `onConflict 'user_id,tmdb_id'`).
   - Marks the row `done` with `result = {titles, added}`; on exception
     `failed` with `error`. Failed rows are never retried server-side.
3. Batch push: for every user with `done` rows that have `notified_at` NULL,
   sends one Expo push (Harpreet's verbatim copy):
   `🎬 N movies found from M videos` / `Tap to view your watchlist`
   (`data: {screen: 'watchlist'}`). Users with no push token, or rows that
   added nothing, are marked `notified_at` without a push.
4. Always returns HTTP 200 `{ processed: n }` — never throws.

## Deploy

```bash
supabase functions deploy process-queue
```

Then in the dashboard set the function secrets
(Dashboard → Edge Functions → process-queue → Secrets):

- `TMDB_API_KEY` — **required** for any TMDB matching (no key → every video
  falls through to Gemini titles saved as unverified).
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are built-in; `GEMINI_API_KEY`
  is already set for `gemini-titles`.

## Schedule

`supabase/migrations/process_queue_push.sql` adds the `push_token` and
`notified_at` columns and installs the per-minute pg_cron schedule (run it
in the SQL editor with `<ANON_KEY>` replaced).
