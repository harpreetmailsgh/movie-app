# Movie Recommender (React Native + Expo)

Your personal movie-recommendation app, built with Expo so it runs on your
iPhone with **no Mac and no Xcode** — just the free **Expo Go** app.

## Run it on your iPhone

1. Install **Expo Go** from the App Store.
2. On a computer with Node.js, run in this folder:
   ```sh
   npm install
   npx expo start --tunnel
   ```
3. Scan the QR code with your iPhone camera → opens in Expo Go.

(`--tunnel` lets the phone reach the dev server over the internet; on the
same Wi-Fi you can drop it.)

## What it does

- **Discover** — your Inbox as a Tinder-style swipe deck on a dark
  background. Each card shows the poster, title, year, genre chips and a
  short description. First launch shows a tutorial overlay.
  - Swipe **right** → Watch List (keep)
  - Swipe **left** → Trash (remove)
  - Swipe **up** → Seen (already seen)
  - Swipe **down** → Skip (stays in the Inbox for later)
- **＋ Add from a reel** — copy a Facebook reel's link (Share → Copy link),
  paste it here; the app reads the reel's public caption and identifies the
  movie via TMDB. You can also add by title search.
- **Watch List / Seen / Trash** — plain lists; trash restores or deletes forever.
- **Settings** — paste your free TMDB API key (themoviedb.org → Settings →
  API). Saving it also fills in missing posters/descriptions for your list.

Your list is stored on the phone (AsyncStorage) — private to you.

## Notes

- Only **public** reels can be read automatically. Private/friends-only
  reels must be added by title.
- Expo Go includes every native module this app uses
  (router, linear gradient, async storage, clipboard), so no dev build
  is needed.
- For a permanent install (own app icon, no dev server), use EAS Build:
  `npx eas-cli@latest build` — builds in the cloud, no Mac required.
  An Apple Developer account ($99/yr) is needed for iOS distribution.
