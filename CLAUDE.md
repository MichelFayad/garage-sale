# Garage Sale — project guide

US peer-to-peer local item-swap platform. Users post items they **Have** and items they **Want**, propose trades (single or bundle), message, and confirm completed swaps. Monetised by a flat **per-post fee** charged when a listing is published.

This file is the in-repo source of truth: what we're building, how it's structured, how to work in it, and where each phase stands.

---

## Key product decisions (override the scope doc)

The baseline spec is `GarageSale_Project_Scope_v2.1.docx`. These planning decisions **supersede** it:

- **Pricing = flat fee per published listing (per post), NOT on trade completion.** Proposing a trade is free. Fee is **non-refundable**. Editing a live (`ACTIVE`/`LOCKED`) listing is free; a fresh publish (new listing, or relisting a removed/traded item) charges again.
- **4 products, not 3:** Marketing site (web), Admin Portal (web), User Portal (web), **Mobile app iOS+Android** (React Native + Expo, mirrors the full User Portal).
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
  mobile/   Expo 52 (React Native). Custom tab shell, expo-secure-store JWT.
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
pnpm --filter @garage-sale/mobile start
```

**Pre-commit gate (run before every commit):** `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm format:check`. Prettier often reformats new files — run `pnpm format` first, then re-check.

CI (`.github/workflows/ci.yml`) runs typecheck + lint + test on **Node 22** (pnpm 11.8 requires ≥22.13; `.nvmrc` = 22). Commit per stage so progress isn't lost.

---

## Phase plan & status

13 phases, P0–P13. Status as of this writing:

| Phase | Scope                                                                                      | Status  |
| ----- | ------------------------------------------------------------------------------------------ | ------- |
| P0    | Monorepo scaffold (Turbo, pnpm, Next, Expo, packages, CI)                                  | ✅ done |
| P1    | Data model (Prisma schema, seed, init migration)                                           | ✅ done |
| P2    | Auth core (JWT, tRPC, email verify, password reset, OAuth, mobile auth)                    | ✅ done |
| P3    | Product shells (web auth forms + portals, mobile tab shell, SEO)                           | ✅ done |
| P4    | Stripe card-on-file + per-post charge (SetupIntent, webhook, publish charge)               | ✅ done |
| P5    | Listings (Have/Want CRUD, photos, browse w/ filters + radius, watchlist)                   | ✅ done |
| P6    | Trade proposals (single/bundle, accept/decline/counter, lock) + messaging + report         | ✅ done |
| P7    | Confirmation & trust (dual-confirm → COMPLETED, ratings, untrusted cron sweep)             | ✅ done |
| P8    | Email notifications (Resend provider + all trade/trust triggers wired)                     | ✅ done |
| P9    | Admin features (user/listing/trade mgmt, fee config, categories, reports, audit)           | ✅ done |
| P10   | Marketing polish (CMS, SEO, WCAG 2.1 AA, analytics, perf, legal)                           | ⬜ next |
| P11   | Hardening (tests, security review, rate limiting, webhook sig, perf/scale)                 | ⬜      |
| P12   | Mobile app — full User Portal (card-on-file PaymentSheet, listings, trades, camera upload) | ⬜      |
| P13   | Mobile release (EAS build/submit, store listings, TestFlight/Play, push)                   | ⬜      |

> **API-first:** P4–P9 build features against `packages/api`; web + mobile both consume them. Admin (P9) lives under `appRouter.admin` (sub-routers users/listings/trades/fee/categories/reports/flags/settings/admins/audit), gated by `adminProcedure` + `requireTier` role tiers (SUPPORT < OPERATIONS < SUPER). Every admin mutation writes an `AuditLog` row via `audit()`. CSV export is a Node route handler (`/api/admin/export`), not tRPC.

### Known deferred items / open loose ends

- **Block** ✅ done: `Block` model + migration; `blocks` router (list/status/block/unblock) + `assertNotBlocked` wired into `trades.propose/counter/sendMessage` (mutual). Web: thread block button + `/app/blocks` page. Mobile UI deferred to P12. Listing visibility intentionally unaffected.
- **Photo upload:** listings take photo **URLs** only; no blob storage / camera upload yet (P12).
- **Email:** Resend wired (P8); falls back to dev-logging without `RESEND_API_KEY`. `ACCOUNT_SUSPENDED`/`ACCOUNT_BANNED` emails now fire from `admin.users.setAccountStatus` (P9).
- **Cron scheduler** ✅ done: Vercel Cron (`apps/web/vercel.json`, daily) hits `/api/cron/untrusted` via GET (auto-sends `CRON_SECRET` bearer); GH Action (`cron-untrusted.yml`) is a 30-min-later POST fallback. Route serves both GET + POST. Needs repo/Vercel secrets `CRON_SECRET` (+ `APP_URL` for the Action) at deploy.
- **Tests:** only `packages/core` pure functions are unit-tested. Router/integration/e2e tests are P11.
- **Admin export:** CSV only (`/api/admin/export`). PDF export from the scope doc is deferred (CSV covers the reporting need; revisit in P10/P11 if a formatted report is required).
- **Admin RBAC** ✅ done: tier checks are server-side (`requireTier`) **and** the admin UI now hides controls/nav/pages above the caller's tier via `core/roles meetsTier` + `AdminRoleProvider`/`useCan` (cosmetic; server still enforces).

---

## Environment

Copy `.env.example` → `.env`. Groups: Database, Auth (JWT secrets + TTLs), OAuth (Google/Apple/Facebook), Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, publishable keys), Cron (`CRON_SECRET`), Email (provider + Resend key), App/Mobile URLs.

---

## Gotchas (read before you trip on them)

- **Prisma generate:** run `./node_modules/.bin/prisma generate --schema packages/db/prisma/schema.prisma`. The pnpm-filter path can fail on a deps-status check when build scripts are ignored.
- **pnpm 11.8 build scripts:** pnpm 11.8 does **not** honour `onlyBuiltDependencies` on a fresh checkout — the 7 build-script deps get skipped and `pnpm install --frozen-lockfile` exits 1 (`ERR_PNPM_IGNORED_BUILDS`), failing CI. Fix = `dangerouslyAllowAllBuilds: true` in `pnpm-workspace.yaml` (allowlist kept as docs). The `pnpm` field in `package.json` is no longer read by pnpm 11.8.
- **New migrations:** no local Postgres → hand-write SQL matching the init migration's style (CREATE TYPE/TABLE/INDEX + ADD CONSTRAINT FK), then run `prisma generate`.
- **@types/node** is required in `auth`/`db`/`api`/`mobile` for typecheck (mobile's isolated Expo tsc pulls api→auth `node:crypto` transitively).
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
