# Directed Robo Run — Verdict Guide

Script: `testlab/robo-script.json` (130 actions, stages A–K).
Workflow: `.github/workflows/testlab.yml` — workflow_dispatch ONLY,
`robo_script` input defaults to `testlab/robo-script.json`, timeout `1800s`.
The run builds a fresh APK from master every time, so this script MUST run
against a build that includes the two `accessibilityLabel` lines in
`src/app/import.tsx` ("Search movies", "Paste link") — without them the
`VIEW_TEXT_CHANGED` steps have no target and the import stages cannot run.

## How to read this guide

- **Script steps are identified by their stage letter and `description`
  text**, not by action number (numbers shift if the script is edited).
  Every action's `description` names the case IDs it serves.
- **The script contains NO assertions.** A step "passing" in Test Lab
  (Robo matched and performed it) is NOT a case PASS. Verdicts come only
  from the run video/screenshots, as specified per case below.
- **Verdict rule (applies to every case):**
  - **PASS** — only if the video/screenshots show exactly the evidence
    listed for that case.
  - **FAIL** — only if the screenshots/video show the app itself
    misbehaving: wrong text, a crash, a missing element the app should
    show, or data loss the case forbids. Quote the evidence (timestamp +
    what is visible) when marking FAIL.
  - **NOT RUN** — everything else: a step was skipped, an element was
    never reached, the video frame is inconclusive, or the test data
    turned out invalid (e.g. a "nonexistent" video actually exists).
    NOT RUN is not a failure and must not be upgraded to PASS on
    assumption or to FAIL on suspicion.

## Script format note (for the Tester validating the file)

The file is NOT a single JSON document, by design. It follows the official
Robo scripts reference format exactly: a `roboscript` header object
(`postscript.terminate = true`, so no free crawl runs after the journey
and pollutes state) followed by the actions array. There is NO `strict`
execution mode, so Robo may skip an unmatchable action when a later
action matches — that is why every import step is ordered so a later
step cannot match before its predecessor's outcome exists (a tab click
never directly follows a Fetch; a results/error-card click sits between
them). Plain `json.load` on the whole file will fail; validate by
splitting off the header and parsing the actions array on its own.
`description` is present on every action (case traceability); it is
not a Robo execution field.

## Timeout decision

`--timeout 1800s` (30 minutes). The gcloud ceiling found via local
`gcloud firebase test android run --help` is 60 minutes on virtual
devices (45 minutes physical; default 15 minutes). The old `300s` cannot
fit this journey, honestly counted: 188 seconds of fixed waits alone
(120 s rapid-3 queue-drain delay — the queue has no completion element,
so the drain cannot be implicit-waited — plus Trending/search/debounce
observation windows), plus 5 Gemini-path imports (rapid-3 × 3, single
mixed × 1, no-movie Short × 1) and a TikTok reel-path import, each of
which can take tens of seconds, plus 5 further imports and all UI
actions. 1800 s is the smallest round value that leaves roughly 2×
headroom over a slow-network estimate (~12–15 minutes); it is well
inside the 60-minute virtual ceiling.

## Test data used (nothing here is invented)

- JeHimZxgX48 video, all three forms (stage F rapid-3, stage G again):
  `https://youtube.com/shorts/JeHimZxgX48`,
  `https://www.youtube.com/watch?v=JeHimZxgX48`,
  `https://youtu.be/JeHimZxgX48`. History: yields 5 Gemini titles,
  mixed verified/unverified. If the count on the run differs from 5,
  the stage-G "5 titles" expand/collapse steps will not match — see R06
  below; that makes R06 NOT RUN, not a FAIL.
- Search-add: `Predestination` (TMDB title). Save-as-typed:
  `Zqxjkv Blorpt` (gibberish, no TMDB match expected).
- Error inputs: `hello world`; `https://example.com/some-video`;
  `https://www.tiktok.com/@user` (malformed TikTok, no video);
  nonexistent YouTube ID **`aB3dEf7hJkL`** (chosen random-looking
  11-character ID, used as `https://www.youtube.com/watch?v=aB3dEf7hJkL`).
  If that ID turns out to be a real video, E03 becomes NOT RUN
  (invalid test data), not FAIL.
