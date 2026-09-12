# ORION iOS shell

Free App Store app. Same Daily Patrol as surviveorion.com. No IAP.

## Stack pick

**Capacitor**, not Expo. Shog.io used EAS for a different bundle (`io.shog.app`).
Orion is a Vite + Canvas game. Capacitor wraps the existing `dist/` bundle.
Expo as a remote WebView of surviveorion.com would fail Guideline 4.2.

- Bundle ID: `com.surviveorion.app` (do not reuse `io.shog.app`)
- App name (home screen): ORION
- Store name: ORION: Survive the Swarm
- Subtitle: Dodge the swarm. Daily patrol.
- `webDir`: `dist/` (bundled). Do **not** set `server.url`.

## Auth

Player API is Bearer in `localStorage` (`orion.session`). Guest lock is
`orion.guestSecret`. The app origin is `capacitor://localhost`.

- Native `/api` calls go to `https://surviveorion.com`
- Server CORS allowlists that origin only (plus Android `https://localhost` later)
- Rate limits and the 3-attempt daily budget are unchanged
- Fresh localStorage: a web pilot looks like a new guest. Sign in is on the
  lobby badge. No automatic identity migration.

Google Sign-In (GIS button) often fails inside WKWebView. Callsign + password
is the recovery path. Adding `capacitor://localhost` to the Google OAuth
JavaScript origins is a later Connect/Google Cloud step, not a server auth relax.

## Mutator updates

Bundled JS can desync from live web when `mutators.ts` ships. Update plan:
ship an App Store release (build, `cap sync`, TestFlight, submit). Do not
load remote JS to "stay current."

## Commands

```bash
npm run build
npx cap sync ios
npx cap open ios
```

Simulator does not vibrate. Haptics need a device.

## Lucas only (stop here)

Certificates, provisioning, App Store Connect record, tax/banking, privacy
nutrition label, review notes, demo account: Lucas. This tree does not enrol
or agree to terms.
