# Garage Sale — project guide

US peer-to-peer local item-swap platform. Users post items they **Have** and items they **Want**, propose trades (single or bundle), message, and confirm completed swaps. Monetised by a flat **per-post fee** charged when a listing is published.

This file is the in-repo source of truth: what we're building, how it's structured, how to work in it, and where each phase stands.

---

## Key product decisions (override the scope doc)

The baseline spec is `GarageSale_Project_Scope_v2.1.docx`. These planning decisions **supersede** it:

- **Pricing = flat fee per published listing (per post), NOT on trade completion.** Proposing a trade is free. Fee is **non-refundable**. Editing a live (`ACTIVE`/`LOCKED`) listing is free; a fresh publish (new listing, or relisting a removed/traded item) charges again.
- **4 products, not 3:** Marketing site (web), Admin Portal (web), User Portal (web), **Mobile app iOS+Android** (Flutter/Dart, mirrors the full User Portal).
- **Auth:** email/password + Google + Apple + Facebook OAuth, account-linking by verified email. Admin staff are email/password only. OAuth is brokered to **our own JWT** (arctic + a shared `oauth.exchange` procedure) — **not** Auth.js sessions.
- **Untrusted flag:** after one party confirms a trade, the other has a window (`PlatformSetting.confirmationWindowDays`, default 7 days) to confirm. Miss it ⇒ the non-confirmer is flagged `UNTRUSTED` by a cron sweep. Trade completion drives ratings + trust only — **no fee** there.

Full approved plan (external): `~/.claude/plans/generic-enchanting-snail.md`.

---

## Stack & architecture

Turborepo + pnpm workspaces. TypeScript everywhere. Web and mobile share typed packages; business logic is written once in `packages/*` and consumed by both.

```
apps/
  web/      Next.js 15 (App Router). Route groups: (marketing) (user)/app (admin).
            Edge middleware for role routing + session refresh. Tailwind v4.
  mobile/   Flutter/Dart. Riverpod + go_router, flutter_secure_storage JWT.
            Consumes packages/api via a REST facade (apps/web/src/app/api/mobile/*),
            since Dart can't use tRPC's TS-inferred client. Dart package name is
            `garage_sale_mobile` (pubspec.yaml), NOT the `mobile` dir name.
packages/
  core/     Pure domain logic + constants (fee, trust, listing helpers). Unit-tested.
  db/       Prisma schema + singleton client + seed. 20 models, 12 enums.
  auth/     JWT (jose, edge-safe), password (bcryptjs), roles, opaque tokens.
  api/      tRPC v11 router (the shared typed contract) + Stripe/email/trust services.
```

- **API:** tRPC v11, `superjson` transformer. Context resolves the principal from a JWT: `Authorization: Bearer` (mobile) or the `gs_session` cookie (web). Procedures: `publicProcedure`, `protectedProcedure` (active principal), `adminProcedure`.
- **Auth tokens:** access (15m, `gs_session` cookie / bearer) + refresh (30d, `gs_refresh` cookie). Web middleware auto-refreshes access from the refresh cookie. Mobile refreshes on boot.
- **DB:** PostgreSQL via Prisma. No local Postgres in dev — migrations are hand-written SQL (see gotchas).
- **Payments:** Stripe. Card-on-file via SetupIntent; per-post charge via off_session PaymentIntent. **Stripe webhooks are the source of truth** for payment/listing state.

---

## Common commands

Run from the repo root (pnpm workspaces + Turbo).

```bash
pnpm install                         # install (see build-scripts gotcha below)
pnpm -r typecheck                    # tsc --noEmit across all workspaces
pnpm -r lint                         # eslint / next lint
pnpm -r test                         # vitest (currently packages/core only)
pnpm format                          # prettier --write .
pnpm format:check                    # prettier --check .

# Prisma (run the local binary directly — see gotcha)
./node_modules/.bin/prisma generate --schema packages/db/prisma/schema.prisma

# Apps
pnpm --filter @garage-sale/web dev   # Next dev server

# Mobile (Flutter — run from apps/mobile, NOT via pnpm; it's not a pnpm workspace member)
cd apps/mobile && flutter run          # needs the web API reachable; pass
                                       # --dart-define=API_BASE_URL=... (10.0.2.2 for Android emulator)
cd apps/mobile && flutter analyze && flutter test   # mobile gate (separate from the pnpm gate below)
```

**Pre-commit gate (run before every commit):** `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm format:check`. Prettier often reformats new files — run `pnpm format` first, then re-check.

CI (`.github/workflows/ci.yml`) runs typecheck + lint + test on **Node 22** (pnpm 11.8 requires ≥22.13; `.nvmrc` = 22). Commit per stage so progress isn't lost.