- Validated content-dependent imports (stage K, validated by public web
  search before inclusion):
  - TikTok `https://www.tiktok.com/@cass.nyuad/video/7646636420697722130`
    (canonical form of the search-result share URL, tracking parameters
    stripped; caption names Interstellar, The Martian, 2001: A Space
    Odyssey, Gravity, Project Hail Mary).
  - No-movie Short `https://www.youtube.com/shorts/kK9jr1CxROs`
    (title "Kids Lunch Box Kadai Paneer & Chapati", cooking/mini-vlog,
    no movie content, title matches no TMDB title).
  - Over-5-minute non-matching video
    `https://www.youtube.com/watch?v=0BWo6VhJ8zI` ("MY MORNING ROUTINE",
    chapters run to ~06:15, title matches no TMDB title, so the Gemini
    path — where the duration gate lives — is reached).

## Cases the script touches — step, PASS evidence, FAIL evidence

### Launch / empty states

- **L01 (launch, no crash; tab navigation)** — Steps: stage A (all
  tabs), stage B (Seen, Settings), stage C (Trending). PASS: app opens
  to Watchlist with no crash, freeze, or blank white screen on any tab,
  and Settings renders. FAIL: crash/freeze/blank screen on any tab,
  quoted with timestamp.
- **L02 (fresh-install empty state)** — Steps: stage A. PASS: Watchlist
  empty texts, Seen empty, Import shows no "Recent videos" section and
  no Queue header on first open. FAIL: placeholder rows, a crash, or a
  visible empty Queue/Recent box.
- **M01 (empty Watchlist text)** — Steps: stage A Tiles/List/Cards.
  PASS: "Nothing in your watchlist yet." (Tiles/List) and
  "Nothing here yet" (Cards). Otherwise NOT RUN unless the text is
  wrong, which is FAIL.
- **M02 (empty Seen text)** — Steps: stage A Seen Cards/List.
  PASS: "Nothing here yet" in both views.
- **M03 (empty Recent: section hidden)** — Steps: stage A Import.
  PASS: no "Recent videos" heading and no empty box on fresh Import.
  FAIL: an empty Recent box is shown.
- **M04 (empty Queue: header hidden)** — Steps: stage A Import, and
  after queues drain in stages F/G/I/K. PASS: no "Queue" header when
  no items exist; header appears only while items exist.

### Trending

- **T01 (loading spinner, not a vertical line)** — Steps: stage C,
  first Trending visit + 8 s observation window. PASS: spinning
  ActivityIndicator with "Finding what's trending…" visible in the
  first seconds. FAIL: a thin vertical line, static bar, or frozen
  progress bar in that spot (regression of the 97018ec fix) — screenshot
  required.
- **T02 (Trending content loads, cards and tiles)** — Steps: stage C
  Tiles/Cards switches + two left swipes. PASS: trending titles render
  with posters/titles in both views and left-swipes cycle cards.
  NOTE: the script deliberately never right-swipes on Trending — a
  right swipe ADDS the card to Watchlist (`trending.tsx` handleSwipe),
  which would pollute later Watchlist counts. FAIL: feed never loads,
  "All caught up" on first load, or a crash.
- **T05 (filter no-match explains itself)** — Steps: stage C Language
  → Hindi → Done → ✕ Clear. PASS: after Done, the no-match text
  "No matches — trending items do not carry language or rating data;
  try clearing those." is visible; after ✕ Clear the feed returns.
  FAIL: a different message, an empty screen with no explanation, or
  Clear not restoring the feed.
- **T06 ("Last refreshed" hidden on first run)** — Steps: stage C
  post-load frames. PASS: NO "Last refreshed …" line after the first
  successful load (fresh install has no cache entry). FAIL: the line
  is present on this first load.
- **S04 (Seen filters and views)** — Steps: stage A Seen Cards/List,
  stage H Seen Tiles/List. Verdict ceiling is NOT RUN: views are
  visited and must render without crash, but the script applies no
  Seen filter, so the filter half of S04 is unexecuted. Mark NOT RUN
  unless a view crashes (then FAIL).

