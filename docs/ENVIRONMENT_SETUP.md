# Local environment setup

One-time steps to get `pnpm --filter @garage-sale/web dev` (or any other workspace command) running on a fresh machine. Run everything from the repo root unless noted.

## 1. Prerequisites

- Node 22.13+ (`.nvmrc` pins `22`; CI runs Node 22). A newer Node (e.g. 24) generally works for local dev too.
- pnpm 11.8+ (`corepack enable` or `npm i -g pnpm`).
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — used to run local Postgres. There is no other supported local DB story (see `CLAUDE.md` gotchas: migrations are hand-written SQL, no Prisma-managed dev DB).

## 2. Install dependencies

```bash
pnpm install
```

`pnpm-workspace.yaml` sets `dangerouslyAllowAllBuilds: true` so install/build scripts (Prisma engines, esbuild, etc.) run automatically — required on pnpm 11.8 (see `CLAUDE.md` gotchas). If `node_modules/.bin` looks incomplete after install, the Prisma/tsx binaries you need for the next steps live at `packages/db/node_modules/.bin/{prisma,tsx}` regardless — use those paths directly, not `./node_modules/.bin/prisma` (that root-level path from `CLAUDE.md` doesn't exist under this pnpm layout).

## 3. Create `.env`

```bash
cp .env.example .env
```

Then fill in, at minimum, real random values for the secrets (empty/placeholder values are fine for everything else — OAuth, Stripe, email, analytics are all optional for local dev and simply no-op or disable those features):

- `AUTH_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — same generator, two different values
- `CRON_SECRET` — any random string (only matters if you're testing `/api/cron/untrusted`)

Leave `DATABASE_URL` as the `.env.example` default (`postgresql://postgres:postgres@localhost:5432/garage_sale?schema=public`) — it matches the container started below.

**Copy this same file into `apps/web/.env` too.** Next.js only auto-loads a `.env` from its own app directory, not the monorepo root — `pnpm --filter @garage-sale/web dev` won't see the root `.env` at all otherwise (`Environment variable not found: DATABASE_URL` at request time, even though the file exists at repo root):

```bash
cp .env apps/web/.env
```

Re-run this copy any time you change the root `.env` (both files are gitignored, so this won't get committed).

## 4. Start Postgres

No local Postgres install needed — run it in Docker:

```bash
docker run -d --name garage-sale-postgres \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=garage_sale \
  -p 5432:5432 postgres:16-alpine
```

Docker Desktop must actually be running first (start the app, wait for the whale icon to go steady, then run the command above). After the first run, just `docker start garage-sale-postgres` — no need to recreate the container.

## 5. Apply migrations, generate client, seed

```bash
./packages/db/node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma
./packages/db/node_modules/.bin/prisma generate --schema packages/db/prisma/schema.prisma
cd packages/db && ./node_modules/.bin/tsx prisma/seed.ts && cd ../..
```

Migrations are hand-written SQL (no local shadow DB / `prisma migrate dev` in this project — see `CLAUDE.md`). `migrate deploy` just replays the existing files in `packages/db/prisma/migrations/`. Seed creates the admin user, fee config, categories, platform settings, sample CMS content, and sample listings.

## 6. Run the app

```bash
pnpm --filter @garage-sale/web dev
```

Visit `http://localhost:3000`. If port 3000 is already bound by a stale process from an earlier run, Next.js will pick 3001/3002 instead — kill the stale one (`netstat -ano | grep :3000` → `taskkill //F //PID <pid>` on Windows) so you're not juggling multiple ports.

## Known gotchas hit on first setup (2026-07-15)

Nobody had actually run `next dev` end-to-end before (CI only runs typecheck/lint/test, never a real build/dev boot), so several latent issues surfaced at once. All are now fixed in the repo; listed here in case they resurface after a dependency bump.

1. **react/react-dom version mismatch.** `apps/web/package.json` had `"react-dom": "^19.0.0"` while the not-yet-deleted RN app (`apps/mobile`, pending Flutter cutover) pins `react@19.0.0` exactly. pnpm hoists a single React version across the workspace, so `react` got forced to `19.0.0` while `react-dom` floated to `19.2.7` under the same `^19.0.0` range — a version-mismatch crash on every page. Fixed by pinning `react-dom` to the exact `19.0.0` in `apps/web/package.json`. Check with `pnpm why react-dom` / `pnpm why react` — resolved versions must match exactly.

2. **Workspace packages' `.js`-extension relative imports don't resolve under webpack.** `packages/{api,auth,core,db}` use TS's `moduleResolution: "Bundler"` convention of writing `./root.js` in a relative import that actually resolves to `root.ts`. Vite/esbuild handle this natively; webpack (Next's default bundler) doesn't, and these packages are consumed via `transpilePackages`. Fixed with a `webpack.resolve.extensionAlias` in `apps/web/next.config.mjs`.

3. **Prisma's native query-engine binary isn't found under webpack + pnpm + Windows.** Even with `@prisma/client` marked in `serverExternalPackages`, Next's file-tracing doesn't copy the sibling `.prisma/client/query_engine-windows.dll.node` next to the externalized package. (We tried moving the Prisma `generator client` to a fixed custom `output` path instead — don't do that: it breaks the existing TS2742 "inferred type cannot be named" issue in `packages/api` in a way that's much harder to work around, because the type now points at a deeper, less portable `node_modules` path.) Fixed instead with `PRISMA_QUERY_ENGINE_LIBRARY` in `.env`, pointing straight at the binary. **This path is keyed to a pnpm virtual-store content hash** — if a future `pnpm install` changes the lockfile and Prisma errors again with "could not locate the Query Engine", re-find it and update both `.env` and `apps/web/.env`:
   ```bash
   find node_modules/.pnpm -iname "query_engine-windows.dll.node"
   ```

4. **Edge middleware can't bundle `node:crypto`.** `apps/web/src/middleware.ts` and `apps/web/src/lib/session.ts` imported from the `@garage-sale/auth` barrel (`index.ts`), which re-exports `tokens.ts` — and `tokens.ts` uses `node:crypto` for opaque-token generation (fine in Node routes, not supported in Next's Edge Runtime). Both files only actually need `jwt.ts` (the edge-safe `jose`-based half of the package). Fixed by adding a `./jwt` subpath export to `packages/auth/package.json` and importing from `@garage-sale/auth/jwt` in both files instead of the barrel. If you add new edge-runtime code (more middleware, `export const runtime = 'edge'` routes) that needs auth primitives, import the specific submodule the same way — don't import the barrel from edge code.

## Troubleshooting checklist

If `pnpm --filter @garage-sale/web dev` 500s:

1. Does `.env` **and** `apps/web/.env` exist, with real (non-empty) `DATABASE_URL`/JWT/`AUTH_SECRET` values? → step 3.
2. Is the Postgres container actually running? `docker ps` should show `garage-sale-postgres` as `Up`. → step 4.
3. Delete `apps/web/.next` and restart — stale build cache from before `.env` existed can cache bogus module-resolution errors.
4. `pnpm why react-dom` / `pnpm why react` — resolved versions must match exactly (gotcha 1).
5. "Prisma Client could not locate the Query Engine" → `PRISMA_QUERY_ENGINE_LIBRARY` needs re-pointing (gotcha 3).
6. `UnhandledSchemeError ... node:crypto` pointing at `middleware.ts` or any edge route → an import pulled in the `@garage-sale/auth` barrel instead of `@garage-sale/auth/jwt` (gotcha 4).
