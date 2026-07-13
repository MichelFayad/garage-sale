# Flutter mobile migration — design

**Date:** 2026-07-13
**Status:** Approved, pending implementation plan

## Context

`apps/mobile` is a fully-built Expo/React Native app (P12/P13, done — see `CLAUDE.md`): custom nav stack, full User Portal parity with web, Stripe PaymentSheet card-on-file, Expo push notifications, no photo upload (backend-blocked, URL-only listings). The app is not deployed — local/dev only, no live users, no App Store/Play submission.

Decision: rewrite the mobile app in Flutter/Dart. Motivation is team skill fit (team knows Dart better than RN/TS). Because there are no live users, this is a big-bang rewrite, not a staged/strangler migration.

## Goal

Full Flutter rewrite of the mobile app, at feature parity with the current RN app's shipped scope, replacing `apps/mobile` once done. Web app, admin portal, and `packages/*` business logic are unaffected except for the new REST facade (additive) and the push backend swap (FCM instead of Expo Push).

## Repo layout

- New `apps/mobile_flutter/` — standard Flutter project. Not a pnpm workspace member; Turborepo does not manage it (no `turbo.json` pipeline entry needed unless useful later).
- `apps/mobile` (RN) stays untouched and runnable throughout, as a parity reference.
- At parity/cutover: delete `apps/mobile`, rename `apps/mobile_flutter` → `apps/mobile`, update `CLAUDE.md` and any RN-specific docs (`apps/mobile/RELEASE.md` gets a Flutter equivalent).

## Backend bridge — REST facade

`packages/api` remains tRPC-native; the web app is untouched. New JSON REST route handlers (e.g. `apps/web/src/app/api/mobile/*`) wrap existing tRPC procedures — thin adapters calling the same `packages/api` routers/services server-side. No business-logic duplication; the facade is routing/serialization only.

- Auth scheme: unchanged bearer JWT (`Authorization: Bearer <token>`), same as current mobile.
- Dart side: hand-written `freezed`/`json_serializable` models per REST response shape, plus a typed `ApiClient` per resource (auth, listings, trades, watchlist, blocks, payment).
- Each REST endpoint covers exactly the tRPC procedures the mobile app already calls (see Feature parity checklist) — no need to expose the entire `appRouter` (admin sub-routers are out of scope; mobile never called them).

## Auth

Same JWT access (15m) / refresh (30d) pair. Storage: `flutter_secure_storage` (parallels `expo-secure-store`). Refresh-on-boot pattern carries over from mobile's existing behavior.

OAuth: `google_sign_in`, `sign_in_with_apple`, `flutter_facebook_auth` obtain provider tokens client-side; Flutter POSTs to the REST-wrapped `oauth.exchange` procedure for our own JWT. Same broker pattern as today (arctic + `oauth.exchange`) — not Auth.js, not provider-native sessions.

## Push notifications — Firebase Cloud Messaging

Current: `packages/api/src/push.ts` sends via Expo Push API; `PushToken` stores Expo push tokens. Expo tokens don't exist for non-Expo (Flutter) clients.

- Backend: rewrite `push.ts` against FCM HTTP v1 API (Android + iOS via APNs-through-FCM). `PushToken` keeps its shape; token values become FCM registration tokens instead of Expo tokens. Since RN is being fully replaced (no dual-client period post-cutover), no provider-discriminator column is needed — this is a clean swap, not a coexistence requirement.
- `sendPush` call sites (wired into the trades `notify()` helper) are unchanged — same trigger points, different transport underneath.
- Flutter: `firebase_messaging` package + Firebase project setup (google-services.json for Android, APNs key uploaded to Firebase for iOS). This mirrors the EAS/FCM-cert manual-ops step RN had — flagged as an ops task, not code.

## Payments

`flutter_stripe` package. Same server-side flow: SetupIntent for card-on-file, off_session PaymentIntent for the non-refundable per-post publish fee. No `packages/api` Stripe logic changes — only the client SDK differs.

## App architecture

- **State/DI:** Riverpod.
- **Navigation:** `go_router` (standard Flutter pattern; replaces RN's hand-rolled `NavContext`/`routes.ts` stack — no reason to hand-roll again in Flutter).
- **Data layer:** repository-per-resource wrapping the REST `ApiClient`, feeding Riverpod providers.

## Feature parity checklist

Everything shipped in RN P12, ported 1:1:

- Home dashboard
- Browse (keyword + category/condition/type filters) — location-radius filter stays omitted (needs device geolocation; was omitted in RN too, separate scope if ever wanted)
- Listing detail (photo carousel, watchlist toggle, propose)
- My Listings (CRUD, mark-traded/remove, Publish)
- Listing create/edit form — **photo URLs only**, no camera/library upload (matches RN; upload is still backend-blocked, tracked as its own follow-up per `CLAUDE.md`, not bundled into this migration)
- Watchlist
- Trades list + trade thread (accept/decline/counter/cancel/confirm/star-rate, proposal-scoped messaging, report, block)
- Propose/counter offer picker
- Blocked traders screen
- Payment method screen

## Testing

- Dart unit tests: repository/model layer (REST client + serialization).
- Flutter widget tests: core screens (listing form, trade thread, propose flow).
- No e2e requirement beyond current RN baseline (RN has none automated either).

## Build order

Phased, mirrors the project's `Pn` convention:

- **F0** — Flutter scaffold, REST facade skeleton, auth (login/register/OAuth), secure token storage, Riverpod+go_router wiring
- **F1** — Listings: browse, detail, CRUD, watchlist
- **F2** — Trades: propose/thread/messaging/confirm/rate, blocks
- **F3** — Stripe card-on-file + publish fee flow
- **F4** — FCM push (backend `push.ts` rewrite + Flutter client wiring + Firebase project setup)
- **F5** — Parity pass, cutover: delete `apps/mobile` (RN), rename `mobile_flutter` → `mobile`, update docs/CLAUDE.md

## Out of scope

- Photo upload backend (blob storage endpoint) — stays a separate follow-up, matches RN's deferred status.
- Location-radius browse filter — stays omitted, matches RN.
- Admin portal — web-only, untouched.
- Store submission (TestFlight/Play) — RN never did this either (APK-only, ops-gated); same expectation carries to Flutter unless revisited later.