### Import / search

- **I08 (manual "By title" search add)** — Steps: stage D. PASS: typing
  "Predestination", tapping the result row, and "Predestination"
  visible in Watchlist List view afterwards. FAIL: tap adds nothing,
  adds the wrong title, or crashes (including a missing-poster crash —
  Predestination has a poster, so a crash here is app misbehaviour).
- **I09 ("Save exactly as typed")** — Steps: stage E. PASS: tapping
  the "Don't see it? Save "Zqxjkv Blorpt" exactly as typed" row lands
  "Zqxjkv Blorpt" in Watchlist (year 0, no poster, clapboard, no
  crash). FAIL: entry missing, altered title, or crash.
- **I06 (Fetch clears field, no double-enqueue)** — Steps: stage F
  (and every later Fetch). PASS: video shows the link field empty
  after each Fetch tap and exactly one Queue row per tap (3 rows for
  the rapid-3). FAIL: field retains the URL after Fetch, or one tap
  produces two rows.
- **I02 (watch / youtu.be URL variants)** — Steps: stage F (all three
  forms of the same video) — no separate stage-J steps are needed
  because the variants were already used in F, per the task. PASS: all
  three forms route to the YouTube path and produce the same 5 titles
  (same results card content and same Watchlist titles). FAIL: a
  "doesn't look like a YouTube link" error on any form, or different
  titles per form.
- **I03 (TikTok URL import)** — Steps: stage K TikTok step. PASS: the
  import completes and its outcome is recorded from the video: either
  a results card + Watchlist titles (verified if TMDB matches the
  caption, else unverified per U-rules) or a verbatim error card +
  failed Recent row. Because the outcome text was not known in advance,
  the script waits on a results-or-error regex click plus a 30 s
  observation window. FAIL only if the app crashes or silently drops
  the import (no results card, no error card, no Recent row).
- **I10 / G05 (duplicate import: record, don't assume)** — Steps:
  stages F + G (same video imported 4 times total). PASS = a verbatim
  record: Watchlist entry counts for the JeHim titles before vs after
  each re-import, as seen in video. A duplicate Watchlist entry is the
  CODE-PREDICTED outcome (`addMovie` has no dedupe on the
  YouTube path) — it is a recorded finding (candidate defect, minor,
  data duplication, no crash), NOT a FAIL and NOT a PASS for dedupe.

### Queue

- **Q01 (Queued label on enqueue)** — Steps: stage F. PASS: "Queue"
  header appears with rows showing "Queued" and the URL (or video
  title once known). FAIL: no Queue header/row after a Fetch tap.
- **Q02 (Processing dots animate)** — Steps: stage F drain window.
  PASS: video shows "Processing." → "Processing.." → "Processing..."
  cycling on the active row at some point. A frozen label for >60 s
  on a good connection is an observation to record, NOT an automatic
  FAIL (per the case text); a permanently stuck row past the run end
  with no completion anywhere is FAIL only with the elapsed time
  quoted.
- **Q03 (sequential, oldest-first, ONE at a time)** — Steps: stage F.
  PASS: video shows only one row "Processing…" at any moment, the
  others "Queued", and the first-pasted (Shorts form) finishes first.
  FAIL: two rows "Processing…" simultaneously, or out-of-order
  completion. Do NOT expect 3 concurrent local items — that
  concurrency lives server-side, not in this UI.
- **Q04 (success auto-dismisses row + results card)** — Steps: stages
  F, G. PASS: queue row disappears (not left as "done"), results card
  shows "N titles fetched", same titles in Watchlist, a Recent row
  appears. FAIL: a stuck "done"/"Failed" queue row as the durable
  record, or titles missing from Watchlist.
- **Q05 (failure auto-dismisses row + error card + failed Recent row)**
  — Steps: stage I (all four errors) and stage K (E04/E05). PASS: queue
  row disappears, error card shows the worker error verbatim, a Recent
  row with ✕ and the same error appears. FAIL: queue retains a stuck
  "Failed" row, or no Recent row appears.
- **Q07 (multiple queued items all complete)** — Steps: stage F.
  PASS: all 3 rapid imports land in Recent newest-first and their
  titles in Watchlist; none silently dropped.
- **Q08 (queue row title replaces raw URL once known)** — Steps:
  stage F video. PASS: a row visibly changes from the raw URL to the
  video title once the worker fetches it. If no frame catches the
  transition, NOT RUN (not FAIL).
- **G01 (rapid imports: no title lost)** — Steps: stage F. PASS: every
  one of the 3 videos' titles is in Watchlist AND has a Recent row.
  FAIL: any one video's titles missing (stale-closure regression) —
  name the missing title.
- **G03 (rapid Recent writes: none lost, newest first)** — Steps:
  stages F, G. PASS: Recent shows all processed videos, newest first;
  no missing middle entry. FAIL: a missing middle entry.

### Recent / unverified

- **R01 (Recent row per video, newest first)** — Steps: stages F, G,
  K final scroll. PASS: one row per processed video, newest first,
  each with video title (or URL if unknown) and "N titles"/"1 title"
  subtitle.
- **R03 (success glyph ✓ green)** — Steps: stages F/G video. PASS: a
  fully verified import's row shows ✓. (JeHim is mixed, so its rows
  are expected ⚠ — see R04 — not ✓; do not FAIL a JeHim row for not
  being ✓.)
