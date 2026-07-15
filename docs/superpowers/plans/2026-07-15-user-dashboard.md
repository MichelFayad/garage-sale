# User Portal Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the P0-era `/app` dashboard stub with a real at-a-glance view: recent/active listings, open trade proposals, unread message count, and an account-status banner (untrusted flag / no payment method), each linking into its full page.

**Architecture:** One new backend procedure (`trades.unreadMessageCount`) since everything else the dashboard needs already exists (`auth.me`, `listings.mine`, `trades.mine`). One new client component (`DashboardClient.tsx`) following the exact pattern already used by `TradesClient.tsx`/`MyListings.tsx`: `'use client'`, `trpc.*.query()` calls inside `useEffect`, local `useState`, no server-side data fetching in `page.tsx`.

**Tech Stack:** Next.js 15 App Router, tRPC v11 client (`apps/web/src/lib/trpc.ts`), Vitest (mocked Prisma) for the backend test.

---

## Context for the implementer

- Design spec: `docs/superpowers/specs/2026-07-15-user-dashboard-design.md`. Read it for the full rationale — this plan implements it task-by-task.
- The stub being replaced: `apps/web/src/app/(user)/app/page.tsx`. It's a server component with no data fetching — every other page in this portal (`trades/page.tsx`, `listings/page.tsx`) is a thin wrapper around a `'use client'` component that does its own fetching; this plan follows that shape.
- Reference implementations to match style against: `apps/web/src/app/(user)/app/trades/TradesClient.tsx` (proposal list + status badges) and `apps/web/src/app/(user)/app/listings/MyListings.tsx` (listing list + status badges). Both derive their item type via `Awaited<ReturnType<typeof trpc.X.Y.query>>[number]` — this plan's `DashboardClient.tsx` does the same for listings and trades, and inline-types the `auth.me` / `unreadMessageCount` results directly (they're simple flat objects, not arrays).
- `packages/api/src/routers/trades.ts` already has a `traderOnly(role)` helper and a `proposalInclude` const used by `mine`. The new `unreadMessageCount` procedure reuses `traderOnly` — no new helper needed.
- No frontend test tooling exists in this repo for the web app (component/widget tests) — only `packages/core` and `packages/api` have Vitest suites. This plan does not introduce one; the frontend piece is verified via `pnpm --filter @garage-sale/web typecheck` and manual browser verification, matching how `TradesClient.tsx`/`MyListings.tsx` were originally built.
- Pre-commit gate before each commit in this plan: `pnpm --filter @garage-sale/api typecheck && pnpm --filter @garage-sale/api lint && pnpm --filter @garage-sale/api test` for Task 0, and `pnpm --filter @garage-sale/web typecheck && pnpm --filter @garage-sale/web lint` for Task 1.

---

## Task 0: Backend — `trades.unreadMessageCount`

**Files:**

- Modify: `packages/api/src/routers/trades.ts`
- Create: `packages/api/src/routers/trades.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/api/src/routers/trades.test.ts`:

```ts
// trades.unreadMessageCount guard + query-shape tests. Mocked Prisma client,
// no DB — mirrors the pattern in routers/auth.test.ts.

import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { appRouter } from '../root.js';
import type { Context } from '../trpc.js';

function caller(
  prisma: Record<string, unknown>,
  principal: { userId: string; role: 'TRADER' | 'ADMIN'; accountStatus: 'ACTIVE' } | null,
) {
  const ctx = { prisma, principal, ip: null } as unknown as Context;
  return appRouter.createCaller(ctx);
}

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof TRPCError) return err.code;
    throw err;
  }
  throw new Error('expected the call to throw');
}

describe('trades.unreadMessageCount', () => {
  it('rejects a non-trader principal with FORBIDDEN', async () => {
    const api = caller(
      { message: { count: async () => 0 } },
      { userId: 'admin1', role: 'ADMIN', accountStatus: 'ACTIVE' },
    );
    const code = await codeOf(() => api.trades.unreadMessageCount());
    expect(code).toBe('FORBIDDEN');
  });

  it('returns the count from prisma.message.count', async () => {
    const api = caller(
      { message: { count: async () => 3 } },
      { userId: 'u1', role: 'TRADER', accountStatus: 'ACTIVE' },
    );
    const result = await api.trades.unreadMessageCount();
    expect(result).toEqual({ count: 3 });
  });

  it("scopes the count to unread messages from other participants in the caller's proposals", async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    const api = caller(
      {
        message: {
          count: async (args: { where: Record<string, unknown> }) => {
            capturedWhere = args.where;
            return 0;
          },
        },
      },
      { userId: 'u1', role: 'TRADER', accountStatus: 'ACTIVE' },
    );

    await api.trades.unreadMessageCount();

    expect(capturedWhere).toEqual({
      readAt: null,
      senderId: { not: 'u1' },
      proposal: { OR: [{ proposerId: 'u1' }, { ownerId: 'u1' }] },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @garage-sale/api test -- trades.test.ts`
