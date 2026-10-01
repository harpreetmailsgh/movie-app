// Privacy policy content — the single source for the first-launch sheet
// summary and the full policy screen (src/app/privacy.tsx). The standalone
// web page (docs/privacy.html in the repo) carries the same text for the
// App Store Connect privacy-policy URL. Keep all three in step.

export const PRIVACY_LAST_UPDATED = 'October 1, 2026';

export interface PrivacySection {
  title: string;
  body: string;
}

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: 'What Movie Deck saves',
    body: 'The movies and shows you add — titles, posters, your notes, and whether each one is on your Watchlist or in Seen — plus your in-app settings. If you send feedback from Settings, we save that message too.',
  },
  {
    title: 'Where it is stored',
    body: 'On your phone, and backed up to our cloud database (Supabase) under your account ID, so your list can be restored and synced. Movie information, posters, and ratings come from TMDB and Cinemeta.',
  },
  {
    title: 'Signing in is optional',
    body: 'The app works without an account. It creates an anonymous account automatically — no name, no email — just so the backup has something to attach to. Sign in with Apple is optional and only links that backup to you, so you can restore your list on a new phone. If you use it, Apple may share your name or a private relay email address with us; we use it only for your account.',
  },
  {
    title: 'Links you paste',
    body: 'When you paste a reel or video link, the app fetches that link’s public page to identify the movie, and saves the link with the movie. The platform that hosts the link (such as Instagram, Facebook, YouTube, or TikTok) sees that fetch the way it would see a browser visit, and its own privacy policy applies there.',
  },
  {
    title: 'What we don’t do',
    body: 'We don’t sell your personal information. The app has no ads and does no advertising or cross-app tracking. As of this version it also collects no usage analytics (we don’t record how often you open the app or what you tap), sends no marketing emails, and sends no push notifications. If any of that ever changes, this policy will be updated first and the app will ask where the law or Apple requires it.',
  },
  {
    title: 'Your choices',
    body: 'You can remove any movie, clear your Watchlist or Seen list in Settings, and sign out at any time. Deleting the app removes the copy on your phone. To have your cloud backup and account data deleted, send a request through Send feedback in Settings and we will delete it.',
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
