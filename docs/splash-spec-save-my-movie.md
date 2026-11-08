# Splash screen spec — "Save My Movie" (for Dev-1)

## Revision — elegant gold name, v4 (2026-11-08)
Harpreet's change: "Not factored but fancier, use better font,
consult the ui designer." The fractured direction is **dropped**:
the v3 fractured display font is out — no cracked, glitchy, or distressed
lettering. Final pick: **Cinzel Bold** (Google Fonts, SIL Open Font
License 1.1 — verified in the font's own `OFL.txt` from the
google/fonts repo; free for commercial use, including bundling in
the app; only restriction is not selling the font file on its own).
Why it fits: Cinzel is the classic Roman inscriptional face used
for film-title credits — refined and cinematic, fancy without a
gimmick. Font file bundled at `assets/fonts/Cinzel-Bold.ttf` (with
`OFL.txt` alongside it); Dev-1 wires it in — **frame 1 of the intro
must use this same font**, so the PNG and the in-app text match
exactly.
- **Static Bold instance, not the variable font:** the file is a
  static weight-700 instance cut from Cinzel's variable font
  (`Cinzel[wght].ttf`, google/fonts) with fontTools, so the app
  loads exactly Bold — no variable-font weight ambiguity in-app.
  77 KB (the v3 fractured font file was 407 KB and is deleted).
- **Size 84 px, not 92 px:** Cinzel runs wide — at 92 px Bold the
  advance ran x 199–953, only 3 px of margin. At 84 px the gold ink
  is x 235–918, y 1522–1583 (verified in the exported PNG) — inside
  the safe centre (x 196–956) with margin. Tracking still 3 px.
- **Colour bright gold `#FFC832` (kept):** gold suits the Roman
  capitals — classic cinema-marquee gold on black, and it matches
  the amber M and underline. White was considered and rejected as
  colder and plainer. Amber underline unchanged: 140 × 9 px,
  `#F5A623`, y 1630–1639.
- Re-export: `/tmp/build_splash_clapper_v3.py` (same script, only
  font path / size changed). v2 script left untouched. No fallback
  was needed — the font renders cleanly at 84 px. No app code,
  `package.json`, or `app.json` was touched.
- The v3 mockup and everything built from it is discarded.
  The v3 font file and its `OFL.txt` are
  deleted — no dead font ships with the app.

## Revision — animated launch, v2 (2026-11-08)
Harpreet wants the launch **animated**: clapperboard → clap shut → zoom
into the amber M → app opens. The parent built mockup video v2
(`splash-launch-mockup-v2.mp4`, 4.17 s) and the Planner + UI Designer
critiqued it frame by frame (frames `f_01`–`f_08`). The verdict below is
the final ordered improvement list — the mockup's defects are fixed in
this spec, not carried forward. The static image was also rebuilt (v2):
stripe-spill defect fixed, amber underline + rivets added, strip height
matched to the stick so the closed frame lands clean.

## The hard constraint (verified, do not work around it)
The iOS native splash is a **static image and cannot animate**
(`expo-splash-screen` accepts only a static PNG; confirmed against the
Expo SDK 57 docs — the native splash shows before JS runs, so no
animation logic can execute there). The animation therefore lives in an
**in-app intro screen** that plays the moment the static splash hides.
The static splash image is the clapperboard's **OPEN frame** (stick up),
and the intro's first frame reproduces it exactly, so the handoff is
seamless — no flash or jump.

## Static asset (done — rebuilt v2, do not regenerate)
- File: `assets/splash.png` — 1152 × 2048 px, PNG, RGB.
- The old clapperboard / red-play-button / **"Movie Deck"** splash is
  **deleted and replaced** by this file. Nothing of the old image remains.
- Background: pure black `#000000` across the whole canvas (corners
  verified `#000000`). The mockup used a dark-navy background
  (`#0B1017`) — **rejected**: it would flash against the native splash's
  black. Intro background is `#000000` throughout.
- All content sits well inside the safe centre (bounds x 196–956,
  y 416–1639 of 1152 × 2048), so nothing is cropped by
  `resizeMode: "contain"` on any phone aspect ratio.

### What the image contains (nothing else)
1. **Clapperboard**, centred. Body x 196–956, y 780–1420 (760 × 640),
   fill `#1E1E21`, 3 px outline `#3A3A40`, 20 px corner radius.
   Four corner rivets (r 9, fill `#4A4A50`) at (226, 896), (926, 896),
   (226, 1390), (926, 1390).