Expected: FAIL — `appRouter.createCaller(...).trades.unreadMessageCount` is not a function (procedure doesn't exist yet).

- [ ] **Step 3: Add the procedure**

In `packages/api/src/routers/trades.ts`, the router is defined as `export const tradesRouter = router({ mine: protectedProcedure.query(...), ... })`. Add `unreadMessageCount` as a new top-level key in that object, immediately after `mine`'s closing (find the `mine: protectedProcedure.query(({ ctx }) => { ... }),` block and insert right after its closing `}),`):

```ts
  /** Count of unread messages sent to the caller across all their proposals. */
  unreadMessageCount: protectedProcedure.query(({ ctx }) => {
    traderOnly(ctx.principal.role);
    return ctx.prisma.message
      .count({
        where: {
          readAt: null,
          senderId: { not: ctx.principal.userId },
          proposal: {
            OR: [{ proposerId: ctx.principal.userId }, { ownerId: ctx.principal.userId }],
          },
        },
      })
      .then((count) => ({ count }));
  }),
```

No new imports are needed — `protectedProcedure` and `traderOnly` are already imported/defined in this file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @garage-sale/api test -- trades.test.ts`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter @garage-sale/api typecheck`
Expected: exits 0, no errors.

Run: `pnpm --filter @garage-sale/api lint`
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/trades.ts packages/api/src/routers/trades.test.ts
git commit -m "Add trades.unreadMessageCount procedure for the user dashboard"
```

---

## Task 1: Frontend — `DashboardClient` + replace the stub

**Files:**

- Create: `apps/web/src/app/(user)/app/DashboardClient.tsx`
- Modify: `apps/web/src/app/(user)/app/page.tsx`

- [ ] **Step 1: Replace the stub page**

Replace the full contents of `apps/web/src/app/(user)/app/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { DashboardClient } from './DashboardClient';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <section className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">Your dashboard</h1>
      <DashboardClient />
    </section>
  );
}
```

- [ ] **Step 2: Write `DashboardClient`**

`apps/web/src/app/(user)/app/DashboardClient.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '../../../lib/trpc';

type Me = Awaited<ReturnType<typeof trpc.auth.me.query>>;
type Listing = Awaited<ReturnType<typeof trpc.listings.mine.query>>[number];
type Proposal = Awaited<ReturnType<typeof trpc.trades.mine.query>>[number];

const TRADE_STATUS_STYLE: Record<string, string> = {
  PROPOSED: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  DECLINED: 'bg-red-100 text-red-700',
  COUNTERED: 'bg-gray-100 text-gray-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  COMPLETED: 'bg-purple-100 text-purple-800',
};

const OPEN_TRADE_STATUSES = new Set(['PROPOSED', 'ACCEPTED']);

