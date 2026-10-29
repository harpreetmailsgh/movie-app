# Maestro Verdict Guide — Directed Journey (D6)

Replaces the Robo verdict guide for this harness
(`testlab/DIRECTED-RUN-VERDICT-GUIDE.md` is kept for reference only).
Verdicts come from Maestro ASSERTIONS in the flow output, not from
video review — except for the closed screenshot-exception list below
(plan §4, as corrected 2026-10-29).

## How to read a run

1. **Runner summary** — `maestro-run.sh` prints one line per flow at the
   end of its stdout (captured by the workflow as `maestro-output.txt`):

   ```
   01-a-launch.yaml: PASS
   ...
   OVERALL: PASS (all 10 flows passed)
   ```

   A failed flow stops the run (fail-fast, plan §1.3): every later
   stage is printed **NOT RUN, never FAIL**. A stage after a failure
   has no verdict — it was not attempted, and its cases must not be
   marked FAIL. Re-run from the start after fixing the broken stage;
   do not hand-edit a NOT RUN into a PASS.
2. **Per-flow Maestro output** — the same log shows every command's
   pass/fail. The failing command names the broken assertion; quote it
   in the verdict (T2 maps output → cases).
3. **Artifacts** — `maestro-report/` (workflow upload, `if-no-files-found:
   warn`): `takeScreenshot` captures, organized per flow. Screenshots
   are the evidence for every §4 exception below and for the I03
   outcome text, the E04 spec question, and any E05 hallucinated title.
4. **logcat.txt** — full `adb logcat -v time` from the workflow; DB1
   greps it for the ANR question. An ANR in a Maestro run is app
   evidence only with the logcat excerpt + the Maestro step active at
   that timestamp — never by assumption.

## Case accounting (no case silently dropped)

Distinct cases total **71**:

| Bucket | Count | Cases |
| --- | --- | --- |
| Script-covered A (flows assert them) | 53 | §1 tables below (W05 counted here for its script half only) |
| Data-blocked A (blocked, NOT dropped) | 5 | I01, I04, I05, G04, E08 (§2) |
| Human-only C | 9 | L03, L05, L06, I07, Q06, S03, T04, R02, G06 (§3) |
| Split case (script half + human half) | 1 | W05 (script half §1 stage H; relaunch half §3) |
| DROPPED, never run | 3 | L04, T03, E06 (§4) |
| **Total distinct** | **71** | 53 + 5 + 9 + 1 + 3 |

That is: 58 A cases (53 script + 5 blocked) + 10 C entries (9
human-only + the W05 relaunch half) + 3 DROPPED = 71 distinct cases
with W05 counted once. (The D6 brief's "58 A + 5 blocked + 10 C = 71"
double-counts the blocked 5 — 58 already includes them. This table is
the corrected accounting.)

Flows 01–02 and 10 are delivered (D2, D6). Flows 03–09 are delivered by
D3–D5; the assertions below are the verdict contract those flows must
implement, and T1 validates the built flows against this guide before
any runner run. If a built flow's assertion differs from this guide,
the guide is updated by Planner agreement — never silently.

## Screenshot exceptions (plan §4 — closed list, as corrected)

Maestro has no order assertion. These verdicts come ONLY from the
named `takeScreenshot`, judged against the case's rule. Everything
else is a hard assertion. Do not widen this list without Tester
agreement (plan §4):

- **Order**: W02 (A→Z in Tiles + List), W03 (deck = stored order, not
  A→Z), R01/G03 (Recent newest-first), U01/U02 (verified-first
  ordering) — judged from the named screenshots only.
- **T01 spinner visual**: the `Finding what's trending…` text IS
  asserted; the spinner-vs-vertical-line visual is judged from the
  immediate post-tap screenshot.
- **R08 thumbnails**: YouTube thumbnail vs clapboard vs broken image,
  from Recent screenshots.