---

## Phase plan & status

13 phases, P0–P13. Status as of this writing:

| Phase | Scope                                                                                       | Status  |
| ----- | ------------------------------------------------------------------------------------------- | ------- |
| P0    | Monorepo scaffold (Turbo, pnpm, Next, Expo, packages, CI)                                   | ✅ done |
| P1    | Data model (Prisma schema, seed, init migration)                                            | ✅ done |
| P2    | Auth core (JWT, tRPC, email verify, password reset, OAuth, mobile auth)                     | ✅ done |
| P3    | Product shells (web auth forms + portals, mobile tab shell, SEO)                            | ✅ done |
| P4    | Stripe card-on-file + per-post charge (SetupIntent, webhook, publish charge)                | ✅ done |
| P5    | Listings (Have/Want CRUD, photos, browse w/ filters + radius, watchlist)                    | ✅ done |
| P6    | Trade proposals (single/bundle, accept/decline/counter, lock) + messaging + report          | ✅ done |
| P7    | Confirmation & trust (dual-confirm → COMPLETED, ratings, untrusted cron sweep)              | ✅ done |
| P8    | Email notifications (Resend provider + all trade/trust triggers wired)                      | ✅ done |
| P9    | Admin features (user/listing/trade mgmt, fee config, categories, reports, audit)            | ✅ done |
| P10   | Marketing polish (CMS, SEO, WCAG 2.1 AA, analytics, perf, legal)                            | ✅ done |
| P11   | Hardening (tests, security review, rate limiting, webhook sig, perf/scale)                  | ✅ done |
| P12   | Mobile app — full User Portal (card-on-file PaymentSheet, listings, trades, camera upload)  | ✅ done |
| P13   | Mobile release (EAS Android APK config, push notifications) — code done; cloud build is ops | ✅ done |

> **API-first:** P4–P9 build features against `packages/api`; web + mobile both consume them. Admin (P9) lives under `appRouter.admin` (sub-routers users/listings/trades/fee/categories/reports/flags/settings/admins/audit), gated by `adminProcedure` + `requireTier` role tiers (SUPPORT < OPERATIONS < SUPER). Every admin mutation writes an `AuditLog` row via `audit()`. CSV export is a Node route handler (`/api/admin/export`), not tRPC.

### Known deferred items / open loose ends