interface DashboardData {
  me: Me;
  listings: Listing[];
  trades: Proposal[];
  unreadCount: number;
}

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [me, listings, trades, unread] = await Promise.all([
          trpc.auth.me.query(),
          trpc.listings.mine.query(),
          trpc.trades.mine.query(),
          trpc.trades.unreadMessageCount.query(),
        ]);
        if (!cancelled) {
          setData({ me, listings, trades, unreadCount: unread.count });
        }
      } catch {
        if (!cancelled) setError('Could not load your dashboard.');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-gray-600">Loading…</p>;

  const { me, listings, trades, unreadCount } = data;
  const isUntrusted = me.kind === 'trader' && me.trustStatus === 'UNTRUSTED';
  const noPaymentMethod = me.kind === 'trader' && !me.paymentValid;

  const activeListings = listings.filter((l) => l.status === 'ACTIVE');
  const draftListings = listings.filter((l) => l.status === 'DRAFT');
  const recentActiveListings = [...activeListings]
    .sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime())
    .slice(0, 5);

  const openTrades = trades.filter((t) => OPEN_TRADE_STATUSES.has(t.status));
  const incomingCount = openTrades.filter((t) => t.ownerId === me.id).length;
  const outgoingCount = openTrades.filter((t) => t.proposerId === me.id).length;
  const recentOpenTrades = openTrades.slice(0, 5);

  return (
    <div className="space-y-8">
      {isUntrusted && (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          Your account is currently flagged as untrusted. This can affect how other traders see you
          — it's usually caused by missing a trade-confirmation window.
        </p>
      )}
      {noPaymentMethod && (
        <p
          role="status"
          className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          You don't have a payment method on file yet.{' '}
          <Link href="/app/billing" className="font-medium underline">
            Add one
          </Link>{' '}
          before publishing a listing.
        </p>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">Listings</h2>
        {recentActiveListings.length === 0 && (
          <p className="text-sm text-gray-600">No active listings yet.</p>
        )}
        <div className="space-y-2">
          {recentActiveListings.map((l) => (
            <Link
              key={l.id}
              href={`/app/listings/${l.id}`}
              className="block rounded border border-gray-200 p-3 hover:border-gray-400"
            >
              <span className="font-medium">{l.title}</span>{' '}
              <span className="text-sm text-gray-500">
                {l.type} · {l.category.name}
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {activeListings.length} active · {draftListings.length} draft
        </p>
        <Link href="/app/listings" className="text-sm text-gray-600 hover:underline">
          View all listings →
        </Link>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Trades</h2>
        {recentOpenTrades.length === 0 && <p className="text-sm text-gray-600">No open trades.</p>}
        <div className="space-y-2">
          {recentOpenTrades.map((t) => (
            <Link
              key={t.id}
              href={`/app/trades/${t.id}`}
              className="block rounded border border-gray-200 p-3 hover:border-gray-400"
            >
              <span className="font-medium">{t.listing.title}</span>{' '}
              <span className={`rounded px-2 py-0.5 text-xs ${TRADE_STATUS_STYLE[t.status] ?? ''}`}>
                {t.status}
              </span>{' '}
              <span className="text-xs text-gray-500">
                {t.ownerId === me.id ? 'incoming' : 'outgoing'}
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {incomingCount} incoming · {outgoingCount} outgoing
        </p>
        <Link href="/app/trades" className="text-sm text-gray-600 hover:underline">
          View all trades →
        </Link>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Messages</h2>
        <Link href="/app/trades" className="text-sm text-gray-600 hover:underline">
          {unreadCount > 0 ? `${unreadCount} unread messages` : 'No unread messages'}
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @garage-sale/web typecheck`
Expected: exits 0, no errors. `me.trustStatus` and `me.paymentValid` are guarded by `me.kind === 'trader' && ...` so TS narrows correctly within each expression; `me.id` needs no guard since `id` exists on both members of the `Me` union (admin and trader).

- [ ] **Step 4: Lint**

Run: `pnpm --filter @garage-sale/web lint`
Expected: exits 0, no errors.

- [ ] **Step 5: Manual verification**

With the dev server running (`pnpm --filter @garage-sale/web dev`) and seeded data present (see `docs/ENVIRONMENT_SETUP.md`):

1. Log in as `alice@example.com` / `password123`.
2. Confirm `/app` shows: all 3 of her listings (Vintage road bike, Mid-century record player, and the "Looking for: kids bicycle" WANT) — the seed sets every sample listing to `status: 'ACTIVE'` regardless of HAVE/WANT type, so expect "3 active · 0 draft". No open trades yet ("No open trades."), "No unread messages", and no status banners (alice has `paymentValid: true` and default `trustStatus: TRUSTED` from the seed).
3. Confirm each "View all…" link navigates to the right page.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(user)/app/DashboardClient.tsx" "apps/web/src/app/(user)/app/page.tsx"
git commit -m "Build real user dashboard: listings, trades, unread messages, status banners"
```

---

## Task 2: Full gate + push

- [ ] **Step 1: Run the full pre-commit gate**

Run: `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm format:check`
Expected: all green. If `format:check` fails only on the two files this plan touched, run `pnpm format` and re-check; if it fails on pre-existing unrelated files, that's expected (see prior session notes) and not this plan's concern.

- [ ] **Step 2: Push**

Confirm with the user before pushing (per this repo's established workflow this session), then:

```bash
git push origin main
```