- **G05 duplicate (CORRECTED 2026-10-29, supersedes the plan's
  index-1 form)**: judged from stage H's W02 Watchlist List screenshot
  (flow 08 already takes Tiles + List screenshots). Same title twice
  in that screenshot → duplicate confirmed (recorded finding,
  candidate minor defect, NOT a FAIL — code predicts no dedupe on the
  YouTube path). No title twice → no duplicate observed. Reason: no
  JeHim/Gemini title is recorded anywhere and Gemini yield varies run
  to run, so no literal title is writable; and a Recent-row tap cannot
  test Watchlist duplication (Recent rows are per-video by design —
  4 imports correctly yield 4 rows). No flow-G tap, no literal title.
- **I03 outcome text (narrowed by the when-branch enhancement)**:
  the outcome BRANCH (results vs error) is now asserted by Maestro
  `when`-conditional sub-flows in 10-k-stagek.yaml (docs.maestro.dev
  "Conditions": `runFlow` with `when: visible` runs its commands only
  when the selector is visible, otherwise skips — exactly one branch
  executes, and the Maestro log names which one ran). Only the EXACT
  outcome text (which title, or which error string) is still read
  from the outcome screenshot, because the TikTok caption is not known
  before the run. The flow FAILS only on crash or silent drop: the
  shared outcome wait fails if NO card ever appears, and the Recent
  section assert fails if no Recent rows were recorded.
- **R03/R04 glyphs (CONFIRMED at T1, 2026-10-29 — not a widening)**:
  §4 names R08 thumbnails but not R03/R04 glyphs explicitly. They are
  judged from the SAME Recent screenshots already mandated for R01/R08
  (no new screenshots): a fully verified import's row shows ✓ green
  (R03); the JeHim mixed import's row shows ⚠ orange (R04). If the
  run's JeHim import comes back fully verified, its row showing ✓ is
  consistent and R04 becomes NOT RUN on this run, not FAIL (Robo
  rule). If no fully verified import occurs in the run, R03 is NOT
  RUN, not FAIL. Explicit R03/R04 rows are now in the §1 stage-F and
  stage-G tables. A hard glyph assert would be wrong here because
  which glyph appears depends on the run's Gemini yield.

## Special verdict rules (do not re-interpret per run)

- **E05 hallucination = FAIL.** A title from a cooking video is app
  misbehaviour. In 10-k-stagek.yaml the shared wait succeeds on a
  results card too, the screenshot captures the hallucinated title,
  and the verbatim error assert then FAILS the flow. Quote the title
  from the screenshot in the verdict.
- **E04 direct-match success = SPEC QUESTION, not FAIL.** The
  duration gate only fires on the Gemini path; a >5-min video whose
  title matches TMDB directly succeeds before the gate is checked
  (src/lib/importWorker.ts). In 10-k-stagek.yaml the results branch
  asserts the results card and the flow passes; record the matched
  title from the outcome screenshot and raise it as a spec question.
  Any OTHER E04 outcome (e.g. "Couldn't read that video") FAILS the
  combined assert — it is neither the gate nor a direct match.
- **E03 live ID = NOT RUN, not FAIL.** If the chosen nonexistent ID
  turns out to be a live video, the test data is invalid.
- **E02 success is conditional.** The garbage URL passes only if it
  genuinely yielded titles; record which happened (error card vs
  results card), per the Robo rule.
- **Q08 transition = NOT RUN if unobserved, not FAIL.** If no step
  catches the Queue row changing from raw URL to video title, Q08 is
  NOT RUN — absence of an observed transition is not a failure.
- **S04 filter half = NOT RUN with reason, never FAIL on a guess.**
  If Seen's filter UI differs from Trending's in a way that blocks the
  filter steps, the filter half stays NOT RUN with the reason recorded.
- **G05 either way = NOT FAIL.** Duplicate confirmed or not observed
  — both are recorded findings, never a flow failure (see §4 above).
- **W05 split**: the script half (Trash delete, no Trash/Restore UI
  in the journey) is asserted in stage H; only the post-relaunch
  "does not reappear" confirmation stays human (§3).

## §1 — Script-covered A cases: flow → case → assertion