- **R04 (partial glyph ⚠ orange)** — Steps: stage G. PASS: the JeHim
  mixed import's row shows ⚠ (status `partial`). If the run's JeHim
  import comes back fully verified, its row showing ✓ is consistent
  and R04 becomes NOT RUN on this run, not FAIL.
- **R05 (failed glyph ✕ red + error subtitle)** — Steps: stage I, K.
  PASS: failed rows show ✕ with the error as subtitle (up to 2 lines).
- **R06 (expand shows titles; tap again collapses)** — Steps: stage G
  "5 titles" expand/collapse. PASS: first tap expands an accordion
  listing that video's titles ("1. Title" lines, unverified per U02);
  second tap collapses it; no navigation away from Import. CAVEAT:
  the expand step targets the literal subtitle "5 titles" from the
  historical JeHim yield. If this run yields a different count, the
  step will not match and R06 is NOT RUN (Tester: patch the literal
  to the observed count before a rerun). The collapse click is
  `optional: true` so a missed expand cannot corrupt later stages.
- **R07 (Retry re-enqueues and reprocesses)** — Steps: stage I Retry
  sequence. PASS: after tapping Retry on the expanded failed row, the
  video shows the URL re-entering the Queue (Queued → Processing…),
  then a fresh outcome PLUS a NEW Recent row at the top; the old
  failed row remains below (unless pushed out by the 10-cap). CAVEAT:
  the old error card is NOT cleared by the Retry path, so the
  post-Retry error-text click is not proof of reprocessing — judge
  R07 from the Queue row and the NEW Recent row in video, not from
  that click. FAIL: Retry does nothing, or reprocessing silently
  drops the import.
- **R08 (thumbnails)** — Steps: stages F/G/K Recent frames. PASS:
  YouTube rows show the `i.ytimg.com` thumbnail; the TikTok row shows
  the clapboard poster; no broken-image box, no crash. If a frame
  cannot show a thumbnail clearly, NOT RUN.
- **U01 (unverified at BOTTOM of results card)** — Steps: stage G
  results card. PASS: all verified titles first (numbered), unverified
  entries last. FAIL: an unverified entry interleaved above a verified
  one.
- **U02 (unverified at BOTTOM of expanded Recent row)** — Steps:
  stage G expansion. PASS: same verified-first ordering inside the
  expanded list. FAIL: interleaving, as U01.
- **U03 (unverified label + raw title verbatim)** — Steps: stage G
  results card + expansion. PASS: each unverified entry shows
  "Couldn't verify this title" AND the raw title exactly as extracted
  (not blank, not a guessed TMDB title). FAIL: blank or replaced title.
- **U04 (unverified titles land in Watchlist as raw entries, deletable)**
  — Steps: stages E (gibberish entry visible), H (detail Trash delete).
  PASS: raw-title entry present in Watchlist (no poster, no crash on
  open) and permanently removed by the detail Trash step.