- **Block** ✅ done: `Block` model + migration; `blocks` router (list/status/block/unblock) + `assertNotBlocked` wired into `trades.propose/counter/sendMessage` (mutual). Web: thread block button + `/app/blocks` page. Mobile UI added P12 (trade-thread block/unblock + `blocks` screen). Listing visibility intentionally unaffected.
- **Photo upload:** listings take photo **URLs** only on **both web and mobile** — there is no blob storage or upload endpoint, so **camera/library upload is backend-blocked**, not a mobile gap. Add a blob-storage upload procedure (and an upload widget on web + `image_picker` on mobile) as its own follow-up before camera upload.
- **Mobile app = Flutter/Dart (`apps/mobile`), migrated from the original RN/Expo build (F0–F5, complete).** The RN/Expo app was fully deleted and `apps/mobile_flutter` renamed to `apps/mobile` at F5 cutover. Design spec: `docs/superpowers/specs/2026-07-13-flutter-mobile-migration-design.md`; per-phase plans under `docs/superpowers/plans/2026-07-1*-flutter-*.md`. Flutter 3.44.6/Dart 3.12.2; Riverpod + go_router; `flutter_secure_storage` JWT; consumes `packages/api` via the REST facade under `apps/web/src/app/api/mobile/*` (Dart can't use tRPC's TS client). Full User-Portal parity: auth (F0), listings/browse/watchlist (F1), trades/messaging/blocks/report (F2), Stripe card-on-file + publish fee via `flutter_stripe` native PaymentSheet (F3), FCM push via `firebase_messaging` (F4). Not a pnpm/Turbo workspace member (no `package.json`) — run `flutter` directly from `apps/mobile`; it's outside the `pnpm -r` gate and outside CI (see the CI note below). ~132 widget/unit tests via `flutter test`.
- **Mobile release + push are ops-gated** (same category as before, now Flutter-flavoured): **Push** = FCM. `PushToken` model + hand-migration `20260622160000_add_push_token` (opaque token, provider-agnostic); `packages/api/src/push.ts` `sendPush` now uses `firebase-admin` `sendEachForMulticast` (dead-token prune on `messaging/registration-token-not-registered`, failures swallowed like email) + `firebase.ts` lazy Admin-SDK singleton from `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`; `push` router (register/unregister) unchanged; `sendPush` still rides the trades `notify()` helper. Flutter: `firebase_core`/`firebase_messaging`, `lib/push/*` (`PushRegistrationController` registers on auth transition via `main.dart`'s `ref.listen`, unregisters in `AuthController.logout()` before clearing tokens). **Manual ops (you, not CI):** provision a real Firebase project + `flutterfire configure` → `google-services.json`/`GoogleService-Info.plist` (none committed — the app starts fine without them, push just no-ops); set the `FIREBASE_*` service-account env vars server-side; build a standalone Android APK (`flutter build apk`); foreground notification banners (`flutter_local_notifications`) not built; app icon/splash still Flutter defaults; no emulator/device smoke test has been run in-repo.
- **Post-cutover follow-ups (F5-flagged, not done):** (1) CI no longer runs any mobile checks — the old RN app's `lint`/`typecheck` ran via Turbo; Flutter has never been in CI. Add a `flutter analyze`/`flutter test` GitHub Actions job (e.g. `subosito/flutter-action`) so mobile regressions get caught. (2) Confirm no stale Expo-format rows survive in `PushToken` (the old RN app registered Expo tokens, which `sendEachForMulticast` would reject and never prune) — a one-time cleanup or a `provider` discriminator would harden this; low practical risk since the RN app was never deployed.
- **Email:** Resend wired (P8); falls back to dev-logging without `RESEND_API_KEY`. `ACCOUNT_SUSPENDED`/`ACCOUNT_BANNED` emails now fire from `admin.users.setAccountStatus` (P9).
- **Cron scheduler** ✅ done: Vercel Cron (`apps/web/vercel.json`, daily) hits `/api/cron/untrusted` via GET (auto-sends `CRON_SECRET` bearer); GH Action (`cron-untrusted.yml`) is a 30-min-later POST fallback. Route serves both GET + POST. Needs repo/Vercel secrets `CRON_SECRET` (+ `APP_URL` for the Action) at deploy.
- **Tests (P11)** ✅ baseline: `packages/core` pure fns + new `packages/api` router/service tests run on a **mocked Prisma** (no DB) — auth guard + rate-limit paths via the tRPC caller, `publishListing` money-path guards. Covers business rules, not SQL/Prisma queries or e2e; real integration-against-Postgres + e2e remain a deploy-time follow-up.
- **Admin export:** CSV only (`/api/admin/export`). PDF export from the scope doc is deferred (CSV covers the reporting need; revisit in P10/P11 if a formatted report is required).
- **Admin RBAC** ✅ done: tier checks are server-side (`requireTier`) **and** the admin UI now hides controls/nav/pages above the caller's tier via `core/roles meetsTier` + `AdminRoleProvider`/`useCan` (cosmetic; server still enforces).
- **CMS (P10)** ✅ done: DB-backed `ContentPage` (DRAFT/PUBLISHED, slug-unique, Markdown body) + migration. Public `content` router (`bySlug`/`published`); `admin.content` CRUD (OPERATIONS) with audit. Web: server tRPC caller (`lib/server.ts`), safe Markdown renderer (`lib/markdown.tsx`, React nodes — no `dangerouslySetInnerHTML`), dynamic `/(marketing)/[slug]`, footer + sitemap list published pages, admin Content editor. Terms/Privacy/Cookies seeded PUBLISHED (legal templates — counsel review before prod).
- **SEO (P10)** ✅ done: `lib/site.ts` constants; root metadata (metadataBase/OG/Twitter/robots/keywords/icons); dynamic `opengraph-image.tsx` (edge) feeds OG+Twitter; home JSON-LD (Organization+WebSite); canonicals; PWA manifest + favicon.
- **Analytics (P10)** ✅ done: cookieless Plausible-compatible script loads only when `NEXT_PUBLIC_ANALYTICS_DOMAIN` set (no-op otherwise); `lib/analytics.ts` `track()` (no PII); Signup event on register.
- **a11y (P10)** ✅ done: skip-links + focusable `<main id="main-content">` in all 3 shells, global `:focus-visible`, labelled nav landmarks, `role=alert/status` form messages. Full audit (contrast sweep, ARIA on all interactive widgets) still TBD in P11.
- **Perf (P10)** ✅ done (baseline): self-hosted `next/font` Inter (display:swap, CSS var) removes external font fetch + CLS; viewport/themeColor. Deeper perf/scale (caching, ISR, the headers()-forced-dynamic marketing render) is P11.
- **Rate limiting (P11)** ✅ done: pluggable `RateLimiter` in `core/ratelimit.ts` (pure fixed-window decision, unit-tested) + in-memory default; presets `login`/`register`/`emailLink`. `api/ratelimit.ts` `enforceRateLimit(name, ip)` throws `TOO_MANY_REQUESTS`, wired into auth register/login/adminLogin/requestPasswordReset/resendVerification. Context resolves client IP from `X-Forwarded-For`/`X-Real-IP`. **In-memory store is per-process** — swap a Redis-backed `RateLimiter` at deploy for cross-instance limits.
- **Security headers (P11)** ✅ done: `next.config.mjs headers()` sets CSP (allow-lists Stripe.js/frames/API + analytics origin; keeps `unsafe-inline` for unnonced App-Router inline/JSON-LD scripts — nonce tightening is a follow-up), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS. Cron auth uses constant-time compare (`node:crypto timingSafeEqual`). Stripe webhook handlers already idempotent per fee-charge/entity (status guards) — no event-dedup table.
- **Perf/ISR (P11)** ✅ done: header-free `publicServerApi()` + `unstable_cache`d `getPublishedPages`/`getPublishedPage` (tag `content`, plus `content:<slug>` per page) so the marketing layout, `[slug]` CMS pages, and sitemap render **static + ISR (`revalidate = 3600`)** instead of forced-dynamic. On-demand purge ✅ done: `admin/content/actions.ts` server action `revalidateContentCache()` calls `revalidateTag` and is invoked from `ContentClient.tsx` after every create/update/publish-toggle/delete, so admin edits show up immediately instead of waiting up to an hour.
- **a11y (P11)** ✅ baseline sweep: muted `text-gray-400` → `text-gray-500` (≥4.5:1, WCAG 1.4.3) across admin/trade/marketing surfaces; photo-remove icon button got an `aria-label` (glyph `aria-hidden`). Decorative listing thumbnails keep empty `alt`. A full contrast/ARIA audit of every widget is still not automated.

---

## Environment

Copy `.env.example` → `.env`. Groups: Database, Auth (JWT secrets + TTLs), OAuth (Google/Apple/Facebook), Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, publishable keys), Cron (`CRON_SECRET`), Email (provider + Resend key), App/Mobile URLs, Analytics (`NEXT_PUBLIC_ANALYTICS_DOMAIN`/`_SRC`, optional — cookieless, disabled when blank).

