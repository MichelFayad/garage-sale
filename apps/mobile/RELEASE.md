# Mobile release — Android APK (P13)

The app code, EAS config, and push stack are in the repo. The steps below are the
**manual ops** that must run on your machine / accounts — they can't be done from CI
or this repo. Target for now: a **standalone Android APK** (no Play submission, no
TestFlight).

## Prerequisites

- An [Expo account](https://expo.dev) (free).
- `npm i -g eas-cli` (or `npx eas-cli@latest …`).
- The API deployed somewhere the phone can reach (not `localhost`). You'll point the
  build at it via `EXPO_PUBLIC_API_URL`.

## One-time setup

```bash
cd apps/mobile
eas login
eas init                 # creates the EAS project and prints a projectId
```

`eas init` writes the project id into `app.json` → `expo.extra.eas.projectId`.
**Commit that change** — push registration (`registerForPushNotifications`) returns
`null` until it's set, so notifications stay off without it.

## Build the APK

Set the public env the build bakes in (deployed API + Stripe publishable key):

```bash
# In the EAS dashboard (Project → Environment variables) or via eas.json "env":
EXPO_PUBLIC_API_URL=https://<your-deployed-api>/api
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_or_test_...
# (plus the EXPO_PUBLIC_*_CLIENT_ID OAuth vars if social login is wanted)
```

Then:

```bash
eas build --platform android --profile preview
```

`preview` and `production` both produce an **APK** (see `eas.json` → `buildType: apk`).
Use `preview` for sideload/internal sharing. When the cloud build finishes, EAS prints a
URL to download the `.apk`; install it on the device (enable "install unknown apps").

The first Android build triggers EAS-managed credentials — accept the prompts to let EAS
generate the keystore (or supply your own).

## Push notifications (Android)

- Standalone Android push needs **FCM** credentials. Run `eas credentials` →
  Android → set up the FCM V1 service account key (from a Firebase project on the same
  `com.garagesale.app` package). Without it, the build installs fine but pushes won't
  deliver.
- The backend already sends via the Expo Push API (`packages/api/src/push.ts`), wired to
  every trade/message email trigger. Test with the
  [Expo push tool](https://expo.dev/notifications) using a token from a real device.

## Notes / not done here

- **iOS / TestFlight:** intentionally skipped for now.
- **App icon & splash:** using Expo defaults — drop branded `assets/` art and reference
  it from `app.json` before any public release.
- **Camera/photo upload:** still backend-blocked (no blob-storage upload endpoint; photos
  are URLs on web and mobile). Build that endpoint to enable `expo-image-picker`.
- **Play Store submission:** out of scope for the APK target; add a `submit` profile +
  service-account key to `eas.json` when you want `eas submit`.