2. **Board top strip** — black/white diagonal stripes, y 780–866
   (86 px tall), stripe pitch 96 px / black-stripe width 48 px.
   The strip is exactly the stick's thickness: when the stick closes it
   lands on the strip and covers it completely (same x-range, same
   stripe pitch and phase), so the closed frame reads as one clap, not
   two striped bands (the mockup showed both bands stacked — wrong).
3. **The amber film-strip "M"** — taken directly from the app icon
   (`assets/icon-filmm.png`, Harpreet's Oct 11 pick). It was **not
   redrawn**: the M was cropped from the icon file and placed on the
   board, so the mark matches the app icon exactly (amber/orange folded
   film strip, black sprocket holes, soft amber glow in the centre fold).
   - Size: 500 px wide × 435 px tall. Position: x 326–826, y 925–1360,
     centred on the board below the strip. Centre (576, 1143) — this is
     the **zoom anchor** for the whole animation.
   - The mockup's M was much smaller (~300 px wide) and sat in a faint
     square halo (its crop background wasn't transparent) — both
     rejected. Keep this 500 px M with the brightness-alpha crop (no
     square edge). Source of the M for any future re-export:
     `assets/icon-filmm.png` (1024 × 1024). Build method used: PIL crop
     of the icon (x 91–932, y 154–886) with a brightness-derived alpha
     mask so the icon's dark background blends into the board with no
     visible square edge.
4. **The stick (clapper), OPEN** — 760 px long × 86 px thick, exactly
   the board's width (no overhang either side), hinged at the board's
   top-left corner, pivot (210, 823). Open angle **30° up** (right end
   raised). White with the same black/white diagonal stripes as the
   strip (pitch 96 / width 48), hinge bolt at the pivot.
   - The stick's right tip ends at about (871, 419) — fully visible,
     ~280 px from the right edge and ~420 px from the top. The mockup's
     stick was longer than the board and shallower (~24°), so its tip
     was sliced off by the frame's right edge — that is the defect this
     fixes. Never let the stick touch a frame edge.
   - v1 of this image had a defect of its own (unclipped stick stripes
     spilling past the bar as a stray wedge left of the hinge) — fixed
     in v2 by masking the stripes to the bar shape. Verified gone.
5. **"Save My Movie"** — bright gold (`#FFC832`), elegant display
   font (**Cinzel Bold, 84 px**, 3 px letter tracking), one line,
   centred. Spelled exactly: **Save My Movie**. Text top
   y ≈ 1500, ink y 1522–1583, centred on x = 576. (v4, 2026-11-08:
   was the v3 fractured font at 92 px — dropped per Harpreet's "not
   fractured but fancier" call; before that, white Liberation Sans
   Bold 96 px; see v4 revision note above. Font file:
   `assets/fonts/Cinzel-Bold.ttf` — Dev-1 wires this same font
   for the intro's frame 1 text.)
6. **Amber underline** — 140 × 9 px, rounded ends, amber `#F5A623`
   (sampled from the icon's M), centred on x = 576, y 1630–1639,
   ~40 px below the text. Kept from the mockup — it matches the icon.
   It fades out with the text (see timeline); it never scales.

## The launch, frame by frame (what Harpreet / the user sees)
1. Native splash: open clapperboard, stick up, M on the board,
   "Save My Movie" + amber underline. Holds still — this is the beat
   where the eye registers the board.
2. The stick **snaps** shut — fast, with a hard stop, not a slow close.
3. The board gives a tiny punch at the impact (1.5% scale bounce) while
   the text + underline fade away.
4. The camera **zooms into the M** — the M grows clearly faster than
   the board, so the M fills the screen while the board falls away.
5. The intro fades out fast and the clean Watchlist deck is there.
   Total **2.0 s**. Nothing lingers after the reveal.

## Animation spec (Dev-1 implements this — no code was changed here)
- **API: React Native's built-in `Animated` API only.** Verified in
  `package.json`: `react-native-reanimated` is **not** installed (only a
  peer-dependency mention in the lockfile) — do **not** add it, and do
  not add any other animation library. `expo-splash-screen` (`~57.0.11`)
  is already installed. No `SplashScreen.*` calls exist in `src/` yet —
  Dev-1 adds `preventAutoHideAsync()` / `hideAsync()` wiring as part of
  this work.
- **Structure:** one full-screen intro view, `#000000`, rendered above
  the router content; the Watchlist deck is mounted **beneath it from
  t = 0**, fully opaque. The intro is the only thing that ever fades —
  never crossfade the splash over the deck (the mockup did, and stripes
  + giant ghosted text sat over the deck mid-fade, reading as a glitch).
- **Layers** (separate `Animated.View`s, so each moves on its own):
  `StickView` (rotation about the hinge), `BoardView` (board + strip +
  rivets + M as one unit, for the punch and the slow zoom),
  `MView` (the M alone, for the fast zoom — same M crop as the static
  image), `TextView` ("Save My Movie" + amber underline together).
  All positions are fractions of screen size, taken from the static
  geometry above (board left 17.0% of width, M centre 50.0% width /
  55.8% height, hinge 18.2% width / 40.2% height).
- **Frame 1 = the static splash, pixel-for-pixel.** Build frame 1 from
  the same layered views using the geometry numbers above, on `#000`.
  Acceptance check: screenshot the intro's first frame on a device and
  compare with `assets/splash.png` — no visible jump when the native
  splash hides. Fallback if the geometry can't be matched exactly:
  render `assets/splash.png` itself (contain, black bg) as frame 1 and
  swap to the layered views at the clap onset (t = 0.50 s) — the swap
  is hidden by the motion starting.
- **Hinge rotation:** the stick rotates about its left end (the hinge
  at the board's top-left corner). In RN, `rotate` spins about a view's
  centre, so offset it: translate the stick view so the hinge sits at
  the rotation origin, rotate, translate back. The closed stick must
  land exactly on the board's strip (same x-range, same stripe phase) —
  verify visually on device.

### Timeline (total exactly 2.0 s — the intro animation only, see the
### boundary note below; hard ceiling 2.0 s — unmount by then even if
### fonts/data aren't ready; the deck may show its own loading state,
### the intro must never wait for data)
| t (s) | What happens |
|---|---|
| 0.00–0.50 | **OPEN HOLD (500 ms).** Static open frame, nothing moves. The mockup started clapping immediately (no hold) — the board never registered. |
| 0.50–0.70 | **CLAP (200 ms).** Stick rotates 30° → 0°, `Easing.in` (accelerating — a clap speeds up into the hit, it doesn't glide), hard stop at 0°. The mockup's ~500 ms close read as a slow lid, not a clap. |
| 0.70 | **IMPACT.** Board punch: scale 1 → 1.015 in 50 ms, back to 1.0 over 150 ms (`Easing.out`). Text + underline fade opacity 1 → 0 over 80 ms, starting at impact — they are gone before the zoom starts, so they can never balloon or crop (the mockup's text scaled up and clipped at both edges). |
| 0.70–0.80 | **CLOSED HOLD (100 ms).** Closed board held just long enough for the eye to register the beat. |
| 0.80–1.70 | **ZOOM (900 ms), `Easing.in` (accelerating push).** M scales 1 → 3.5×, board (+ stick) scales 1 → 1.5×, **both anchored on the M centre** (50.0% width, 55.8% height). The M grows faster than everything else, so at the end it is ≥ 1.4× screen width and dominates the frame while the board falls away. The mockup scaled everything together about the screen centre, so the stripes and text grew as fast as the M and the board's edges left the frame while the M was still small — that is the exact failure this fixes. |
| 1.70–2.00 | **REVEAL (300 ms).** Whole intro opacity 1 → 0 (linear), deck revealed clean beneath. Intro **unmounts at 2.00 s**. No crossfade, no ghosting. |

### What the 2.0 s covers — the boundary (in Harpreet's terms)
The 2.0 s is the **intro animation only**. It does **not** include
loading the first screen. The intro runs its 2.0 s and unmounts;
whatever the Watchlist deck needs to load afterwards happens **after**
the reveal and is not counted in the 2 s. The intro never waits for
data, and the deck may show its own loading state after the reveal.
- **Dead-tail rule:** the mockup ran 4.17 s while the animation was done
  by ~2 s — frames `f_05`–`f_08` are four static deck shots
  (f_06–f_08 byte-identical, f_05 nearly so). The launch ends at the
  reveal. Nothing after it.
- **Optional, not required:** a light impact haptic at t = 0.70
  (`expo-haptics` is already a dependency). One line, only if it
  doesn't complicate the timing. Never let it delay the clap.

## Critique of mockup v2 — per point (Planner's read → verdict)
1. **Dead tail (animation done ~2 s, video 4.17 s) — AGREE.** Frames
   f_05–f_08 are static deck shots (f_06–f_08 byte-identical). Fixed by
   the timeline above: intro unmounts at 2.0 s, hard ceiling 2.0 s.
2. **Clap has no snap (~0.5 s close) — AGREE.** 200 ms accelerating
   clap + hard stop + 100 ms closed hold + 1.5% board punch. The punch
   is the part the eye reads as impact; without it the snap doesn't
   land.
3. **Zoom targets the whole board, not the M — AGREE.** Fixed by the
   two-layer zoom (M 3.5× vs board 1.5×, both anchored on the M centre).
4. **Text balloons and crops mid-zoom — AGREE.** Fixed: text +
   underline fade out during the closed hold, before the zoom starts.
5. **Crossfade into the deck is muddy — AGREE.** Fixed: no crossfade.
   Deck mounted beneath from t = 0; only the intro fades, 300 ms.
6. **Stick tip cut at the frame edge (open frame) — AGREE.** Fixed in
   the rebuilt static image: stick = board width (760 px), 30°, tip at
   ~(871, 419) — fully inside with margin on all sides. Never let the
   stick touch a frame edge.
7. **M size/placement in the open frame is good — DISAGREE IN PART.**
   Placement (centred on the board) is right, but the mockup's M is too
   small (~300 px wide — lost in the board) and carries a faint square
   halo from a non-transparent crop. Kept the static image's 500 px M
   with the brightness-alpha crop (no square edge) instead.
8. **Timing target (~1.6–1.8 s) — SUPERSEDED by the 2.0 s retime
   (2026-11-08).** Open hold 0.50 + clap 0.20 + closed hold 0.10 +
   zoom 0.90 + reveal 0.30 = 2.00 s exactly.
9. **Keep the amber underline; pure black background — AGREE.**
   Underline adopted into the static image (140 × 9 px, `#F5A623`) and
   fades with the text. Background is pure black `#000000` throughout —
   the mockup's dark-navy `#0B1017` is rejected (it would flash against
   the native splash).
10. **(Designer addition) The closed frame shows TWO striped bands.**
    In the mockup the closed stick floats above the board's strip with
    a gap, overhangs the board on both sides, and leaves a black wedge
    at the right. Fixed: strip height = stick thickness (86 px), same
    x-range, same stripe pitch/phase — the closed stick covers the
    strip exactly.
11. **(Designer addition) Mockup's open stick is longer than the board
    and its left end dips below the board's top edge.** Fixed by the
    same rule: stick length = board width, hinge at the top-left corner,
    no overhang.
12. **(Designer addition) The mockup has no open hold** — the clap
    starts at t = 0, so the open board never registers. Fixed: 500 ms
    open hold.

## Final ordered improvement list (what changes, highest first)
1. Cut the dead tail — intro unmounts at the reveal (2.0 s); nothing after it.
2. Snap the clap — 200 ms accelerating close, hard stop, 100 ms closed
   hold, 1.5% board punch at impact.
3. Anchor the zoom on the M — M 3.5× vs board 1.5×, both about the M
   centre; the M, not the stripes, fills the screen.
4. Fade the text + underline out during the closed hold, before the
   zoom — they never scale, never crop.
5. No crossfade over the deck — deck beneath from t = 0, intro fades
   out alone in 300 ms.
6. Closed stick lands exactly on the strip (86 px strip = stick
   thickness, same pitch/phase) — one band, not two.
7. Stick fully inside the frame — length = board width, 30° open, tip
   at ~(871, 419); no overhang, no clipped tip.
8. Pure black `#000000` intro background (mockup's navy rejected).
9. Keep the amber underline + rivets + stripes + board weight from the
   mockup; keep the larger 500 px M from the static image (mockup's
   small M + square halo rejected).
10. Add the 500 ms open hold so the board registers before it claps.

## Wiring (Dev-1's job — not done here)
- `app.json` splash key is unchanged and already points at this file:
  `{"backgroundColor": "#000000", "image": "./assets/splash.png", "resizeMode": "contain"}`.
  Do not change `app.json`, `package.json`, or the icon file.
- Add the intro component + `expo-splash-screen` hide logic (hide once
  the intro has mounted and frame 1 is on screen). No build was started
  by the designer.
- Build method used for v2: PIL script `/tmp/build_splash_clapper_v2.py`
  (board + strip + masked stick stripes + icon-crop M + rivets + text +
  underline). Re-run it (not a redraw) for any future re-export.

## Side note (not splash scope, flagged, not fixed here)
The deck shots in the mockup (frames f_05–f_08, from
`app-store-screenshots/03-watchlist-deck.jpg`) show the deck's own hint
overlays colliding with the UI — "Tap to switch views" overlaps the
Language/Year filter pills, and the "Seen" / "Trash" / "Next" labels sit
on top of the movie card. That is a deck-UI issue for a separate task,
not part of this splash work.
