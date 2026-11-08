// Privacy policy content — the single source for the first-launch sheet
// summary and the full policy screen (src/app/privacy.tsx). The standalone
// web page (docs/privacy-policy.html in the repo) carries the same text for
// the App Store Connect privacy-policy URL. Keep all three in step.

export const PRIVACY_LAST_UPDATED = 'November 7, 2026';

export interface PrivacySection {
  title: string;
  body: string;
}

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: 'What Movie Deck saves',
    body: 'The movies and shows you add — title, year, whether each one is a movie or a TV show, genres, description, poster, whether it is on your Watchlist or in Seen, your notes, the video link it came from, and the date you added it. They are stored on your phone, and a copy is also sent to our servers under a random anonymous ID, a short time after you make a change. That copy lets our servers add movies found while the app is closed, and lets your list follow you if you sign in on another device. Your preferences stay on your phone only.',
  },
  {
    title: 'Where it is stored',
    body: 'On your phone, and backed up to our cloud database (Supabase) under a random anonymous identifier, so your list can be restored and synced. Movie information, posters, and ratings come from TMDB and Cinemeta; no personal data is sent to TMDB.',
  },
  {
    title: 'Signing in is optional',
    body: 'The app works without an account. It creates an anonymous account automatically — no name, no email — just so the backup has something to attach to. Sign in with Apple or Google is optional and only links that backup to you, so you can restore your list on a new phone. We collect no email address while you use the app anonymously. If you sign in with Google, we store the email address from your Google account; if you sign in with Apple, you can choose to hide your email, and we do not store your name.',
  },
  {
    title: 'Links you paste',
    body: 'When you share a reel or video link to Movie Deck, the link is sent to our servers to identify the movie. The link stays on our servers after processing. We do not store the video content itself.',
  },
  {
    title: 'What we don’t do',
    body: 'We don’t sell your personal information or share your watchlist data. The app has no ads and does no advertising or cross-app tracking. As of this version it also collects no usage analytics (we don’t record how often you open the app or what you tap), and sends no marketing emails. It does send push notifications: your device’s push token is used to tell you when your videos finish processing, and for a weekly Trending notification when new popular titles appear — tapping it opens the Trending tab. You can turn notifications off any time in your device settings. We collect no location, photos, or contacts. If any of that ever changes, this policy will be updated first and the app will ask where the law or Apple requires it.',
  },
  {
    title: 'Your choices',
    body: 'You can remove any movie, clear your Watchlist or Seen list in Settings, and sign out at any time. Deleting a movie in the app also removes it from your watchlist on our servers. Deleting the app removes the copy on your phone but leaves the server copy behind — if you never signed in, it is no longer linked to you, since the anonymous ID that connected it to your device is gone with the app. To have your cloud backup and account data deleted, send a request through Send feedback in Settings and we will delete it.',
  },
  {
    title: 'Children',
    body: 'Movie Deck is not directed at children under 13, and we do not knowingly collect personal information from them.',
  },
  {
    title: 'Changes to this policy',
    body: 'If this policy changes, the new version will appear here and in the app with a new date above. Continuing to use the app after a change means the updated policy applies.',
  },
  {
    title: 'Contact',
    body: 'Questions about your privacy: use Send feedback in Settings and we’ll get back to you.',
  },
];