- **G02 (multi-title video: all titles survive)** — Steps: stage G.
  PASS: all titles from the single mixed import appear in the results
  card and in Watchlist (verified first, unverified last). FAIL: only
  the last title survives (the old `addMovie` stale-closure bug).

### Watchlist / Seen

- **W01 (fetched titles auto-appear in Watchlist)** — Steps: stages D,
  F, G, K (TikTok titles if any). PASS: each verified fetched title,
  and each unverified title as a raw entry, is present in Watchlist
  without any manual add.
- **W02 (Watchlist Tiles/List sort A→Z)** — Steps: stage H Tiles then
  List views. PASS: both views show titles in A→Z order. FAIL: any
  out-of-order title — quote it verbatim.
- **W03 (deck order is stored order, not A→Z)** — Steps: stage H Cards
  view + left/right cycles. PASS: deck order follows library/stored
  order (newest first via prepend) and may differ from Tiles/List
  order; left/right cycles move cards to the back. FAIL (behaviour
  change): deck order is forced A→Z like Tiles/List.
- **W04 (move Watchlist title to Seen)** — Steps: stage H List-view
  "✓ Seen" tap, and Cards swipe-up. PASS: title leaves Watchlist,
  appears in Seen, counts adjust by one each way, no duplicate.
  (List actions are swipe-revealed: the script swipes the first row
  left, then taps "✓ Seen".)
- **W05 (delete from Watchlist is permanent, no Trash to restore from)**
  — Steps: stage H detail Trash delete + later Watchlist frames.
  PASS: deleted title is gone from Watchlist in later frames and no
  Trash/Restore UI appears anywhere in the journey. FAIL: a Trash
  screen exists, or the title reappears.
- **W06 (detail opens without crash)** — Steps: stage H Predestination
  detail + gibberish detail. PASS: both detail screens open;
  missing poster shows the clapboard fallback, not a broken image or
  crash. NOTE: detail targets are title texts in a FlatList; Robo
  scrolls RecyclerView children into view, but if a title never
  matches (e.g. list state diverged), W06 is NOT RUN, not FAIL.
- **W07 (unverified/as-typed entries deletable)** — Steps: stage H
  detail Trash on the gibberish entry. PASS: entry removed
  permanently, no crash, Recent rows untouched (Recent is import
  history, not the library).
- **S01 (Seen shows moved titles)** — Steps: stage H (after "✓ Seen"
  and after swipe-up). PASS: moved titles present in Seen, absent
  from Watchlist.
- **S02 (move Seen title back to Watchlist)** — Steps: stage H Seen
  List-view "＋ Watchlist" tap. PASS: title leaves Seen, reappears in
  Watchlist, counts adjust by one each way. (Seen at that point holds
  exactly the one just-moved title, so the first row is deterministic.)

### Errors

- **E01 (plain text, not a link)** — Steps: stage I `hello world`.
  PASS: error card "That doesn’t look like a link — paste the full
  reel URL." (curly ’, em dash, verbatim), nothing added to Watchlist,
  failed Recent row recorded. FAIL: a crash, or a title added.
- **E02 (garbage URL, unknown platform)** — Steps: stage I
  `https://example.com/some-video`. PASS: error card "Couldn’t read
  that reel (it may be private). You can add the title manually
  below." + failed Recent row (a success here is only a pass if the
  URL genuinely yielded titles — record which happened). FAIL: crash
  or silent drop (no Recent row either way).
- **E07 (malformed TikTok link)** — Steps: stage I
  `https://www.tiktok.com/@user`. PASS: error card "That doesn't look
  like a TikTok link — use a tiktok.com or vm.tiktok.com link."
  (straight apostrophe, verbatim) + failed Recent row, nothing added.
- **E03 (private/removed YouTube video)** — Steps: stage I nonexistent
  ID + Retry. PASS: error card "Couldn't read that video (it may be
  private or removed)." + failed Recent row, nothing added. If the
  chosen ID is actually a live video, NOT RUN (invalid test data).