### 01-a-launch.yaml — stage A (D2, delivered)

| Case | Assertion |
| --- | --- |
| L01 (launch/nav) | `launchApp` clearState renders Watchlist; flow completion proves no crash/blank screen; tab navigation asserts below |
| L02 (empty states) | Empty texts in Watchlist Tiles/List/Cards and Seen Cards/List |
| M01 (empty Watchlist) | `Nothing in your watchlist yet.` in Tiles + List; `Nothing here yet` in Cards |
| M02 (empty Seen) | `Nothing here yet.?` in Seen Cards + List |
| M03 (empty Recent) | `assertNotVisible` regex `.*Recent videos.*` on Import |
| M04 (empty Queue) | `assertNotVisible` `Queue` on Import |

### 02-b-tabs.yaml — stage B (D2, delivered)

| Case | Assertion |
| --- | --- |
| L01 (Settings renders) | Seen → Settings → `assertVisible` `Settings` → Watchlist |

### 03-c-trending.yaml — stage C (D3; the step that killed Robo run #6)

| Case | Assertion |
| --- | --- |
| T01 (loading spinner) | `assertVisible` `Finding what's trending…` immediately after tapping Trending, + immediate screenshot; spinner visual screenshot-judged (§4) |
| T02 (feed loads) | Feed content visible in Tiles + Cards views; two left swipes (NEVER right-swipe: it adds the card to Watchlist) |
| T05 (filter no-match) | Tap `Language ▾` (NOT bare `Language` — the pill renders with ` ▾`, plan §2 rule 1) → `Hindi` → `Done` → no-match text verbatim (`No matches — trending items do not carry language or rating data; try clearing those.`) → `✕ Clear` → feed content visible again |
| T06 (CORRECTED 2026-10-29 — supersedes the plan's original post-load assertNotVisible) | `assertNotVisible` `Last refreshed` DURING loading (right after the loading-text assert, before the feed appears) AND `assertVisible` regex `Last refreshed.*` AFTER the feed loads. Reason, verified from source: the first successful load itself sets lastRefreshedAt (src/lib/trending.ts:416,478), getTrendingMeta returns it (trending.ts:491-493), and src/app/(tabs)/trending.tsx:180-182 renders the line immediately after the first load — the original post-load assertNotVisible would fail a correct app |

### 04-d-search-add.yaml — stage D (D3)

| Case | Assertion |
| --- | --- |
| I08 (search add) | `Search movies` → `Predestination` → result row tap → Watchlist List shows `Predestination` |
| W01 (auto-appear, Predestination half) | Same Watchlist presence assert as I08 |

### 05-e-save-typed.yaml — stage E (D3)

| Case | Assertion |
| --- | --- |
| I09 (save as typed) | `Search movies` → `Zqxjkv Blorpt` → row matching regex `exactly as typed` → Watchlist List shows `Zqxjkv Blorpt` |
| U04 (entry present half) | Same Watchlist presence assert as I09 (deletion half in stage H) |

### 06-f-rapid3.yaml — stage F (D4)

| Case | Assertion |
| --- | --- |
| Q01 (Queued label) | After 3rd Fetch: `Queue` header + `Queued` visible |
| Q02 (Processing dots) | Regex `Processing\.+` visible (dots animate — regex, never a fixed dot count) |
| Q03 (one at a time) | `Queued` still visible while `Processing` shows (both labels co-visible) |
| Q04 (success auto-dismiss) | Per-import outcome wait (120s each) → `Queue` header gone after drain (rows auto-dismiss; no `done` state exists) |
| Q07 (all complete) | All 3 imports land in Recent (3 rows) |
| Q08 (row title replaces URL) | End-state proof: after the drain, no Recent row shows a raw URL (flow 06 asserts `assertNotVisible` on each of the three raw URLs) — NOT a "transition observed" claim; if no step catches the Queue row changing from raw URL to video title mid-run, that transition observation itself is NOT RUN, not FAIL (see special rules) |
| R03 (fully verified glyph) | Screenshot-judged from the already-mandated Recent screenshot (flow 06 `f-recent-list`): a fully verified import's row shows ✓ green. If the run's imports yield no fully verified row, R03 is NOT RUN, never FAIL — the glyph depends on the run's Gemini yield (see §4 R03/R04 note) |
| R04 (mixed glyph) | Screenshot-judged from the already-mandated Recent screenshot (flow 06 `f-recent-list`): a mixed import's row shows ⚠ orange. If the run's imports come back fully verified (no mixed row), R04 is NOT RUN, never FAIL — the glyph depends on the run's Gemini yield (see §4 R03/R04 note) |
| I02 (URL variants) | All 3 forms (Shorts / watch / youtu.be) of JeHimZxgX48 → same titles |
| I06 (field cleared, no double-enqueue) | Fetch-disabled after each Fetch: flow 06 asserts `Fetch` `enabled: false` after F1, F2 and F3 (submitLink clears the link and the button is `disabled={!link.trim()}`, so Fetch disabled ⟺ field empty). An `assertNotVisible` of the URL text would be WRONG here: the Queue row itself shows the raw URL until the video title is known. Exactly one Queue row per tap — 3 rows at drain, 4+ rows = double-enqueue FAIL |
| I10 (re-import recorded) | Stage G's re-import (4th total) lands a new Recent row (asserted in flow G) |
| G01 (no title lost) | Every video's titles in Watchlist (asserted per title in stage H) + Recent rows (asserted here) |
| G03 (Recent newest-first) | ORDER screenshot of the Recent list (§4) |
| R01 (rows per video, partial) | Rows asserted here; completion (newest-first) in stage K final screenshot |

### 07-g-mixed.yaml — stage G (D4)

| Case | Assertion |
| --- | --- |
| G02 (all titles survive) | Results card shows all titles (card half here; Watchlist half in stage H) |
| U01 (verified first, card) | ORDER screenshot of the results card (§4): verified titles numbered first, unverified last |
| U02 (verified first, expansion) | `Couldn't verify this title` asserted inside the expanded row + ORDER screenshot (§4) |
| U03 (unverified label) | `assertVisible` `Couldn't verify this title` + the raw title text |
| R06 (expand/collapse) | Tap newest row via subtitle regex `\d+ titles?` (index 0 — NOT the literal `5 titles`, plan §2 rule 3) → expanded list shows the video's titles → tap again → expansion closed |
| I10 (re-import row) | Re-import of the Shorts URL lands a new Recent row |
| R03 (fully verified glyph) | Screenshot-judged from the already-mandated Recent screenshots (flow 06 `f-recent-list`, flow 07 `g-expanded-row`): a fully verified import's row shows ✓ green. If the run yields no fully verified row, R03 is NOT RUN, never FAIL (see §4 R03/R04 note) |
| R04 (mixed glyph) | Screenshot-judged from the already-mandated Recent screenshots (flow 06 `f-recent-list`, flow 07 `g-expanded-row`): the JeHim mixed import's row shows ⚠ orange. If the run's JeHim import comes back fully verified (no mixed row), R04 is NOT RUN, never FAIL (see §4 R03/R04 note) |
| G05 | NOT asserted here — screenshot-judged from stage H's W02 List screenshot (§4 correction above). Any G05 tap in flow G is out of date and must be removed (D4-fix) |

### 08-h-watchlist-seen.yaml — stage H (D5)

| Case | Assertion |
| --- | --- |
| W01 (auto-appear, completion) | Fetched titles present across Watchlist views |
| W02 (A→Z sort) | ORDER screenshots of Tiles + List (§4); presence of each title asserted |
| W03 (deck order) | Deck swipes (UP first, then left, right — T1 fix 2026-10-29: LEFT/RIGHT cycle the top card to the back, so UP must run first or it moves a JeHim title, not Predestination) + ORDER screenshot of the deck taken BEFORE the UP swipe (§4: stored order, not A→Z); swipe-up move asserted via the title appearing in Seen |
| W04 (move to Seen) | Title leaves Watchlist, appears in Seen (List swipe → `✓ Seen`, and Cards swipe-up) |
| W05 (script half) | Detail `Trash` delete → title gone from Watchlist in later views; no Trash/Restore UI anywhere in the journey (`assertNotVisible` `Restore` if such a string exists) |
| W06 (details render) | `Predestination` detail renders (poster); `Zqxjkv Blorpt` detail renders clapboard fallback, no broken image |
| W07 (deletable) | Detail `Trash` on the gibberish entry → entry gone from Watchlist |
| U04 (deletion half) | Same Trash-delete assert as W07 (entry-present half in stage E) |
| S01 (Seen shows moved) | Title present in Seen after the move |
| S02 (move back) | Seen row swipe → move-back action (label verified from seen.tsx in build) → title back in Watchlist, gone from Seen |
| S04 (Seen filters + views) | Seen Tiles/List views asserted + NEW filter half: FilterBar pill → filter value → filtered-list assert → clear → restoration assert. If Seen's filter UI blocks this, filter half is NOT RUN with reason, never FAIL on a guess |
| G05 (duplicate, CORRECTED) | Screenshot-judged from this flow's W02 Watchlist List screenshot (§4): same title twice → duplicate confirmed (recorded finding, candidate minor defect, NOT FAIL); no title twice → no duplicate observed |

### 09-i-errors.yaml — stage I (D5)

| Case | Assertion |
| --- | --- |
| E01 (plain text) | `hello world` → verbatim `That doesn’t look like a link — paste the full reel URL.` (CURLY ’) |
| E02 (garbage URL) | `https://example.com/some-video` → verbatim `Couldn’t read that reel (it may be private). You can add the title manually below.` — or a genuine success, recorded as such (see special rules) |
| E07 (malformed TikTok) | `https://www.tiktok.com/@user` → verbatim `That doesn't look like a TikTok link — use a tiktok.com or vm.tiktok.com link.` (STRAIGHT ') |
| E03 (dead video) | `https://www.youtube.com/watch?v=aB3dEf7hJkL` → verbatim `Couldn't read that video (it may be private or removed).` — live ID → NOT RUN |
| Q05 (failure handling) | Per error: Queue row auto-dismisses, error card shows the worker error verbatim, failed Recent row appears |
| R05 (failed rows) | Failed rows show ✕ + the error as subtitle (expanded row) |
| R07 (Retry) | Tap `Retry` on the expanded failed row → Queue row reappears (`Queued` → `Processing`) → same E03 error again → NEW Recent row at top. Judged from the Queue row + new Recent row, NOT the old error card (the Retry path does not clear it) |

### 10-k-stagek.yaml — stage K (D6, delivered)

| Case | Assertion |
| --- | --- |
| I03 (TikTok import) | Shared results-or-error wait (120s) → outcome screenshot → `when`-branch asserts (results branch asserts `titles? fetched`; error branch asserts the error regex; exactly one runs, log names it) → Recent section assert + Recent screenshot. Exact outcome text screenshot-judged (§4). FAIL only on crash or silent drop |
| E05 (no movies found) | Short `kK9jr1CxROs` → verbatim `Could not fetch any movie in this video.` + `assertNotVisible` `titles? fetched` (no results card = nothing added). Hallucinated title → FAIL, quote it from the screenshot |
| E04 (>5-min video) | Video `0BWo6VhJ8zI` → gate error asserted on the expected branch (`Share a video up to 5 mins long.` verbatim); direct-match results card → SPEC QUESTION branch (flow passes, quote the title); any other outcome FAILS the combined assert |
| Q05 (completion) | `assertNotVisible` `Queue` at journey's end (queue drained; the regex also catches a stuck `Queued` row) |
| R01 (completion) | Final Recent screenshot: one row per processed video, newest first |
| R05 (completion) | Final Recent screenshot: failed rows show ✕ + error subtitle |
| R08 (thumbnails) | Final Recent screenshot: YouTube rows show i.ytimg.com thumbnails, TikTok row the clapboard, no broken-image box |

## §2 — Data-blocked A cases (blocked, NOT dropped)

Need validated URLs from Harpreet/Tara before any steps can be written.
Do not guess a URL. When a URL is validated, its steps join stage K
(import → results/error card, exactly like the other stage-K steps)
and the case moves into §1. Until then these cases have NO verdict —
they are not PASS, not FAIL, and not dropped.

| Case | Blocked on |
| --- | --- |
| I01 (YouTube Short, title matches TMDB directly, 1 title) | No Short whose title is exactly a well-known movie title could be validated. The JeHim video is a Gemini multi-title import, not a direct-match single-title import, so it does not stand in for I01 |
| I04 (Instagram Reel import) | No public Instagram Reel URL with a movie-naming caption validated |
| I05 (Facebook Reel import) | No public Facebook Reel URL validated; if Facebook links turn out login-walled on device, record the exact error and mark BLOCKED-BY-PLATFORM, not PASS/FAIL |
| G04 (duplicate reel reports alreadyHave) | Needs a validated reel (same dependency as I04/I05); reel-path dedupe cannot be exercised with YouTube URLs |
| E08 (private Instagram Reel) | No private/nonexistent Reel URL validated (a nonexistent Reel URL would be the recorded substitute if one is found) |

## §3 — Human C cases (Maestro does not cover them)

| Case | Human status |
| --- | --- |
| L03 (relaunch persists library) | Human: force-stop + relaunch, library intact |
| L05 (kill during queue processing) | Human: mid-fetch kill; if the timing cannot be hit, the case file allows UNVERIFIABLE-ON-DEVICE with `queue.ts` as code evidence only |
| L06 (background/foreground + rotation during import) | Human: backgrounding + rotation during an import |
| I07 (share-sheet / deep-link import) | Human: another app's Share action; the repo's share path is the iOS extension deep link `movierecommender://import?sharedUrl=...`, which is not evidence of Android share-sheet support — record present-vs-absent on a device, do not mark PASS on iOS-only evidence |
| Q06 (queue survives relaunch; failed items dropped) | Human: force-stop + relaunch, queue state checked |
| W05 (relaunch half) | Human: post-relaunch confirmation that the Trash-deleted title does not reappear (script half in stage H) |
| S03 (delete from Seen permanent, after relaunch) | Human: relaunch after a Seen delete |
| T04 ("All caught up" only after exhausting the feed) | Human: cycling the entire feed — feed length unknown, and Trending right-swipes add cards to Watchlist, so exhausting it would pollute the library later stages depend on |
| R02 (Recent caps at 10; 11th import drops the oldest) | Human: 11 sequential network imports cannot fit the script's time window; revisit only if a raised-timeout long script is ever built |
| G06 (upgrade from an old save) | Human: needs a device with a pre-existing old-format save; not set up by a fresh emulator install |

## §4 — DROPPED cases (never run, by Harpreet's 2026-10-28 decision)

Offline behavior is out of scope for this cycle. These are not
verdicts and not failures — they are never run.

| Case | Reason |
| --- | --- |
| L04 (launch offline) | Needs airplane mode; offline out of scope |
| T03 (offline Trending error + Retry recovery) | Needs offline/online toggling; offline out of scope |
| E06 (network failure mid-import, then Retry recovers) | Needs offline/online toggling; offline out of scope |

## Fail-fast + NOT RUN rules (plan §1.3, §1.4)

- The official verdict run is always the FULL ordered sequence from a
  fresh emulator + fresh APK install, via `maestro-run.sh`. Flows are
  independently runnable during development, but a verdict only comes
  from the ordered run.
- First failed flow stops the run. Later stages are NOT RUN (never
  FAIL). A case in a NOT RUN stage has no verdict for that run.
- A missing flow file FAILS its stage in the runner (it does not skip
  it) — flows 03–09 must exist before any verdict run is attempted.
- Downstream-of-failure results are never reported as PASS on a rerun
  that skips the failed stage. Fix the stage, re-run from the start.
