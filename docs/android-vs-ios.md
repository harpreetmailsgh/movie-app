# Android vs iOS — Movie Deck

What is shared between the two platforms, what differs by platform, and what
is still missing on Android. This document is about configuration and
platform paths only; the app code itself is shared.

## SAME on both platforms

- **All app screens and logic.** Watchlist / Seen / Trending / Library, the
  import worker, the fetch queue, Recent Videos, unverified titles, and the
  TMDB + Gemini + Supabase paths are the same code on both platforms.
- **OTA updates.** Same production channel, same `runtimeVersion` (`1.6.33`
  in `app.json`), same updates URL
  (`https://u.expo.dev/646085b5-a3c9-4755-8dec-963c6f72223c` in `app.json`).
- **Deep-link scheme.** `movierecommender` (`scheme` in `app.json`). The
  import screen handles the `sharedUrl` param the same way on both platforms
  (`src/app/import.tsx`).
- **Push token registration + tap-to-Watchlist.** Push token registration
  and tap routing live in `src/lib/push.ts` and the `PushSetup` component in
  `src/app/_layout.tsx`, shared by both platforms.
- **Frame OCR.** The local `frame-ocr` module ships BOTH implementations:
  `modules/frame-ocr/android/` (`FrameOcrModule.kt`) and
  `modules/frame-ocr/ios/` (`FrameOcrModule.swift`). Loading is guarded by
  `tryRequire` in `src/lib/frameOcr.ts`, so a missing native module degrades
  instead of crashing.
- **Env keys.** The same four `EXPO_PUBLIC_*` keys — `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_TMDB_API_KEY`,
  `EXPO_PUBLIC_GEMINI_API_KEY` — baked via `.env.production` in CI on both
  platforms (see `.github/workflows/eas-build.yml` and
  `.github/workflows/eas-build-android.yml`).
- **App identity and look.** App name Movie Deck, version `1.6.33`, icon,
  splash, dark UI, and EAS project ID
  (`646085b5-a3c9-4755-8dec-963c6f72223c` in `app.json`) are the same.

## DIFFERENT (platform-specific paths)

- **Identity.** `android.package` vs `ios.bundleIdentifier` in `app.json` —
  both are `com.harpreetmails.moviedeck`.
- **Icon.** Android uses an adaptive icon (background / foreground /
  monochrome images in `app.json` `android.adaptiveIcon`); iOS uses a single
  icon (`icon` in `app.json`).
- **Share-IN path (the core feature).** The two platforms take different
  routes and converge on the same import screen (`src/app/import.tsx`,
  `movierecommender://import?sharedUrl=...`):
  - iOS: a native share extension target via the `expo-share-extension`
    plugin in `app.json` (URL + text activation rules, 300pt sheet) that
    opens the deep link.
  - Android: a headless trampoline. `plugins/withAndroidShareTarget.js`
    adds a ShareActivity to the manifest at prebuild and copies
    `plugins/android/ShareActivity.java` into the generated project. It
    handles `ACTION_SEND` with `text/plain`, extracts the first URL with a
    regex, fires `movierecommender://import?sharedUrl=...`, and finishes
    immediately — no UI of its own.
- **Share sheet coverage.** The iOS extension offers for URL + text
  (activation rules in `app.json`). The Android target offers for
  `text/plain` ONLY — images and files will not offer Movie Deck.
- **Sign-in.** Apple sign-in is iOS-ONLY, gated by
  `Platform.OS === 'ios'` in `src/lib/auth.tsx` and
  `src/app/(tabs)/settings.tsx`. Android has the anonymous Supabase session
  only. Google sign-in is deferred on both platforms: the settings screen
  shows a message that it is not set up yet, with no real flow.
- **Push transport.** iOS = APNs via Expo; Android = FCM via Expo. The app
  code handles both; the Android `default` notification channel is created
  in `src/lib/push.ts`.
- **Build / distribution.**
  - iOS preview (`eas.json` `preview` profile): adhoc enterprise
    provisioning — requires Apple credentials and registered device UDIDs.
  - Android preview (`eas.json` `preview` profile): internal distribution
    APK (`android.buildType: "apk"`) — the EAS-managed keystore is
    auto-generated on the first build, and NO device registration is needed,
    so any Android device can install the APK. This is why Test Lab works.
- **Back gesture.** `predictiveBackGestureEnabled: false` on Android
  (explicit in `app.json` `android`).
- **Min OS.** iOS deployment target is 16.4 (explicit in `app.json`
  `ios.deploymentTarget`). Android minSdk is the Expo SDK 57 default — there
  is no override in `app.json`.
- **expo-share-extension plugin.** Its config mods (Podfile / InfoPlist /
  Entitlements / extension target) are iOS-only and are no-ops on Android
  prebuild. The plugin does not break Android builds.

## MISSING ON ANDROID (gaps, not code bugs)

- **FCM credentials NOT configured anywhere.** There is no
  `google-services.json` and no FCM key in `app.json` or `eas.json`, so
  Android push notifications will NOT arrive until FCM credentials are added
  to the Expo project. That is a dashboard setup step for Harpreet / Tara,
  not a code change. The iOS push path uses the APNs config already in
  place.
- **No `android.versionCode` in `app.json`** (defaults to 1). Fine for Test
  Lab fresh installs; it must be managed before any Play Store submission.
- **No Play Store listing / assets yet.** Out of scope for Test Lab.
- **Push on Android is otherwise code-ready.** The channel, token
  registration, and tap routing all exist (`src/lib/push.ts`,
  `src/app/_layout.tsx`); only the FCM credentials are missing.

## Build trigger

Push a commit to master whose message contains `[build-android]`, or run
workflow_dispatch on `eas-build-android.yml` in the GitHub UI. The resulting
APK appears on the Expo dashboard under the movie-app project → Builds.