- **E04 (video over 5 minutes, Gemini-path only)** — Steps: stage K
  morning-routine video. PASS: error card "Share a video up to 5 mins
  long." + failed Recent row, nothing added. NOTE (code fact, not a
  loophole): a >5-min video whose title matches TMDB directly succeeds
  before the gate is checked — the chosen video's title does not
  match, so the gate must fire here; if it succeeds instead, record
  the outcome verbatim and raise it as a spec question, do not mark
  FAIL on that fact alone unless the video demonstrably took the
  Gemini path.
- **E05 (no movies found)** — Steps: stage K cooking Short. PASS:
  error card "Could not fetch any movie in this video." + failed
  Recent row, nothing added. FAIL: a title is hallucinated from a
  cooking video (quote it) — that is app misbehaviour, not a pass.

## Cases the script does NOT cover, and why

These need a human on a device (or a different harness) and are out of
this script's scope by design — the script cannot kill/restart the app
(`ADB_SHELL_COMMAND` and `PRESSED_HOME` are banned from this script),
cannot toggle airplane mode, cannot rotate the device, and cannot open
another app's share sheet:

- **L03 (relaunch persists library)** — needs force-stop + relaunch.
- **L04 (launch offline)** — needs airplane mode.
- **L05 (kill during queue processing)** — needs a mid-fetch kill;
  if the timing cannot be hit, the case file allows
  UNVERIFIABLE-ON-DEVICE with `queue.ts` as code evidence only.
- **L06 (background/foreground + rotation during import)** — needs
  backgrounding and rotation.
- **Q06 (queue survives relaunch; failed items dropped)** — needs
  force-stop + relaunch.
- **S03 (delete from Seen is permanent, after relaunch)** — needs
  relaunch.
- **G06 (upgrade from an old save)** — needs a device with a
  pre-existing old-format save; not set up by a fresh Test Lab install.
- **T03 (offline Trending error + Retry recovery)** — needs
  offline/online toggling.
- **T04 ("All caught up" only after exhausting the feed)** — needs
  cycling the entire feed; the feed length is unknown and Trending
  right-swipes add cards to Watchlist, so exhausting it would pollute
  the library the later stages depend on.
- **E06 (network failure mid-import, then Retry recovers)** — needs
  offline/online toggling.
- **I07 (share-sheet / deep-link import)** — needs another app's
  Share action; the repo's share path is the iOS extension deep link
  `movierecommender://import?sharedUrl=...`, which is not evidence of
  Android share-sheet support. Record present-vs-absent on a device;
  do not mark PASS on iOS-only evidence.
- **R02 (Recent caps at 10; 11th import drops the oldest)** — the
  journey performs 12 imports in total, but verifying "exactly 10 rows
  remain, oldest gone" requires exact row counting across a scrolled
  list, which crawl video cannot establish reliably. Needs a dedicated
  run with row counting.

## Cases pending-URL (no script steps; do not guess a URL)

Content-dependent cases whose URLs could NOT be validated by public
web search, so their steps were omitted rather than invented:

- **I01 (YouTube Short, title matches TMDB directly, 1 title)** —
  pending: no Short whose title is exactly a well-known movie title
  could be validated. (I02 variants ARE covered via stage F; the
  JeHim video is a Gemini multi-title import, not a direct-match
  single-title import, so it does not stand in for I01.)
- **I04 (Instagram Reel import)** — pending: no public Instagram Reel
  URL with a movie-naming caption could be validated.
- **I05 (Facebook Reel import)** — pending: no public Facebook Reel
  URL could be validated; if Facebook links turn out login-walled on
  device, record the exact error and mark BLOCKED-BY-PLATFORM, not
  PASS/FAIL on the app.
- **G04 (duplicate reel import reports alreadyHave)** — pending:
  needs a validated reel (same dependency as I04/I05); reel-path
  dedupe cannot be exercised with YouTube URLs.
- **E08 (private Instagram Reel)** — pending: no private/nonexistent
  Reel URL could be validated (a nonexistent Reel URL would be the
  recorded substitute if one is found).

When a URL for any of these is validated, add its steps to stage K
(import → results/error card, exactly like the other stage-K steps)
and move the case into the table above; do not edit verdicts to fit
an unvalidated URL.