---

## Gotchas (read before you trip on them)

- **Prisma generate:** run `./node_modules/.bin/prisma generate --schema packages/db/prisma/schema.prisma`. The pnpm-filter path can fail on a deps-status check when build scripts are ignored.
- **pnpm 11.8 build scripts:** pnpm 11.8 does **not** honour `onlyBuiltDependencies` on a fresh checkout — the 7 build-script deps get skipped and `pnpm install --frozen-lockfile` exits 1 (`ERR_PNPM_IGNORED_BUILDS`), failing CI. Fix = `dangerouslyAllowAllBuilds: true` in `pnpm-workspace.yaml` (allowlist kept as docs). The `pnpm` field in `package.json` is no longer read by pnpm 11.8.
- **New migrations:** no local Postgres → hand-write SQL matching the init migration's style (CREATE TYPE/TABLE/INDEX + ADD CONSTRAINT FK), then run `prisma generate`.
- **@types/node** is required in `auth`/`db`/`api` for typecheck. (The mobile app is Flutter/Dart now — no TS typecheck, not a pnpm workspace member.)
- **tRPC client type portability (TS2742):** router **output** types must not reference named interfaces declared in a non-index-exported api file — `createTRPCClient<AppRouter>` infer fails ("cannot be named without a reference to .../src/<file>"). Return inline/structural types (drop the interface; use `as const` for literal unions like `status: 'PENDING'`).
- **Don't import Prisma enums into the browser bundle** (pulls the Prisma client). Hardcode string-literal option arrays in client components and cast at the tRPC call.
- **Web ESLint (`next lint`)** does NOT register `@next/next/no-img-element` or `react-hooks/exhaustive-deps` — an `eslint-disable-next-line` for those rules **errors** ("Definition for rule not found"). Plain `<img>` is fine. Also: `a ? b() : c()` for side effects trips `@typescript-eslint/no-unused-expressions` — use `if/else`.
- **`eslint.config.mjs` is protected** by a config-protection hook (edits blocked) — fix the source/scripts instead.
- **Login/logout must be route handlers**, not tRPC procedures: cookies must be set on the HTTP response, and tRPC context is read-only. See `apps/web/src/app/api/auth/*` and `lib/session.ts`.
- **Stripe webhook needs the raw body** — handler is Node runtime and verifies the signature against `req.text()`.

---

## Conventions

- Match the surrounding code's style, comment density, and naming. Files carry a short top comment explaining their role.
- Commit per stage with a `Pn(x): …` subject; keep the pre-commit gate green.
- Keep shared logic in `packages/*` so web and mobile reuse it; don't duplicate business rules in app code.
