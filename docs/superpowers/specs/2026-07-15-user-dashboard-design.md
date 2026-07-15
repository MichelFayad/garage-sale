# User portal dashboard — design

**Date:** 2026-07-15
**Status:** Approved, pending implementation plan

## Context

`apps/web/src/app/(user)/app/page.tsx` is a P0-era stub:

```tsx
export default function UserDashboard() {
  return (
    <section className="py-8">
      <h1 className="text-2xl font-semibold">Your dashboard</h1>
      <p className="mt-2 text-gray-600">
        Listings, trade proposals, and messages appear here. Features land P5–P8.
      </p>
    </section>
  );
}
```

P5–P8 (listings, trades, messaging, trust) are all done and live on their own pages (`/app/listings`, `/app/browse`, `/app/trades`, `/app/watchlist`), but `/app` itself — the first thing a trader sees after login — was never updated to summarize any of it.

## Goal

Replace the stub with a real at-a-glance dashboard: recent/active listings, active trade proposals, unread messages, and account-status signals that affect what the user can currently do — each linking into its full page. Admin portal and mobile app are out of scope.

## Backend — one new procedure

Everything the dashboard needs already exists except unread-message counts:

- `auth.me` (existing) already returns `trustStatus` and `paymentValid` (`packages/api/src/user.ts` `publicUser()`).
- `listings.mine` (existing) returns all of the caller's listings; the dashboard takes a client-side slice.
- `trades.mine` (existing) returns all proposals the caller is a participant in (`proposalInclude`: listing + photo, items, proposer/owner names, confirmations, ratings), newest first; the dashboard takes a client-side slice.

New: `trades.unreadMessageCount` in `packages/api/src/routers/trades.ts` — `protectedProcedure`, trader-only (same `traderOnly(ctx.principal.role)` guard as `mine`). Single Prisma count:

```ts
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

No schema changes — `Message.readAt` already exists.

## Frontend

New `apps/web/src/app/(user)/app/DashboardClient.tsx`, following the exact pattern `TradesClient.tsx` already uses: `'use client'`, `trpc.*.query()` calls inside `useEffect`, local `useState` for each piece of data, no server-side data fetching in `page.tsx` (matches every other page in this portal). `page.tsx` shrinks to a thin wrapper (title + `<DashboardClient />`), same shape as `trades/page.tsx`.

`DashboardClient` fires four parallel queries on mount (`Promise.all`-style, mirroring `TradesClient`'s `auth.me` + `trades.mine` pattern): `trpc.auth.me.query()`, `trpc.listings.mine.query()`, `trpc.trades.mine.query()`, `trpc.trades.unreadMessageCount.query()`. Single loading/error state for the whole dashboard (no per-section spinners) — simplest option that matches `TradesClient`'s all-or-nothing loading state.

### Sections (in page order)

1. **Status banner** — rendered only when relevant, above everything else:
   - `trustStatus === 'UNTRUSTED'` → warning-toned banner explaining the account is flagged untrusted (references the confirmation-window miss from `CLAUDE.md`'s trust model, no new copy needed beyond a plain explanation).
   - `!paymentValid` → separate banner noting no payment method is on file yet, linking to `/app/billing`, since publishing requires one.
   - Both can show at once (stacked), each independently gated.

2. **Listings** — heading + up to 5 of the caller's `ACTIVE` listings (sorted by `publishedAt` desc, most recent first; listings without `publishedAt` — i.e. `DRAFT`/`PENDING_PAYMENT` — excluded from this list but counted separately), each a compact row (title, type badge HAVE/WANT, condition). Below the list: `"N active · M draft"` count line. Empty state: `"No active listings yet."` Footer link: `"View all listings →"` to `/app/listings`.

3. **Trades** — heading + up to 5 proposals with `status` in `PROPOSED`/`ACCEPTED` (sorted newest first, reusing `trades.mine`'s existing order), each row: listing title, status badge (reuse `STATUS_STYLE` map from `TradesClient.tsx`), incoming/outgoing tag (same `p.ownerId === me.id` check `TradesClient` uses). Below: `"N incoming · M outgoing"` count line (open proposals only). Empty state: `"No open trades."` Footer link: `"View all trades →"` to `/app/trades`.

4. **Messages** — single line: `"N unread messages"` (or `"No unread messages"` at 0), linking to `/app/trades` — no per-thread breakdown, since there's no standalone message list/inbox page today.

### Component boundary

`DashboardClient` owns all four queries and renders all four sections inline (no further sub-components) — each section is a handful of JSX lines, well under the threshold where splitting into separate files would help rather than add indirection. This mirrors `TradesClient.tsx`'s existing size/shape.

## Testing

`packages/api/src/routers/trades.test.ts` (new file, or appended to an existing trades test file if one exists) — vitest against a mocked Prisma client, matching the established pattern in `packages/api/src/routers/auth.test.ts` / `billing.test.ts`:

- `unreadMessageCount` returns the count from a mocked `prisma.message.count` call.
- Confirms the `where` clause passed to `prisma.message.count` excludes the caller's own messages (`senderId: { not: ... }`) and unread-only (`readAt: null`).
- `traderOnly` guard rejects a non-trader principal (mirrors the existing guard test pattern used elsewhere in the trades router, if one exists — otherwise a direct assertion that a `role: 'ADMIN'`-ish principal throws `FORBIDDEN`).

No new frontend test tooling is introduced — this project has no existing component/widget tests for the web app (per `CLAUDE.md`, tests cover `packages/core` and `packages/api` only), and this feature doesn't warrant starting that precedent on its own.

## Out of scope

- Admin portal, mobile app — untouched.
- Standalone message inbox / per-thread unread breakdown on the dashboard — the messages section is a single count + link, matching how messaging is scoped today (proposal-scoped threads only, no cross-thread inbox view anywhere in the product).
- Marking messages as read from the dashboard — that already happens wherever a thread is opened (`trades/[id]`); the dashboard only reads the count.
