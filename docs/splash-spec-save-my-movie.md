# Splash screen spec — "Save My Movie" (for Dev-1)

## Asset (done — already in place, do not regenerate)
- File: `assets/splash.png` — 1152 × 2048 px, PNG, RGB.
- The old clapperboard / red-play-button / "Movie Deck" splash is **deleted and replaced** by this file. Nothing of the old image remains.
- Background: pure black `#000000` across the whole canvas (corners verified `#000000`).

## What the image contains (nothing else)
1. **The amber film-strip "M"** — taken directly from the app icon
   (`assets/icon-filmm.png`, Harpreet's Oct 11 pick). It was **not redrawn**:
   the M was cropped from the icon file and placed on black, so the mark
   matches the app icon exactly (amber/orange folded film strip, black
   sprocket holes, soft amber glow in the centre fold).
   - Size: ~760 px wide × ~662 px tall.
   - Position: centred horizontally (x ≈ 196–956), top y ≈ 610, bottom y ≈ 1272.
2. **"Save My Movie"** — white (`#FFFFFF`), bold clean sans-serif
   (Liberation Sans Bold, 96 px, 3 px letter tracking), one line, centred.
   - Spelled exactly: **Save My Movie**
   - Position: text top y ≈ 1375, baseline ≈ 1470, centred on x = 576.
   - Gap of ~100 px below the bottom of the M.

## Safe-area / scaling notes
- All content sits well inside the safe centre (M + text span roughly
  y 610–1470 of 2048, x 196–956 of 1152), so nothing is cropped by
  `resizeMode: "contain"` on any phone aspect ratio.
- No tagline, no logo lockup, no other text or graphic.

## Wiring (Dev-1's job — not done here)
- `app.json` splash key is unchanged and already points at this file:
  `{"backgroundColor": "#000000", "image": "./assets/splash.png", "resizeMode": "contain"}`.
  Do not change `app.json`, `package.json`, or the icon file.
- Install `expo-splash-screen` and add the hide logic (hide once the app
  is ready). No build was started by the designer.
- Source of the M for any future re-export: `assets/icon-filmm.png`
  (1024 × 1024). Build method used: PIL crop of the icon (x 91–932,
  y 154–886) with a brightness-derived alpha mask so the icon's dark
  background blends into pure black with no visible square edge.
