# gemini-titles

Supabase Edge Function (Deno) that lists movie titles mentioned, shown, or
discussed in a YouTube video, using Gemini (`gemini-2.0-flash`).

## What it does

- `POST` with JSON body `{ "youtubeUrl": "<youtube watch/share URL>" }`.
- Sends the URL to Gemini with a prompt to return only movie titles, one per
  line (with year in parentheses when stated), or exactly `NONE` when the
  video mentions no movies.
- Returns `{ "titles": "Inception (2010)\nThe Matrix (1999)" }` (a single
  newline-joined string) or `{ "titles": null }` when no movies are found.
- Never throws and never returns 500 — any failure (missing Gemini key,
  bad request, upstream timeout, non-2xx, malformed response) returns
  HTTP 200 with `{ "titles": null }`.
- Handles CORS preflight (`OPTIONS`) and sends `Access-Control-Allow-Origin: *`
  on all responses.

## Deploy

```bash
supabase functions deploy gemini-titles
supabase secrets set GEMINI_API_KEY=<your-gemini-key>
```

Or set the secret in the Supabase Dashboard → Edge Functions → gemini-titles → Secrets.

## App usage

The app calls it at `/functions/v1/gemini-titles` (i.e.
`<SUPABASE_URL>/functions/v1/gemini-titles`) with the app's usual
`apikey`/`Authorization` headers.
