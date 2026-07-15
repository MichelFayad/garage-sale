# Flutter F2 — Trades, Messaging, Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the trades feature (propose/accept/decline/counter/cancel, dual-confirm + rating, messaging with read receipts, block/unblock, report) to the Flutter app (`apps/mobile_flutter`), reaching parity with the already-shipped RN app (`apps/mobile`) and web user portal, backed by a new REST facade mirroring the existing `apps/web/src/app/api/mobile/*` pattern used by F0 (auth) and F1 (listings/browse/watchlist).

**Architecture:** Organized into 5 waves. Each wave's tasks touch disjoint files and are dispatched to **parallel subagents**; a wave starts only after the previous wave's tasks are all merged (later Dart layers import earlier layers' concrete classes/providers). Wave 1's two tracks (backend REST facade vs. Flutter domain models) touch entirely different apps and have zero code dependency on each other, so they run concurrently. Within Waves 2-4, each track gets its **own** provider/file — e.g. `trades_providers.dart`, `messages_providers.dart`, `blocks_providers.dart` instead of one shared `providers.dart` — specifically so parallel agents never edit the same file (a deliberate, noted deviation from F1's single-`providers.dart`-per-folder convention, which was safe there only because F1's provider task ran alone, after its 3 repos already existed). Wave 5 (go_router wiring) is the one genuinely shared file (`app_router.dart`) and is intentionally sequential, single-agent.

**Tech Stack:** Next.js 15 route handlers wrapping the existing tRPC routers (`packages/api/src/routers/trades.ts`, `packages/api/src/routers/blocks.ts`) for the backend track — no business-logic duplication, matching F0/F1. Flutter/Dart + `flutter_riverpod` (`AsyncNotifier` / `AsyncNotifier.family`) + `go_router` + `package:http`, matching F0/F1 conventions exactly.

---

## Context for the implementer

- F0 (auth) and F1 (listings/browse/watchlist) are done and merged to `main`. Read `apps/mobile_flutter/lib/listings/*` and `apps/mobile_flutter/lib/auth/providers.dart` before starting any Flutter task — this plan's code follows those exact patterns (repository interface + `Rest*` impl + `Fake*` test double + `AsyncNotifier` controller + `ConsumerWidget` screen, every repository method's last parameter is `String accessToken`, every controller mutation does `await future;` then `state = const AsyncLoading(); state = await AsyncValue.guard(_load);`).
- Backend routers already exist and are **unchanged** by this plan: `packages/api/src/routers/trades.ts` (all procedures), `packages/api/src/routers/blocks.ts`. This plan only adds REST wrappers around them, exactly like F1 did for `listings`/`browse`/`watchlist`.
- No backend route-handler tests are added (matches F0/F1 precedent — verified via `pnpm --filter @garage-sale/web typecheck && lint`; business logic is already tested in `packages/api`).
- `ProposalStatus` lifecycle: `PROPOSED → ACCEPTED → COMPLETED` (via dual confirm) or `PROPOSED → DECLINED/COUNTERED/CANCELLED` or `ACCEPTED → CANCELLED` (unlocks listings) — see `packages/api/src/routers/trades.ts:176-305` for the exact transitions and errors each throws.
- `counter` creates a **brand-new** `TradeProposal` (the original flips to `COUNTERED`) — the Flutter counter flow must navigate to the _new_ proposal's id after submitting, not just refresh the old one.
- `rate` returns `{ ok: true }`, not the proposal — the screen must re-fetch (`ref.invalidate`) to see the new rating reflected.
- Out of scope for F2 (unchanged): listing `markTraded`/`Publish` stub (`MyListingsScreen`, F3 = Stripe), photo upload (backend-blocked, separate follow-up), push notifications (F4).
- Real gap fixed on web just before this plan was written: `trades.markThreadRead` now exists (`packages/api/src/routers/trades.ts`, mutation) and must be wired the same way here (call it when the message thread loads).

---

# Wave 1 — 2 parallel tracks

## Track A: Backend REST facade — trades, messaging, blocks, reports

**Files:**

- Create: `apps/web/src/app/api/mobile/trades/route.ts`
- Create: `apps/web/src/app/api/mobile/trades/unread-count/route.ts`
- Create: `apps/web/src/app/api/mobile/trades/[id]/route.ts`
- Create: `apps/web/src/app/api/mobile/trades/[id]/accept/route.ts`
- Create: `apps/web/src/app/api/mobile/trades/[id]/decline/route.ts`
- Create: `apps/web/src/app/api/mobile/trades/[id]/counter/route.ts`
- Create: `apps/web/src/app/api/mobile/trades/[id]/cancel/route.ts`
- Create: `apps/web/src/app/api/mobile/trades/[id]/confirm/route.ts`
- Create: `apps/web/src/app/api/mobile/trades/[id]/rate/route.ts`
- Create: `apps/web/src/app/api/mobile/trades/[id]/messages/route.ts`
- Create: `apps/web/src/app/api/mobile/trades/[id]/read/route.ts`
- Create: `apps/web/src/app/api/mobile/reports/route.ts`
- Create: `apps/web/src/app/api/mobile/blocks/route.ts`
- Create: `apps/web/src/app/api/mobile/blocks/[userId]/route.ts`

Every route follows the exact pattern of `apps/web/src/app/api/mobile/listings/[id]/mark-traded/route.ts`: `appRouter.createCaller(await createContext({ headers: req.headers }))`, call the tRPC procedure, map `TRPCError.code` through a per-file `STATUS` record, `NextResponse.json` the raw result (or `{ error }` on failure).

- [ ] **Step 1: `mobile/trades/route.ts` — mine + propose**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const proposals = await caller.trades.mine();
    return NextResponse.json(proposals);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load trades' }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { listingId, offeredListingIds } = body as {
    listingId?: unknown;
    offeredListingIds?: unknown;
  };

  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const proposal = await caller.trades.propose({
      listingId: String(listingId ?? ''),
      offeredListingIds: Array.isArray(offeredListingIds) ? offeredListingIds.map(String) : [],
    });
    return NextResponse.json(proposal);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to propose trade' }, { status: 400 });
  }
}
```

- [ ] **Step 2: `mobile/trades/unread-count/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403 };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.trades.unreadMessageCount();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load unread count' }, { status: 400 });
  }
}
```

- [ ] **Step 3: `mobile/trades/[id]/route.ts` — byId**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404 };

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const proposal = await caller.trades.byId({ id });
    return NextResponse.json(proposal);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load trade' }, { status: 400 });
  }
}
```

- [ ] **Step 4: `mobile/trades/[id]/accept/route.ts`** (the one route that can throw `CONFLICT`)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const proposal = await caller.trades.accept({ id });
    return NextResponse.json(proposal);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to accept trade' }, { status: 400 });
  }
}
```

- [ ] **Step 5: `mobile/trades/[id]/decline/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const proposal = await caller.trades.decline({ id });
    return NextResponse.json(proposal);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to decline trade' }, { status: 400 });
  }
}
```

- [ ] **Step 6: `mobile/trades/[id]/counter/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { offeredListingIds } = body as { offeredListingIds?: unknown };

  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const proposal = await caller.trades.counter({
      id,
      offeredListingIds: Array.isArray(offeredListingIds) ? offeredListingIds.map(String) : [],
    });
    return NextResponse.json(proposal);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to counter trade' }, { status: 400 });
  }
}
```

- [ ] **Step 7: `mobile/trades/[id]/cancel/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const proposal = await caller.trades.cancel({ id });
    return NextResponse.json(proposal);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to cancel trade' }, { status: 400 });
  }
}
```

- [ ] **Step 8: `mobile/trades/[id]/confirm/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const proposal = await caller.trades.confirm({ id });
    return NextResponse.json(proposal);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to confirm trade' }, { status: 400 });
  }
}
```

- [ ] **Step 9: `mobile/trades/[id]/rate/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { stars, review } = body as { stars?: unknown; review?: unknown };

  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.trades.rate({
      id,
      stars: Number(stars ?? 0),
      review: typeof review === 'string' && review.trim() ? review : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to rate trade' }, { status: 400 });
  }
}
```

- [ ] **Step 10: `mobile/trades/[id]/messages/route.ts` — list + send**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const messages = await caller.trades.messages({ proposalId: id });
    return NextResponse.json(messages);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 400 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { body } = json as { body?: unknown };

  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const message = await caller.trades.sendMessage({
      proposalId: id,
      body: String(body ?? ''),
    });
    return NextResponse.json(message);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to send message' }, { status: 400 });
  }
}
```

- [ ] **Step 11: `mobile/trades/[id]/read/route.ts` — markThreadRead**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404 };

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.trades.markThreadRead({ proposalId: id });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to mark thread read' }, { status: 400 });
  }
}
```

- [ ] **Step 12: `mobile/reports/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400 };

export async function POST(req: NextRequest): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { targetType, targetId, reason } = json as {
    targetType?: unknown;
    targetId?: unknown;
    reason?: unknown;
  };

  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.trades.report({
      targetType: targetType === 'LISTING' ? 'LISTING' : 'USER',
      targetId: String(targetId ?? ''),
      reason: String(reason ?? ''),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 400 });
  }
}
```

- [ ] **Step 13: `mobile/blocks/route.ts` — list + block**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400 };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const blocks = await caller.blocks.list();
    return NextResponse.json(blocks);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load blocks' }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { userId, reason } = json as { userId?: unknown; reason?: unknown };

  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.blocks.block({
      userId: String(userId ?? ''),
      reason: typeof reason === 'string' && reason.trim() ? reason : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to block user' }, { status: 400 });
  }
}
```

- [ ] **Step 14: `mobile/blocks/[userId]/route.ts` — status + unblock**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403 };

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const { userId } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.blocks.status({ userId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load block status' }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const { userId } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.blocks.unblock({ userId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to unblock user' }, { status: 400 });
  }
}
```

- [ ] **Step 15: Typecheck and lint**

Run: `pnpm --filter @garage-sale/web typecheck && pnpm --filter @garage-sale/web lint`
Expected: both exit 0.

- [ ] **Step 16: Commit**

```bash
git add apps/web/src/app/api/mobile/trades apps/web/src/app/api/mobile/reports apps/web/src/app/api/mobile/blocks
git commit -m "Add mobile REST facade for trades, messaging, blocks, reports"
```

---

## Track B0: Flutter trade domain models

**Files:**

- Create: `apps/mobile_flutter/lib/trades/models/proposal_status.dart`
- Create: `apps/mobile_flutter/lib/trades/models/proposal_item.dart`
- Create: `apps/mobile_flutter/lib/trades/models/trade_confirmation.dart`
- Create: `apps/mobile_flutter/lib/trades/models/trade_rating.dart`
- Create: `apps/mobile_flutter/lib/trades/models/proposal.dart`
- Create: `apps/mobile_flutter/lib/trades/models/trade_message.dart`
- Create: `apps/mobile_flutter/lib/trades/models/block_entry.dart`
- Test: `apps/mobile_flutter/test/trades/models/proposal_test.dart`
- Test: `apps/mobile_flutter/test/trades/models/trade_message_test.dart`
- Test: `apps/mobile_flutter/test/trades/models/block_entry_test.dart`

These mirror `apps/mobile_flutter/lib/listings/models/listing.dart`'s shape exactly (plain classes, `fromJson` factories, enum `fromApi` extension maps — no codegen, matching `pubspec.yaml`'s current deps). `Proposal.listing` and `ProposalItem.listing` reuse the existing `Listing.fromJson` from `lib/listings/models/listing.dart` — do not duplicate listing decoding.

- [ ] **Step 1: `proposal_status.dart`**

```dart
enum ProposalStatus { proposed, accepted, declined, countered, cancelled, completed }

extension ProposalStatusJson on ProposalStatus {
  static const _fromApi = {
    'PROPOSED': ProposalStatus.proposed,
    'ACCEPTED': ProposalStatus.accepted,
    'DECLINED': ProposalStatus.declined,
    'COUNTERED': ProposalStatus.countered,
    'CANCELLED': ProposalStatus.cancelled,
    'COMPLETED': ProposalStatus.completed,
  };

  static ProposalStatus fromApi(String value) => _fromApi[value]!;
}
```

- [ ] **Step 2: `proposal_item.dart`**

```dart
import '../../listings/models/listing.dart';

class ProposalItem {
  const ProposalItem({required this.id, required this.listing});

  final String id;
  final Listing listing;

  factory ProposalItem.fromJson(Map<String, dynamic> json) {
    return ProposalItem(
      id: json['id'] as String,
      listing: Listing.fromJson(json['listing'] as Map<String, dynamic>),
    );
  }
}
```

- [ ] **Step 3: `trade_confirmation.dart`**

```dart
class TradeConfirmation {
  const TradeConfirmation({required this.id, required this.userId, required this.confirmedAt});

  final String id;
  final String userId;
  final DateTime confirmedAt;

  factory TradeConfirmation.fromJson(Map<String, dynamic> json) {
    return TradeConfirmation(
      id: json['id'] as String,
      userId: json['userId'] as String,
      confirmedAt: DateTime.parse(json['confirmedAt'] as String),
    );
  }
}
```

- [ ] **Step 4: `trade_rating.dart`**

```dart
class TradeRating {
  const TradeRating({
    required this.id,
    required this.raterId,
    required this.rateeId,
    required this.stars,
    this.review,
  });

  final String id;
  final String raterId;
  final String rateeId;
  final int stars;
  final String? review;

  factory TradeRating.fromJson(Map<String, dynamic> json) {
    return TradeRating(
      id: json['id'] as String,
      raterId: json['raterId'] as String,
      rateeId: json['rateeId'] as String,
      stars: json['stars'] as int,
      review: json['review'] as String?,
    );
  }
}
```

- [ ] **Step 5: `proposal.dart`**

```dart
import '../../listings/models/listing.dart';
import 'proposal_item.dart';
import 'proposal_status.dart';
import 'trade_confirmation.dart';
import 'trade_rating.dart';

class Proposal {
  const Proposal({
    required this.id,
    required this.listingId,
    required this.listing,
    required this.proposerId,
    required this.proposerName,
    required this.ownerId,
    required this.ownerName,
    required this.status,
    required this.items,
    required this.confirmations,
    required this.ratings,
    required this.createdAt,
    this.parentProposalId,
    this.acceptedAt,
    this.completedAt,
    this.cancelledAt,
  });

  final String id;
  final String listingId;
  final Listing listing;
  final String proposerId;
  final String proposerName;
  final String ownerId;
  final String ownerName;
  final ProposalStatus status;
  final List<ProposalItem> items;
  final List<TradeConfirmation> confirmations;
  final List<TradeRating> ratings;
  final DateTime createdAt;
  final String? parentProposalId;
  final DateTime? acceptedAt;
  final DateTime? completedAt;
  final DateTime? cancelledAt;

  factory Proposal.fromJson(Map<String, dynamic> json) {
    final proposer = json['proposer'] as Map<String, dynamic>;
    final owner = json['owner'] as Map<String, dynamic>;
    return Proposal(
      id: json['id'] as String,
      listingId: json['listingId'] as String,
      listing: Listing.fromJson(json['listing'] as Map<String, dynamic>),
      proposerId: json['proposerId'] as String,
      proposerName: proposer['displayName'] as String,
      ownerId: json['ownerId'] as String,
      ownerName: owner['displayName'] as String,
      status: ProposalStatusJson.fromApi(json['status'] as String),
      items: (json['items'] as List<dynamic>? ?? [])
          .map((i) => ProposalItem.fromJson(i as Map<String, dynamic>))
          .toList(),
      confirmations: (json['confirmations'] as List<dynamic>? ?? [])
          .map((c) => TradeConfirmation.fromJson(c as Map<String, dynamic>))
          .toList(),
      ratings: (json['ratings'] as List<dynamic>? ?? [])
          .map((r) => TradeRating.fromJson(r as Map<String, dynamic>))
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      parentProposalId: json['parentProposalId'] as String?,
      acceptedAt: json['acceptedAt'] != null
          ? DateTime.parse(json['acceptedAt'] as String)
          : null,
      completedAt: json['completedAt'] != null
          ? DateTime.parse(json['completedAt'] as String)
          : null,
      cancelledAt: json['cancelledAt'] != null
          ? DateTime.parse(json['cancelledAt'] as String)
          : null,
    );
  }
}
```

- [ ] **Step 6: `trade_message.dart`**

```dart
class TradeMessage {
  const TradeMessage({
    required this.id,
    required this.proposalId,
    required this.senderId,
    required this.senderName,
    required this.body,
    required this.createdAt,
    this.readAt,
  });

  final String id;
  final String proposalId;
  final String senderId;
  final String senderName;
  final String body;
  final DateTime createdAt;
  final DateTime? readAt;

  factory TradeMessage.fromJson(Map<String, dynamic> json) {
    final sender = json['sender'] as Map<String, dynamic>;
    return TradeMessage(
      id: json['id'] as String,
      proposalId: json['proposalId'] as String,
      senderId: json['senderId'] as String,
      senderName: sender['displayName'] as String,
      body: json['body'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      readAt: json['readAt'] != null ? DateTime.parse(json['readAt'] as String) : null,
    );
  }
}
```

- [ ] **Step 7: `block_entry.dart`**

```dart
class BlockEntry {
  const BlockEntry({
    required this.id,
    required this.blockedUserId,
    required this.blockedUserName,
    required this.createdAt,
    this.reason,
  });

  final String id;
  final String blockedUserId;
  final String blockedUserName;
  final DateTime createdAt;
  final String? reason;

  factory BlockEntry.fromJson(Map<String, dynamic> json) {
    final blocked = json['blocked'] as Map<String, dynamic>;
    return BlockEntry(
      id: json['id'] as String,
      blockedUserId: blocked['id'] as String,
      blockedUserName: blocked['displayName'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      reason: json['reason'] as String?,
    );
  }
}
```

- [ ] **Step 8: `test/trades/models/proposal_test.dart`**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/models/proposal_status.dart';

void main() {
  test('Proposal.fromJson decodes a full proposal payload', () {
    final json = {
      'id': 'p1',
      'listingId': 'l1',
      'listing': {
        'id': 'l1',
        'ownerId': 'owner1',
        'type': 'HAVE',
        'title': 'Bike',
        'description': 'Road bike',
        'condition': 'GOOD',
        'categoryId': 'cat1',
        'status': 'LOCKED',
        'photos': [],
      },
      'proposerId': 'u1',
      'proposer': {'id': 'u1', 'displayName': 'Alice'},
      'ownerId': 'u2',
      'owner': {'id': 'u2', 'displayName': 'Bob'},
      'status': 'ACCEPTED',
      'parentProposalId': null,
      'acceptedAt': '2026-07-15T10:00:00.000Z',
      'completedAt': null,
      'cancelledAt': null,
      'createdAt': '2026-07-14T10:00:00.000Z',
      'items': [
        {
          'id': 'pi1',
          'listing': {
            'id': 'l2',
            'ownerId': 'u1',
            'type': 'HAVE',
            'title': 'Skates',
            'description': 'Roller skates',
            'condition': 'FAIR',
            'categoryId': 'cat2',
            'status': 'LOCKED',
            'photos': [],
          },
        },
      ],
      'confirmations': [
        {'id': 'c1', 'userId': 'u1', 'confirmedAt': '2026-07-15T11:00:00.000Z'},
      ],
      'ratings': [],
    };

    final proposal = Proposal.fromJson(json);

    expect(proposal.id, 'p1');
    expect(proposal.status, ProposalStatus.accepted);
    expect(proposal.proposerName, 'Alice');
    expect(proposal.ownerName, 'Bob');
    expect(proposal.listing.title, 'Bike');
    expect(proposal.items, hasLength(1));
    expect(proposal.items.first.listing.title, 'Skates');
    expect(proposal.confirmations, hasLength(1));
    expect(proposal.confirmations.first.userId, 'u1');
    expect(proposal.ratings, isEmpty);
    expect(proposal.acceptedAt, DateTime.parse('2026-07-15T10:00:00.000Z'));
    expect(proposal.completedAt, isNull);
  });
}
```

- [ ] **Step 9: `test/trades/models/trade_message_test.dart`**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/trades/models/trade_message.dart';

void main() {
  test('TradeMessage.fromJson decodes sender name and nullable readAt', () {
    final unread = TradeMessage.fromJson({
      'id': 'm1',
      'proposalId': 'p1',
      'senderId': 'u1',
      'sender': {'id': 'u1', 'displayName': 'Alice'},
      'body': 'Hi there',
      'createdAt': '2026-07-15T10:00:00.000Z',
      'readAt': null,
    });

    expect(unread.senderName, 'Alice');
    expect(unread.body, 'Hi there');
    expect(unread.readAt, isNull);

    final read = TradeMessage.fromJson({
      'id': 'm2',
      'proposalId': 'p1',
      'senderId': 'u2',
      'sender': {'id': 'u2', 'displayName': 'Bob'},
      'body': 'Sounds good',
      'createdAt': '2026-07-15T10:05:00.000Z',
      'readAt': '2026-07-15T10:10:00.000Z',
    });

    expect(read.readAt, DateTime.parse('2026-07-15T10:10:00.000Z'));
  });
}
```

- [ ] **Step 10: `test/trades/models/block_entry_test.dart`**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/trades/models/block_entry.dart';

void main() {
  test('BlockEntry.fromJson decodes the blocked user and optional reason', () {
    final entry = BlockEntry.fromJson({
      'id': 'b1',
      'reason': 'Spam',
      'createdAt': '2026-07-15T10:00:00.000Z',
      'blocked': {'id': 'u3', 'displayName': 'Carol'},
    });

    expect(entry.blockedUserId, 'u3');
    expect(entry.blockedUserName, 'Carol');
    expect(entry.reason, 'Spam');

    final noReason = BlockEntry.fromJson({
      'id': 'b2',
      'reason': null,
      'createdAt': '2026-07-15T10:00:00.000Z',
      'blocked': {'id': 'u4', 'displayName': 'Dave'},
    });

    expect(noReason.reason, isNull);
  });
}
```

- [ ] **Step 11: Run tests, verify pass**

Run: `cd apps/mobile_flutter && flutter test test/trades/models/`
Expected: 3 files, all tests PASS.

- [ ] **Step 12: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: no issues.

- [ ] **Step 13: Commit**

```bash
git add apps/mobile_flutter/lib/trades/models apps/mobile_flutter/test/trades/models
git commit -m "Add Flutter trade domain models (proposal, message, block)"
```

---

# Wave 2 — 3 parallel tracks (depend on Wave 1 Track B0 merged)

## Track B1: TradesRepository

**Files:**

- Create: `apps/mobile_flutter/lib/trades/trades_repository.dart`
- Create: `apps/mobile_flutter/lib/trades/rest_trades_repository.dart`
- Create: `apps/mobile_flutter/lib/trades/trades_providers.dart`
- Create: `apps/mobile_flutter/test/support/fake_trades_repository.dart`
- Test: `apps/mobile_flutter/test/trades/rest_trades_repository_test.dart`

Follows `apps/mobile_flutter/lib/listings/rest_listings_repository.dart`'s exact shape: one method per REST endpoint, every method's last param is `String accessToken`, empty-body POSTs pass `const {}` (see `RestListingsRepository.markTraded`).

- [ ] **Step 1: `trades_repository.dart`**

```dart
import 'models/proposal.dart';

abstract class TradesRepository {
  Future<List<Proposal>> mine(String accessToken);
  Future<Proposal> byId(String id, String accessToken);
  Future<Proposal> propose(String listingId, List<String> offeredListingIds, String accessToken);
  Future<Proposal> accept(String id, String accessToken);
  Future<Proposal> decline(String id, String accessToken);
  Future<Proposal> counter(String id, List<String> offeredListingIds, String accessToken);
  Future<Proposal> cancel(String id, String accessToken);
  Future<Proposal> confirm(String id, String accessToken);
  Future<void> rate(String id, int stars, String? review, String accessToken);
}
```

- [ ] **Step 2: `rest_trades_repository.dart`**

```dart
import '../core/api_client.dart';
import 'models/proposal.dart';
import 'trades_repository.dart';

class RestTradesRepository implements TradesRepository {
  RestTradesRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<Proposal>> mine(String accessToken) async {
    final json = await _client.getList('/mobile/trades', accessToken: accessToken);
    return json.map((p) => Proposal.fromJson(p as Map<String, dynamic>)).toList();
  }

  @override
  Future<Proposal> byId(String id, String accessToken) async {
    final json = await _client.get('/mobile/trades/$id', accessToken: accessToken);
    return Proposal.fromJson(json);
  }

  @override
  Future<Proposal> propose(
    String listingId,
    List<String> offeredListingIds,
    String accessToken,
  ) async {
    final json = await _client.post(
      '/mobile/trades',
      {'listingId': listingId, 'offeredListingIds': offeredListingIds},
      accessToken: accessToken,
    );
    return Proposal.fromJson(json);
  }

  @override
  Future<Proposal> accept(String id, String accessToken) async {
    final json = await _client.post('/mobile/trades/$id/accept', const {}, accessToken: accessToken);
    return Proposal.fromJson(json);
  }

  @override
  Future<Proposal> decline(String id, String accessToken) async {
    final json = await _client.post(
      '/mobile/trades/$id/decline',
      const {},
      accessToken: accessToken,
    );
    return Proposal.fromJson(json);
  }

  @override
  Future<Proposal> counter(
    String id,
    List<String> offeredListingIds,
    String accessToken,
  ) async {
    final json = await _client.post(
      '/mobile/trades/$id/counter',
      {'offeredListingIds': offeredListingIds},
      accessToken: accessToken,
    );
    return Proposal.fromJson(json);
  }

  @override
  Future<Proposal> cancel(String id, String accessToken) async {
    final json = await _client.post('/mobile/trades/$id/cancel', const {}, accessToken: accessToken);
    return Proposal.fromJson(json);
  }

  @override
  Future<Proposal> confirm(String id, String accessToken) async {
    final json = await _client.post(
      '/mobile/trades/$id/confirm',
      const {},
      accessToken: accessToken,
    );
    return Proposal.fromJson(json);
  }

  @override
  Future<void> rate(String id, int stars, String? review, String accessToken) async {
    await _client.post(
      '/mobile/trades/$id/rate',
      {'stars': stars, if (review != null) 'review': review},
      accessToken: accessToken,
    );
  }
}
```

- [ ] **Step 3: `trades_providers.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'rest_trades_repository.dart';
import 'trades_repository.dart';

final tradesRepositoryProvider = Provider<TradesRepository>(
  (ref) => RestTradesRepository(ref.watch(apiClientProvider)),
);
```

- [ ] **Step 4: `test/support/fake_trades_repository.dart`**

```dart
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/trades_repository.dart';

class FakeTradesRepository implements TradesRepository {
  FakeTradesRepository({List<Proposal> proposals = const []})
    : _proposals = List.of(proposals);

  final List<Proposal> _proposals;
  int acceptCalls = 0;
  int declineCalls = 0;
  int cancelCalls = 0;
  int confirmCalls = 0;
  List<String>? lastRateReview;
  int? lastRateStars;

  @override
  Future<List<Proposal>> mine(String accessToken) async => List.of(_proposals);

  @override
  Future<Proposal> byId(String id, String accessToken) async {
    return _proposals.firstWhere((p) => p.id == id);
  }

  @override
  Future<Proposal> propose(
    String listingId,
    List<String> offeredListingIds,
    String accessToken,
  ) async {
    final created = _proposals.first;
    return created;
  }

  @override
  Future<Proposal> accept(String id, String accessToken) async {
    acceptCalls++;
    return _proposals.firstWhere((p) => p.id == id);
  }

  @override
  Future<Proposal> decline(String id, String accessToken) async {
    declineCalls++;
    return _proposals.firstWhere((p) => p.id == id);
  }

  @override
  Future<Proposal> counter(
    String id,
    List<String> offeredListingIds,
    String accessToken,
  ) async {
    return _proposals.firstWhere((p) => p.id == id);
  }

  @override
  Future<Proposal> cancel(String id, String accessToken) async {
    cancelCalls++;
    return _proposals.firstWhere((p) => p.id == id);
  }

  @override
  Future<Proposal> confirm(String id, String accessToken) async {
    confirmCalls++;
    return _proposals.firstWhere((p) => p.id == id);
  }

  @override
  Future<void> rate(String id, int stars, String? review, String accessToken) async {
    lastRateStars = stars;
    lastRateReview = review == null ? null : [review];
  }
}
```

- [ ] **Step 5: `test/trades/rest_trades_repository_test.dart`**

```dart
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/trades/rest_trades_repository.dart';

Map<String, dynamic> _proposalJson({String id = 'p1', String status = 'PROPOSED'}) => {
  'id': id,
  'listingId': 'l1',
  'listing': {
    'id': 'l1',
    'ownerId': 'owner1',
    'type': 'HAVE',
    'title': 'Bike',
    'description': 'Road bike',
    'condition': 'GOOD',
    'categoryId': 'cat1',
    'status': 'ACTIVE',
    'photos': [],
  },
  'proposerId': 'u1',
  'proposer': {'id': 'u1', 'displayName': 'Alice'},
  'ownerId': 'u2',
  'owner': {'id': 'u2', 'displayName': 'Bob'},
  'status': status,
  'parentProposalId': null,
  'acceptedAt': null,
  'completedAt': null,
  'cancelledAt': null,
  'createdAt': '2026-07-15T10:00:00.000Z',
  'items': [],
  'confirmations': [],
  'ratings': [],
};

void main() {
  group('RestTradesRepository', () {
    test('mine GETs /mobile/trades and decodes the list', () async {
      final mock = MockClient((request) async {
        expect(request.method, 'GET');
        expect(request.url.path, '/api/mobile/trades');
        return http.Response(jsonEncode([_proposalJson()]), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      final result = await repo.mine('tok1');

      expect(result, hasLength(1));
      expect(result.first.id, 'p1');
    });

    test('propose POSTs listingId and offeredListingIds', () async {
      late Map<String, dynamic> sentBody;
      final mock = MockClient((request) async {
        sentBody = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(jsonEncode(_proposalJson()), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      await repo.propose('l1', ['l2', 'l3'], 'tok1');

      expect(sentBody, {'listingId': 'l1', 'offeredListingIds': ['l2', 'l3']});
    });

    test('accept POSTs to /accept with an empty body', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode(_proposalJson(status: 'ACCEPTED')), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      final result = await repo.accept('p1', 'tok1');

      expect(captured.url.path, '/api/mobile/trades/p1/accept');
      expect(captured.body, '{}');
      expect(result.status.name, 'accepted');
    });

    test('rate POSTs stars and omits review when null', () async {
      late Map<String, dynamic> sentBody;
      final mock = MockClient((request) async {
        sentBody = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      await repo.rate('p1', 5, null, 'tok1');

      expect(sentBody, {'stars': 5});
    });
  });
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `cd apps/mobile_flutter && flutter test test/trades/rest_trades_repository_test.dart`
Expected: PASS.

- [ ] **Step 7: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: no issues.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile_flutter/lib/trades/trades_repository.dart apps/mobile_flutter/lib/trades/rest_trades_repository.dart apps/mobile_flutter/lib/trades/trades_providers.dart apps/mobile_flutter/test/support/fake_trades_repository.dart apps/mobile_flutter/test/trades/rest_trades_repository_test.dart
git commit -m "Add TradesRepository (mine/byId/propose/accept/decline/counter/cancel/confirm/rate)"
```

---

## Track B2: MessagesRepository

**Files:**

- Create: `apps/mobile_flutter/lib/trades/messages_repository.dart`
- Create: `apps/mobile_flutter/lib/trades/rest_messages_repository.dart`
- Create: `apps/mobile_flutter/lib/trades/messages_providers.dart`
- Create: `apps/mobile_flutter/test/support/fake_messages_repository.dart`
- Test: `apps/mobile_flutter/test/trades/rest_messages_repository_test.dart`

- [ ] **Step 1: `messages_repository.dart`**

```dart
import 'models/trade_message.dart';

abstract class MessagesRepository {
  Future<List<TradeMessage>> list(String proposalId, String accessToken);
  Future<TradeMessage> send(String proposalId, String body, String accessToken);
  Future<int> markRead(String proposalId, String accessToken);
  Future<int> unreadCount(String accessToken);
}
```

- [ ] **Step 2: `rest_messages_repository.dart`**

```dart
import '../core/api_client.dart';
import 'messages_repository.dart';
import 'models/trade_message.dart';

class RestMessagesRepository implements MessagesRepository {
  RestMessagesRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<TradeMessage>> list(String proposalId, String accessToken) async {
    final json = await _client.getList(
      '/mobile/trades/$proposalId/messages',
      accessToken: accessToken,
    );
    return json.map((m) => TradeMessage.fromJson(m as Map<String, dynamic>)).toList();
  }

  @override
  Future<TradeMessage> send(String proposalId, String body, String accessToken) async {
    final json = await _client.post(
      '/mobile/trades/$proposalId/messages',
      {'body': body},
      accessToken: accessToken,
    );
    return TradeMessage.fromJson(json);
  }

  @override
  Future<int> markRead(String proposalId, String accessToken) async {
    final json = await _client.post(
      '/mobile/trades/$proposalId/read',
      const {},
      accessToken: accessToken,
    );
    return json['count'] as int;
  }

  @override
  Future<int> unreadCount(String accessToken) async {
    final json = await _client.get('/mobile/trades/unread-count', accessToken: accessToken);
    return json['count'] as int;
  }
}
```

- [ ] **Step 3: `messages_providers.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'messages_repository.dart';
import 'rest_messages_repository.dart';

final messagesRepositoryProvider = Provider<MessagesRepository>(
  (ref) => RestMessagesRepository(ref.watch(apiClientProvider)),
);
```

- [ ] **Step 4: `test/support/fake_messages_repository.dart`**

```dart
import 'package:garage_sale_mobile/trades/messages_repository.dart';
import 'package:garage_sale_mobile/trades/models/trade_message.dart';

class FakeMessagesRepository implements MessagesRepository {
  FakeMessagesRepository({List<TradeMessage> messages = const [], int unread = 0})
    : _messages = List.of(messages),
      _unread = unread;

  final List<TradeMessage> _messages;
  int _unread;
  int markReadCalls = 0;
  String? lastSentBody;

  @override
  Future<List<TradeMessage>> list(String proposalId, String accessToken) async {
    return List.of(_messages);
  }

  @override
  Future<TradeMessage> send(String proposalId, String body, String accessToken) async {
    lastSentBody = body;
    final message = TradeMessage(
      id: 'new-${_messages.length}',
      proposalId: proposalId,
      senderId: 'me',
      senderName: 'Me',
      body: body,
      createdAt: DateTime.utc(2026, 7, 15),
    );
    _messages.add(message);
    return message;
  }

  @override
  Future<int> markRead(String proposalId, String accessToken) async {
    markReadCalls++;
    final count = _unread;
    _unread = 0;
    return count;
  }

  @override
  Future<int> unreadCount(String accessToken) async => _unread;
}
```

- [ ] **Step 5: `test/trades/rest_messages_repository_test.dart`**

```dart
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/trades/rest_messages_repository.dart';

void main() {
  group('RestMessagesRepository', () {
    test('list GETs the thread and decodes messages', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/trades/p1/messages');
        return http.Response(
          jsonEncode([
            {
              'id': 'm1',
              'proposalId': 'p1',
              'senderId': 'u1',
              'sender': {'id': 'u1', 'displayName': 'Alice'},
              'body': 'Hi',
              'createdAt': '2026-07-15T10:00:00.000Z',
              'readAt': null,
            },
          ]),
          200,
        );
      });
      final repo = RestMessagesRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final result = await repo.list('p1', 'tok1');

      expect(result, hasLength(1));
      expect(result.first.senderName, 'Alice');
    });

    test('send POSTs the body', () async {
      late Map<String, dynamic> sentBody;
      final mock = MockClient((request) async {
        sentBody = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({
            'id': 'm2',
            'proposalId': 'p1',
            'senderId': 'u1',
            'sender': {'id': 'u1', 'displayName': 'Alice'},
            'body': 'Sounds good',
            'createdAt': '2026-07-15T10:05:00.000Z',
            'readAt': null,
          }),
          200,
        );
      });
      final repo = RestMessagesRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final message = await repo.send('p1', 'Sounds good', 'tok1');

      expect(sentBody, {'body': 'Sounds good'});
      expect(message.body, 'Sounds good');
    });

    test('markRead POSTs to /read and decodes count', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/trades/p1/read');
        return http.Response(jsonEncode({'count': 2}), 200);
      });
      final repo = RestMessagesRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final count = await repo.markRead('p1', 'tok1');

      expect(count, 2);
    });

    test('unreadCount GETs /mobile/trades/unread-count', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/trades/unread-count');
        return http.Response(jsonEncode({'count': 5}), 200);
      });
      final repo = RestMessagesRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      expect(await repo.unreadCount('tok1'), 5);
    });
  });
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `cd apps/mobile_flutter && flutter test test/trades/rest_messages_repository_test.dart`
Expected: PASS.

- [ ] **Step 7: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: no issues.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile_flutter/lib/trades/messages_repository.dart apps/mobile_flutter/lib/trades/rest_messages_repository.dart apps/mobile_flutter/lib/trades/messages_providers.dart apps/mobile_flutter/test/support/fake_messages_repository.dart apps/mobile_flutter/test/trades/rest_messages_repository_test.dart
git commit -m "Add MessagesRepository (list/send/markRead/unreadCount)"
```

---

## Track B3: BlocksRepository + ReportsRepository

**Files:**

- Create: `apps/mobile_flutter/lib/trades/blocks_repository.dart`
- Create: `apps/mobile_flutter/lib/trades/rest_blocks_repository.dart`
- Create: `apps/mobile_flutter/lib/trades/reports_repository.dart`
- Create: `apps/mobile_flutter/lib/trades/rest_reports_repository.dart`
- Create: `apps/mobile_flutter/lib/trades/blocks_providers.dart`
- Create: `apps/mobile_flutter/test/support/fake_blocks_repository.dart`
- Create: `apps/mobile_flutter/test/support/fake_reports_repository.dart`
- Test: `apps/mobile_flutter/test/trades/rest_blocks_repository_test.dart`

- [ ] **Step 1: `blocks_repository.dart`**

```dart
import 'models/block_entry.dart';

abstract class BlocksRepository {
  Future<List<BlockEntry>> list(String accessToken);
  Future<bool> status(String userId, String accessToken);
  Future<void> block(String userId, String? reason, String accessToken);
  Future<void> unblock(String userId, String accessToken);
}
```

- [ ] **Step 2: `rest_blocks_repository.dart`**

```dart
import '../core/api_client.dart';
import 'blocks_repository.dart';
import 'models/block_entry.dart';

class RestBlocksRepository implements BlocksRepository {
  RestBlocksRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<BlockEntry>> list(String accessToken) async {
    final json = await _client.getList('/mobile/blocks', accessToken: accessToken);
    return json.map((b) => BlockEntry.fromJson(b as Map<String, dynamic>)).toList();
  }

  @override
  Future<bool> status(String userId, String accessToken) async {
    final json = await _client.get('/mobile/blocks/$userId', accessToken: accessToken);
    return json['blocked'] as bool;
  }

  @override
  Future<void> block(String userId, String? reason, String accessToken) async {
    await _client.post(
      '/mobile/blocks',
      {'userId': userId, if (reason != null) 'reason': reason},
      accessToken: accessToken,
    );
  }

  @override
  Future<void> unblock(String userId, String accessToken) async {
    await _client.delete('/mobile/blocks/$userId', accessToken: accessToken);
  }
}
```

- [ ] **Step 3: `reports_repository.dart`**

```dart
abstract class ReportsRepository {
  Future<void> report(String targetType, String targetId, String reason, String accessToken);
}
```

- [ ] **Step 4: `rest_reports_repository.dart`**

```dart
import '../core/api_client.dart';
import 'reports_repository.dart';

class RestReportsRepository implements ReportsRepository {
  RestReportsRepository(this._client);
  final ApiClient _client;

  @override
  Future<void> report(
    String targetType,
    String targetId,
    String reason,
    String accessToken,
  ) async {
    await _client.post(
      '/mobile/reports',
      {'targetType': targetType, 'targetId': targetId, 'reason': reason},
      accessToken: accessToken,
    );
  }
}
```

- [ ] **Step 5: `blocks_providers.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'blocks_repository.dart';
import 'reports_repository.dart';
import 'rest_blocks_repository.dart';
import 'rest_reports_repository.dart';

final blocksRepositoryProvider = Provider<BlocksRepository>(
  (ref) => RestBlocksRepository(ref.watch(apiClientProvider)),
);

final reportsRepositoryProvider = Provider<ReportsRepository>(
  (ref) => RestReportsRepository(ref.watch(apiClientProvider)),
);
```

- [ ] **Step 6: `test/support/fake_blocks_repository.dart`**

```dart
import 'package:garage_sale_mobile/trades/blocks_repository.dart';
import 'package:garage_sale_mobile/trades/models/block_entry.dart';

class FakeBlocksRepository implements BlocksRepository {
  FakeBlocksRepository({List<BlockEntry> entries = const [], Set<String> blockedIds = const {}})
    : _entries = List.of(entries),
      _blockedIds = Set.of(blockedIds);

  final List<BlockEntry> _entries;
  final Set<String> _blockedIds;
  int unblockCalls = 0;

  @override
  Future<List<BlockEntry>> list(String accessToken) async => List.of(_entries);

  @override
  Future<bool> status(String userId, String accessToken) async => _blockedIds.contains(userId);

  @override
  Future<void> block(String userId, String? reason, String accessToken) async {
    _blockedIds.add(userId);
  }

  @override
  Future<void> unblock(String userId, String accessToken) async {
    unblockCalls++;
    _blockedIds.remove(userId);
    _entries.removeWhere((e) => e.blockedUserId == userId);
  }
}
```

- [ ] **Step 7: `test/support/fake_reports_repository.dart`**

```dart
import 'package:garage_sale_mobile/trades/reports_repository.dart';

class FakeReportsRepository implements ReportsRepository {
  String? lastTargetType;
  String? lastTargetId;
  String? lastReason;

  @override
  Future<void> report(
    String targetType,
    String targetId,
    String reason,
    String accessToken,
  ) async {
    lastTargetType = targetType;
    lastTargetId = targetId;
    lastReason = reason;
  }
}
```

- [ ] **Step 8: `test/trades/rest_blocks_repository_test.dart`**

```dart
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/trades/rest_blocks_repository.dart';

void main() {
  group('RestBlocksRepository', () {
    test('list GETs /mobile/blocks and decodes entries', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/blocks');
        return http.Response(
          jsonEncode([
            {
              'id': 'b1',
              'reason': null,
              'createdAt': '2026-07-15T10:00:00.000Z',
              'blocked': {'id': 'u3', 'displayName': 'Carol'},
            },
          ]),
          200,
        );
      });
      final repo = RestBlocksRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final result = await repo.list('tok1');

      expect(result, hasLength(1));
      expect(result.first.blockedUserName, 'Carol');
    });

    test('status GETs /mobile/blocks/:userId', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/blocks/u3');
        return http.Response(jsonEncode({'blocked': true}), 200);
      });
      final repo = RestBlocksRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      expect(await repo.status('u3', 'tok1'), isTrue);
    });

    test('unblock DELETEs /mobile/blocks/:userId', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestBlocksRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.unblock('u3', 'tok1');

      expect(captured.method, 'DELETE');
      expect(captured.url.path, '/api/mobile/blocks/u3');
    });
  });
}
```

- [ ] **Step 9: Run tests, verify pass**

Run: `cd apps/mobile_flutter && flutter test test/trades/rest_blocks_repository_test.dart`
Expected: PASS.

- [ ] **Step 10: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: no issues.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile_flutter/lib/trades/blocks_repository.dart apps/mobile_flutter/lib/trades/rest_blocks_repository.dart apps/mobile_flutter/lib/trades/reports_repository.dart apps/mobile_flutter/lib/trades/rest_reports_repository.dart apps/mobile_flutter/lib/trades/blocks_providers.dart apps/mobile_flutter/test/support/fake_blocks_repository.dart apps/mobile_flutter/test/support/fake_reports_repository.dart apps/mobile_flutter/test/trades/rest_blocks_repository_test.dart
git commit -m "Add BlocksRepository and ReportsRepository"
```

---

# Wave 3 — 3 parallel tracks (depend on Wave 2 merged)

## Track C1: TradesController + TradeDetailController

**Files:**

- Create: `apps/mobile_flutter/lib/trades/trades_controller.dart`
- Create: `apps/mobile_flutter/lib/trades/trade_detail_controller.dart`
- Test: `apps/mobile_flutter/test/trades/trades_controller_test.dart`
- Test: `apps/mobile_flutter/test/trades/trade_detail_controller_test.dart`

Follows `apps/mobile_flutter/lib/listings/my_listings_controller.dart`'s exact shape: `AsyncNotifier` with a private `_load()`, mutating methods `await future;` first, then `state = const AsyncLoading(); state = await AsyncValue.guard(_load);`. `TradeDetailController` is a **family** notifier (one instance per proposal id), matching the family-provider need that F1's `listing_detail_provider.dart` didn't have to solve (that one was read-only).

- [ ] **Step 1: `trades_controller.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'models/proposal.dart';
import 'trades_providers.dart';

class TradesController extends AsyncNotifier<List<Proposal>> {
  TradesRepository get _repo => ref.read(tradesRepositoryProvider);

  @override
  Future<List<Proposal>> build() => _load();

  Future<List<Proposal>> _load() async {
    final token = await requireAccessToken(ref);
    return _repo.mine(token);
  }

  /// Creates a new proposal and returns it (caller navigates to its detail).
  Future<Proposal> propose(String listingId, List<String> offeredListingIds) async {
    await future;
    final token = await requireAccessToken(ref);
    final created = await _repo.propose(listingId, offeredListingIds, token);
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
    return created;
  }

  Future<void> refresh() async {
    await future;
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }
}

final tradesControllerProvider = AsyncNotifierProvider<TradesController, List<Proposal>>(
  TradesController.new,
);
```

Note the import `trades_providers.dart` re-exports `TradesRepository` transitively (Dart doesn't require re-importing a type used only in a signature already imported by an imported file's public API) — if `flutter analyze` flags an unused/missing import for `TradesRepository`, add `import 'trades_repository.dart';` explicitly; both are harmless.

- [ ] **Step 2: `trade_detail_controller.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'models/proposal.dart';
import 'trades_controller.dart';
import 'trades_providers.dart';
import 'trades_repository.dart';

class TradeDetailController extends FamilyAsyncNotifier<Proposal, String> {
  TradesRepository get _repo => ref.read(tradesRepositoryProvider);

  @override
  Future<Proposal> build(String arg) => _load(arg);

  Future<Proposal> _load(String id) async {
    final token = await requireAccessToken(ref);
    return _repo.byId(id, token);
  }

  Future<void> accept() async {
    await future;
    final token = await requireAccessToken(ref);
    await _repo.accept(arg, token);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _load(arg));
    ref.invalidate(tradesControllerProvider);
  }

  Future<void> decline() async {
    await future;
    final token = await requireAccessToken(ref);
    await _repo.decline(arg, token);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _load(arg));
    ref.invalidate(tradesControllerProvider);
  }

  Future<void> cancel() async {
    await future;
    final token = await requireAccessToken(ref);
    await _repo.cancel(arg, token);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _load(arg));
    ref.invalidate(tradesControllerProvider);
  }

  Future<void> confirm() async {
    await future;
    final token = await requireAccessToken(ref);
    await _repo.confirm(arg, token);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _load(arg));
    ref.invalidate(tradesControllerProvider);
  }

  Future<void> rate(int stars, String? review) async {
    await future;
    final token = await requireAccessToken(ref);
    await _repo.rate(arg, stars, review, token);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _load(arg));
  }

  /// Counters this proposal, returning the id of the newly created proposal.
  /// The old proposal (this controller's `arg`) is now COUNTERED — callers
  /// must navigate to the returned id, not just refresh this instance.
  Future<String> counter(List<String> offeredListingIds) async {
    await future;
    final token = await requireAccessToken(ref);
    final newProposal = await _repo.counter(arg, offeredListingIds, token);
    ref.invalidate(tradesControllerProvider);
    return newProposal.id;
  }
}

final tradeDetailControllerProvider =
    AsyncNotifierProvider.family<TradeDetailController, Proposal, String>(
      TradeDetailController.new,
    );
```

- [ ] **Step 3: `test/trades/trades_controller_test.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/models/proposal_status.dart';
import 'package:garage_sale_mobile/trades/trades_controller.dart';
import 'package:garage_sale_mobile/trades/trades_providers.dart';

import '../support/fake_trades_repository.dart';
import '../support/in_memory_key_value_store.dart';

Proposal _proposal(String id) => Proposal(
  id: id,
  listingId: 'l1',
  listing: _listing(),
  proposerId: 'u1',
  proposerName: 'Alice',
  ownerId: 'u2',
  ownerName: 'Bob',
  status: ProposalStatus.proposed,
  items: const [],
  confirmations: const [],
  ratings: const [],
  createdAt: DateTime.utc(2026, 7, 15),
);

// Reuses Listing's real fromJson to build a minimal valid instance without
// depending on a Listing-specific test factory that may not exist yet.
// ignore: unused_element
dynamic _listing() {
  // ignore: avoid_dynamic_calls
  return const _MinimalListing();
}

void main() {
  group('TradesController', () {
    late ProviderContainer container;

    setUp(() async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));
      container = ProviderContainer(
        overrides: [
          tradesRepositoryProvider.overrideWithValue(
            FakeTradesRepository(proposals: [_proposal('p1')]),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
    });

    test('build loads the caller\'s proposals', () async {
      final result = await container.read(tradesControllerProvider.future);
      expect(result, hasLength(1));
      expect(result.first.id, 'p1');
    });

    test('refresh reloads after the initial build resolves', () async {
      await container.read(tradesControllerProvider.future);
      await container.read(tradesControllerProvider.notifier).refresh();
      expect(container.read(tradesControllerProvider).value, hasLength(1));
    });
  });
}
```

This test references a `_MinimalListing` placeholder — replace it with the real `Listing` constructor before running, matching `lib/listings/models/listing.dart`'s actual required fields (see Wave 1 Track B0's `proposal_test.dart` for the full field list to copy). Do not leave `_MinimalListing`/`_listing()` in the final file — this note exists only to flag that the test's `Proposal` fixture must use the real `Listing` class, not a stub.

- [ ] **Step 4: Fix the test's Listing fixture, then run tests**

Replace the `_listing()`/`_MinimalListing` scaffolding in `trades_controller_test.dart` with:

```dart
import 'package:garage_sale_mobile/listings/models/listing.dart';

Listing _listing() => const Listing(
  id: 'l1',
  ownerId: 'owner1',
  type: ListingType.have,
  title: 'Bike',
  description: 'Road bike',
  condition: Condition.good,
  categoryId: 'cat1',
  status: ListingStatus.active,
  photos: [],
);
```

(remove the `dynamic _listing()` stub and the `_MinimalListing` reference entirely).

Run: `cd apps/mobile_flutter && flutter test test/trades/trades_controller_test.dart`
Expected: PASS.

- [ ] **Step 5: `test/trades/trade_detail_controller_test.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/models/proposal_status.dart';
import 'package:garage_sale_mobile/trades/trade_detail_controller.dart';
import 'package:garage_sale_mobile/trades/trades_controller.dart';
import 'package:garage_sale_mobile/trades/trades_providers.dart';

import '../support/fake_trades_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _listing() => const Listing(
  id: 'l1',
  ownerId: 'owner1',
  type: ListingType.have,
  title: 'Bike',
  description: 'Road bike',
  condition: Condition.good,
  categoryId: 'cat1',
  status: ListingStatus.active,
  photos: [],
);

Proposal _proposal({String status = 'PROPOSED'}) => Proposal(
  id: 'p1',
  listingId: 'l1',
  listing: _listing(),
  proposerId: 'u1',
  proposerName: 'Alice',
  ownerId: 'u2',
  ownerName: 'Bob',
  status: ProposalStatus.values.firstWhere((s) => s.name.toUpperCase() == status.toUpperCase() ||
      (status == 'PROPOSED' && s == ProposalStatus.proposed)),
  items: const [],
  confirmations: const [],
  ratings: const [],
  createdAt: DateTime.utc(2026, 7, 15),
);

void main() {
  group('TradeDetailController', () {
    late ProviderContainer container;
    late FakeTradesRepository fakeRepo;

    setUp(() async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));
      fakeRepo = FakeTradesRepository(proposals: [_proposal()]);
      container = ProviderContainer(
        overrides: [
          tradesRepositoryProvider.overrideWithValue(fakeRepo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
    });

    test('build loads the proposal by id', () async {
      final result = await container.read(tradeDetailControllerProvider('p1').future);
      expect(result.id, 'p1');
    });

    test('accept calls the repository once and invalidates the list', () async {
      await container.read(tradeDetailControllerProvider('p1').future);
      await container.read(tradeDetailControllerProvider('p1').notifier).accept();
      expect(fakeRepo.acceptCalls, 1);
    });

    test('rate calls the repository with stars and review', () async {
      await container.read(tradeDetailControllerProvider('p1').future);
      await container.read(tradeDetailControllerProvider('p1').notifier).rate(5, 'Great trade');
      expect(fakeRepo.lastRateStars, 5);
      expect(fakeRepo.lastRateReview, ['Great trade']);
    });
  });
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `cd apps/mobile_flutter && flutter test test/trades/trade_detail_controller_test.dart`
Expected: PASS.

- [ ] **Step 7: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: no issues. If `FamilyAsyncNotifier`/`AsyncNotifierProvider.family` isn't recognized by the pinned `flutter_riverpod: ^2.5.1`, check `flutter pub deps flutter_riverpod` for the exact class name available in that version (it may be `AutoDisposeFamilyAsyncNotifier` or require `.autoDispose.family` chaining instead) and adjust both files' class signature to match — the behavior (family-keyed AsyncNotifier) is what matters, not the exact generic spelling.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile_flutter/lib/trades/trades_controller.dart apps/mobile_flutter/lib/trades/trade_detail_controller.dart apps/mobile_flutter/test/trades/trades_controller_test.dart apps/mobile_flutter/test/trades/trade_detail_controller_test.dart
git commit -m "Add TradesController and TradeDetailController"
```

---

## Track C2: MessagesController

**Files:**

- Create: `apps/mobile_flutter/lib/trades/messages_controller.dart`
- Test: `apps/mobile_flutter/test/trades/messages_controller_test.dart`

Family `AsyncNotifier` keyed by `proposalId`. On build, loads the thread **and** fires `markRead` best-effort (matching the web `TradeThread.tsx` behavior added just before this plan — see Context section) — swallow markRead errors so a network blip on the read-receipt call never blocks the thread from rendering.

- [ ] **Step 1: `messages_controller.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'messages_providers.dart';
import 'messages_repository.dart';
import 'models/trade_message.dart';

class MessagesController extends FamilyAsyncNotifier<List<TradeMessage>, String> {
  MessagesRepository get _repo => ref.read(messagesRepositoryProvider);

  @override
  Future<List<TradeMessage>> build(String arg) => _load(arg);

  Future<List<TradeMessage>> _load(String proposalId) async {
    final token = await requireAccessToken(ref);
    final messages = await _repo.list(proposalId, token);
    // Fire-and-forget, mirrors web TradeThread.tsx: opening the thread marks
    // the other party's unread messages read; a failure here must not block
    // the thread from rendering.
    unawaited(_repo.markRead(proposalId, token).catchError((_) => 0));
    return messages;
  }

  Future<void> send(String body) async {
    await future;
    final token = await requireAccessToken(ref);
    await _repo.send(arg, body, token);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _load(arg));
  }
}

final messagesControllerProvider =
    AsyncNotifierProvider.family<MessagesController, List<TradeMessage>, String>(
      MessagesController.new,
    );
```

`unawaited` needs `import 'dart:async';` — add it to the top of the file alongside the other imports.

- [ ] **Step 2: `test/trades/messages_controller_test.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/trades/messages_controller.dart';
import 'package:garage_sale_mobile/trades/messages_providers.dart';
import 'package:garage_sale_mobile/trades/models/trade_message.dart';

import '../support/fake_messages_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  group('MessagesController', () {
    late ProviderContainer container;
    late FakeMessagesRepository fakeRepo;

    setUp(() async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));
      fakeRepo = FakeMessagesRepository(
        messages: [
          TradeMessage(
            id: 'm1',
            proposalId: 'p1',
            senderId: 'u2',
            senderName: 'Bob',
            body: 'Hi',
            createdAt: DateTime.utc(2026, 7, 15),
          ),
        ],
        unread: 1,
      );
      container = ProviderContainer(
        overrides: [
          messagesRepositoryProvider.overrideWithValue(fakeRepo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
    });

    test('build loads the thread and marks it read', () async {
      final result = await container.read(messagesControllerProvider('p1').future);
      expect(result, hasLength(1));
      // markRead is fired-and-forgotten inside _load; give it a tick to run.
      await Future<void>.delayed(Duration.zero);
      expect(fakeRepo.markReadCalls, 1);
    });

    test('send posts the body and reloads the thread', () async {
      await container.read(messagesControllerProvider('p1').future);
      await container.read(messagesControllerProvider('p1').notifier).send('New message');
      expect(fakeRepo.lastSentBody, 'New message');
      final result = container.read(messagesControllerProvider('p1')).value;
      expect(result, hasLength(2));
    });
  });
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `cd apps/mobile_flutter && flutter test test/trades/messages_controller_test.dart`
Expected: PASS.

- [ ] **Step 4: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: no issues.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/trades/messages_controller.dart apps/mobile_flutter/test/trades/messages_controller_test.dart
git commit -m "Add MessagesController (thread load + auto mark-read + send)"
```

---

## Track C3: BlocksController + block-status provider

**Files:**

- Create: `apps/mobile_flutter/lib/trades/blocks_controller.dart`
- Test: `apps/mobile_flutter/test/trades/blocks_controller_test.dart`

- [ ] **Step 1: `blocks_controller.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'blocks_providers.dart';
import 'blocks_repository.dart';
import 'models/block_entry.dart';

class BlocksController extends AsyncNotifier<List<BlockEntry>> {
  BlocksRepository get _repo => ref.read(blocksRepositoryProvider);

  @override
  Future<List<BlockEntry>> build() => _load();

  Future<List<BlockEntry>> _load() async {
    final token = await requireAccessToken(ref);
    return _repo.list(token);
  }

  Future<void> unblock(String userId) async {
    await future;
    final token = await requireAccessToken(ref);
    await _repo.unblock(userId, token);
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }
}

final blocksControllerProvider = AsyncNotifierProvider<BlocksController, List<BlockEntry>>(
  BlocksController.new,
);

/// Whether the caller has blocked (or been blocked by — the backend checks
/// both directions) the given user. Used by TradeDetailScreen to decide
/// whether to show "Block" or "Unblock".
final blockStatusProvider = FutureProvider.family<bool, String>((ref, userId) async {
  final token = await requireAccessToken(ref);
  return ref.read(blocksRepositoryProvider).status(userId, token);
});

/// Blocks a user, invalidating [blockStatusProvider] and [blocksControllerProvider]
/// so both the thread's button state and the Blocked-traders list refresh.
Future<void> blockUser(WidgetRef ref, String userId, String? reason) async {
  final token = await requireAccessToken(ref);
  await ref.read(blocksRepositoryProvider).block(userId, reason, token);
  ref.invalidate(blockStatusProvider(userId));
  ref.invalidate(blocksControllerProvider);
}
```

`blockUser` takes a `WidgetRef` (not `Ref`) since it's called directly from `TradeDetailScreen` (a `ConsumerWidget`), not from inside another controller — add `import 'package:flutter_riverpod/flutter_riverpod.dart';` already covers `WidgetRef` (re-exported by the same package), no extra import needed.

- [ ] **Step 2: `test/trades/blocks_controller_test.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/trades/blocks_controller.dart';
import 'package:garage_sale_mobile/trades/blocks_providers.dart';
import 'package:garage_sale_mobile/trades/models/block_entry.dart';

import '../support/fake_blocks_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  group('BlocksController', () {
    late ProviderContainer container;
    late FakeBlocksRepository fakeRepo;

    setUp(() async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));
      fakeRepo = FakeBlocksRepository(
        entries: [
          BlockEntry(
            id: 'b1',
            blockedUserId: 'u3',
            blockedUserName: 'Carol',
            createdAt: DateTime.utc(2026, 7, 15),
          ),
        ],
        blockedIds: {'u3'},
      );
      container = ProviderContainer(
        overrides: [
          blocksRepositoryProvider.overrideWithValue(fakeRepo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
    });

    test('build loads blocked users', () async {
      final result = await container.read(blocksControllerProvider.future);
      expect(result, hasLength(1));
      expect(result.first.blockedUserName, 'Carol');
    });

    test('unblock removes the entry and calls the repository', () async {
      await container.read(blocksControllerProvider.future);
      await container.read(blocksControllerProvider.notifier).unblock('u3');
      expect(fakeRepo.unblockCalls, 1);
      expect(container.read(blocksControllerProvider).value, isEmpty);
    });

    test('blockStatusProvider reflects the repository', () async {
      final blocked = await container.read(blockStatusProvider('u3').future);
      expect(blocked, isTrue);
      final notBlocked = await container.read(blockStatusProvider('u9').future);
      expect(notBlocked, isFalse);
    });
  });
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `cd apps/mobile_flutter && flutter test test/trades/blocks_controller_test.dart`
Expected: PASS.

- [ ] **Step 4: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: no issues.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/trades/blocks_controller.dart apps/mobile_flutter/test/trades/blocks_controller_test.dart
git commit -m "Add BlocksController and blockStatusProvider"
```

---

# Wave 4 — 4 parallel tracks (depend on Wave 3 merged)

## Track D1: TradesScreen (list)

**Files:**

- Create: `apps/mobile_flutter/lib/screens/trades_screen.dart`
- Test: `apps/mobile_flutter/test/widget/trades_screen_test.dart`

Mirrors `apps/mobile_flutter/lib/screens/watchlist_screen.dart`'s shape: `ConsumerWidget`, `ref.watch(...)`, `AsyncValue.when`, deterministic `Key`s per row for widget-test targeting.

- [ ] **Step 1: `trades_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../trades/models/proposal_status.dart';
import '../trades/trades_controller.dart';

class TradesScreen extends ConsumerWidget {
  const TradesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final proposals = ref.watch(tradesControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Trades')),
      body: proposals.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load trades: $error')),
        data: (items) {
          if (items.isEmpty) {
            return const Center(child: Text('No trades yet.'));
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(tradesControllerProvider.notifier).refresh(),
            child: ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final proposal = items[index];
                return ListTile(
                  key: Key('trade_tile_${proposal.id}'),
                  title: Text(proposal.listing.title),
                  subtitle: Text(_statusLabel(proposal.status)),
                  onTap: () => context.push('/trades/${proposal.id}'),
                );
              },
            ),
          );
        },
      ),
    );
  }

  String _statusLabel(ProposalStatus status) {
    switch (status) {
      case ProposalStatus.proposed:
        return 'Proposed';
      case ProposalStatus.accepted:
        return 'Accepted';
      case ProposalStatus.declined:
        return 'Declined';
      case ProposalStatus.countered:
        return 'Countered';
      case ProposalStatus.cancelled:
        return 'Cancelled';
      case ProposalStatus.completed:
        return 'Completed';
    }
  }
}
```

- [ ] **Step 2: `test/widget/trades_screen_test.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/screens/trades_screen.dart';
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/models/proposal_status.dart';
import 'package:garage_sale_mobile/trades/trades_providers.dart';

import '../support/fake_trades_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _listing() => const Listing(
  id: 'l1',
  ownerId: 'owner1',
  type: ListingType.have,
  title: 'Bike',
  description: 'Road bike',
  condition: Condition.good,
  categoryId: 'cat1',
  status: ListingStatus.active,
  photos: [],
);

void main() {
  testWidgets('TradesScreen renders proposals and navigates on tap', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));

    final proposal = Proposal(
      id: 'p1',
      listingId: 'l1',
      listing: _listing(),
      proposerId: 'u1',
      proposerName: 'Alice',
      ownerId: 'u2',
      ownerName: 'Bob',
      status: ProposalStatus.proposed,
      items: const [],
      confirmations: const [],
      ratings: const [],
      createdAt: DateTime.utc(2026, 7, 15),
    );

    var pushed = '';
    final router = GoRouter(
      initialLocation: '/trades',
      routes: [
        GoRoute(
          path: '/trades',
          builder: (context, state) => const TradesScreen(),
        ),
        GoRoute(
          path: '/trades/:id',
          builder: (context, state) {
            pushed = state.pathParameters['id']!;
            return const SizedBox();
          },
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tradesRepositoryProvider.overrideWithValue(
            FakeTradesRepository(proposals: [proposal]),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bike'), findsOneWidget);
    expect(find.text('Proposed'), findsOneWidget);

    await tester.tap(find.byKey(const Key('trade_tile_p1')));
    await tester.pumpAndSettle();

    expect(pushed, 'p1');
  });
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `cd apps/mobile_flutter && flutter test test/widget/trades_screen_test.dart`
Expected: PASS.

- [ ] **Step 4: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: no issues.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/screens/trades_screen.dart apps/mobile_flutter/test/widget/trades_screen_test.dart
git commit -m "Add TradesScreen"
```

---

## Track D2: TradeDetailScreen

**Files:**

- Create: `apps/mobile_flutter/lib/screens/trade_detail_screen.dart`
- Test: `apps/mobile_flutter/test/widget/trade_detail_screen_test.dart`

The biggest screen — status-driven action buttons (mirroring RN `TradeDetailScreen.tsx`), inline message list + composer, star rating once `COMPLETED`, report dialog, block/unblock button.

- [ ] **Step 1: `trade_detail_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/providers.dart';
import '../trades/blocks_controller.dart';
import '../trades/messages_controller.dart';
import '../trades/models/proposal.dart';
import '../trades/models/proposal_status.dart';
import '../trades/reports_repository.dart';
import '../trades/trade_detail_controller.dart';
import '../core/require_token.dart';

class TradeDetailScreen extends ConsumerStatefulWidget {
  const TradeDetailScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<TradeDetailScreen> createState() => _TradeDetailScreenState();
}

class _TradeDetailScreenState extends ConsumerState<TradeDetailScreen> {
  final _messageController = TextEditingController();
  int _ratingStars = 5;
  final _reviewController = TextEditingController();

  @override
  void dispose() {
    _messageController.dispose();
    _reviewController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final proposalAsync = ref.watch(tradeDetailControllerProvider(widget.id));
    final sessionAsync = ref.watch(authControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Trade')),
      body: proposalAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load trade: $error')),
        data: (proposal) {
          final me = sessionAsync.value?.id;
          final isOwner = me == proposal.ownerId;
          final otherUserId = isOwner ? proposal.proposerId : proposal.ownerId;
          final otherUserName = isOwner ? proposal.proposerName : proposal.ownerName;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(proposal.listing.title, style: Theme.of(context).textTheme.titleLarge),
                Text('With $otherUserName'),
                const SizedBox(height: 8),
                Text('Status: ${proposal.status.name}'),
                const SizedBox(height: 16),
                Text('Offered items', style: Theme.of(context).textTheme.titleMedium),
                for (final item in proposal.items) Text('- ${item.listing.title}'),
                const SizedBox(height: 16),
                _buildActions(context, proposal, isOwner),
                const SizedBox(height: 16),
                _buildRating(context, proposal, me),
                const SizedBox(height: 16),
                _buildBlockButton(context, otherUserId),
                TextButton(
                  key: const Key('report_button'),
                  onPressed: () => _showReportDialog(context, otherUserId),
                  child: const Text('Report this trader'),
                ),
                const Divider(height: 32),
                Text('Messages', style: Theme.of(context).textTheme.titleMedium),
                _buildMessages(),
                _buildComposer(),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildActions(BuildContext context, Proposal proposal, bool isOwner) {
    final notifier = ref.read(tradeDetailControllerProvider(widget.id).notifier);
    final buttons = <Widget>[];

    if (proposal.status == ProposalStatus.proposed && isOwner) {
      buttons.add(
        ElevatedButton(
          key: const Key('accept_button'),
          onPressed: () => notifier.accept(),
          child: const Text('Accept'),
        ),
      );
      buttons.add(
        OutlinedButton(
          key: const Key('decline_button'),
          onPressed: () => notifier.decline(),
          child: const Text('Decline'),
        ),
      );
    }
    if (proposal.status == ProposalStatus.proposed) {
      buttons.add(
        OutlinedButton(
          key: const Key('counter_button'),
          onPressed: () => context.push('/trades/${widget.id}/counter'),
          child: const Text('Counter'),
        ),
      );
      buttons.add(
        TextButton(
          key: const Key('cancel_button'),
          onPressed: () => notifier.cancel(),
          child: const Text('Cancel'),
        ),
      );
    }
    if (proposal.status == ProposalStatus.accepted) {
      buttons.add(
        ElevatedButton(
          key: const Key('confirm_button'),
          onPressed: () => notifier.confirm(),
          child: const Text('Confirm trade complete'),
        ),
      );
      buttons.add(
        TextButton(
          key: const Key('cancel_button'),
          onPressed: () => notifier.cancel(),
          child: const Text('Cancel'),
        ),
      );
    }

    if (buttons.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 8, children: buttons);
  }

  Widget _buildRating(BuildContext context, Proposal proposal, String? me) {
    if (proposal.status != ProposalStatus.completed) return const SizedBox.shrink();
    final alreadyRated = proposal.ratings.any((r) => r.raterId == me);
    if (alreadyRated) return const Text('You rated this trade.');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Rate this trade', style: Theme.of(context).textTheme.titleMedium),
        Row(
          children: List.generate(5, (i) {
            final starValue = i + 1;
            return IconButton(
              key: Key('star_$starValue'),
              icon: Icon(
                starValue <= _ratingStars ? Icons.star : Icons.star_border,
              ),
              onPressed: () => setState(() => _ratingStars = starValue),
            );
          }),
        ),
        TextField(
          controller: _reviewController,
          decoration: const InputDecoration(labelText: 'Review (optional)'),
        ),
        ElevatedButton(
          key: const Key('submit_rating_button'),
          onPressed: () {
            ref.read(tradeDetailControllerProvider(widget.id).notifier).rate(
              _ratingStars,
              _reviewController.text.trim().isEmpty ? null : _reviewController.text.trim(),
            );
          },
          child: const Text('Submit rating'),
        ),
      ],
    );
  }

  Widget _buildBlockButton(BuildContext context, String otherUserId) {
    final blockedAsync = ref.watch(blockStatusProvider(otherUserId));
    return blockedAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (blocked) => OutlinedButton(
        key: const Key('block_button'),
        onPressed: () async {
          if (blocked) {
            final token = await requireAccessToken(ref);
            await ref.read(blocksControllerProvider.notifier).unblock(otherUserId);
            ref.invalidate(blockStatusProvider(otherUserId));
          } else {
            await blockUser(ref, otherUserId, null);
          }
        },
        child: Text(blocked ? 'Unblock trader' : 'Block trader'),
      ),
    );
  }

  Widget _buildMessages() {
    final messagesAsync = ref.watch(messagesControllerProvider(widget.id));
    return messagesAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(8),
        child: CircularProgressIndicator(),
      ),
      error: (error, _) => Text('Could not load messages: $error'),
      data: (messages) => Column(
        children: [
          for (final message in messages)
            ListTile(
              key: Key('message_${message.id}'),
              title: Text(message.body),
              subtitle: Text(message.senderName),
            ),
        ],
      ),
    );
  }

  Widget _buildComposer() {
    return Row(
      children: [
        Expanded(
          child: TextField(
            key: const Key('message_input'),
            controller: _messageController,
            decoration: const InputDecoration(hintText: 'Write a message'),
          ),
        ),
        IconButton(
          key: const Key('send_button'),
          icon: const Icon(Icons.send),
          onPressed: () {
            final body = _messageController.text.trim();
            if (body.isEmpty) return;
            ref.read(messagesControllerProvider(widget.id).notifier).send(body);
            _messageController.clear();
          },
        ),
      ],
    );
  }

  void _showReportDialog(BuildContext context, String targetUserId) {
    final reasonController = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Report trader'),
        content: TextField(
          key: const Key('report_reason_input'),
          controller: reasonController,
          decoration: const InputDecoration(hintText: 'Describe the issue'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            key: const Key('submit_report_button'),
            onPressed: () async {
              final reason = reasonController.text.trim();
              if (reason.isEmpty) return;
              final token = await requireAccessToken(ref);
              await ref
                  .read(reportsRepositoryProvider)
                  .report('USER', targetUserId, reason, token);
              if (dialogContext.mounted) Navigator.of(dialogContext).pop();
            },
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }
}
```

This screen reads `authControllerProvider` to determine "am I the owner or the proposer" — confirm the exact provider name and the shape of its resolved value (must expose an `id` field) by reading `apps/mobile_flutter/lib/auth/auth_controller.dart` and `apps/mobile_flutter/lib/auth/session_user.dart` before writing this file; adjust `sessionAsync.value?.id` to match whatever the real session-user accessor is called if it differs (e.g. `sessionAsync.value?.user.id`).

- [ ] **Step 2: `test/widget/trade_detail_screen_test.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/screens/trade_detail_screen.dart';
import 'package:garage_sale_mobile/trades/blocks_providers.dart';
import 'package:garage_sale_mobile/trades/messages_providers.dart';
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/models/proposal_status.dart';
import 'package:garage_sale_mobile/trades/reports_repository.dart';
import 'package:garage_sale_mobile/trades/trades_providers.dart';

import '../support/fake_blocks_repository.dart';
import '../support/fake_messages_repository.dart';
import '../support/fake_reports_repository.dart';
import '../support/fake_trades_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _listing() => const Listing(
  id: 'l1',
  ownerId: 'owner1',
  type: ListingType.have,
  title: 'Bike',
  description: 'Road bike',
  condition: Condition.good,
  categoryId: 'cat1',
  status: ListingStatus.locked,
  photos: [],
);

void main() {
  testWidgets('TradeDetailScreen shows accept/decline for the owner on a proposed trade', (
    tester,
  ) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));

    final proposal = Proposal(
      id: 'p1',
      listingId: 'l1',
      listing: _listing(),
      proposerId: 'u1',
      proposerName: 'Alice',
      ownerId: 'u2',
      ownerName: 'Bob',
      status: ProposalStatus.proposed,
      items: const [],
      confirmations: const [],
      ratings: const [],
      createdAt: DateTime.utc(2026, 7, 15),
    );

    final fakeTrades = FakeTradesRepository(proposals: [proposal]);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tradesRepositoryProvider.overrideWithValue(fakeTrades),
          messagesRepositoryProvider.overrideWithValue(FakeMessagesRepository()),
          blocksRepositoryProvider.overrideWithValue(FakeBlocksRepository()),
          reportsRepositoryProvider.overrideWithValue(FakeReportsRepository()),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: TradeDetailScreen(id: 'p1')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bike'), findsOneWidget);
    // Note: whether Accept/Decline render depends on the current signed-in
    // user matching proposal.ownerId, which is resolved via authControllerProvider
    // (not overridden here) — if this assertion fails, override
    // authControllerProvider with a fake session for user 'u2' (the owner)
    // matching whatever pattern login_screen_test.dart/app_flow_test.dart use
    // to fake an authenticated session.
    expect(find.byKey(const Key('accept_button')), findsOneWidget);

    await tester.tap(find.byKey(const Key('accept_button')));
    await tester.pumpAndSettle();

    expect(fakeTrades.acceptCalls, 1);
  });
}
```

- [ ] **Step 3: Fix the session-override gap flagged in Step 2, then run tests**

Read `apps/mobile_flutter/test/widget/app_flow_test.dart` (or `login_screen_test.dart`) for the established pattern of putting `authControllerProvider`/`sessionUserProvider` into a signed-in state for a specific user id in a widget test, and add the matching override to this test so `proposal.ownerId == 'u2'` actually matches the faked session. Adjust the override name/shape to whatever that file shows.

Run: `cd apps/mobile_flutter && flutter test test/widget/trade_detail_screen_test.dart`
Expected: PASS.

- [ ] **Step 4: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: no issues.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/screens/trade_detail_screen.dart apps/mobile_flutter/test/widget/trade_detail_screen_test.dart
git commit -m "Add TradeDetailScreen (actions, messaging, rating, report, block)"
```

---

## Track D3: ProposeTradeScreen

**Files:**

- Create: `apps/mobile_flutter/lib/screens/propose_trade_screen.dart`
- Test: `apps/mobile_flutter/test/widget/propose_trade_screen_test.dart`

Used both for a fresh proposal (`mode: propose`, target `listingId`) and a counter-offer (`mode: counter`, existing `proposalId`) — mirrors RN `ProposeTradeScreen.tsx`. Loads the caller's own listings via F1's existing `myListingsControllerProvider` and lets them multi-select which to offer.

- [ ] **Step 1: `propose_trade_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../listings/models/listing.dart';
import '../listings/my_listings_controller.dart';
import '../trades/trade_detail_controller.dart';
import '../trades/trades_controller.dart';

enum ProposeMode { propose, counter }

class ProposeTradeScreen extends ConsumerStatefulWidget {
  const ProposeTradeScreen({required this.mode, required this.targetId, super.key});

  /// For [ProposeMode.propose], the target listing id.
  /// For [ProposeMode.counter], the proposal id being countered.
  final ProposeMode mode;
  final String targetId;

  @override
  ConsumerState<ProposeTradeScreen> createState() => _ProposeTradeScreenState();
}

class _ProposeTradeScreenState extends ConsumerState<ProposeTradeScreen> {
  final Set<String> _selected = {};

  @override
  Widget build(BuildContext context) {
    final listingsAsync = ref.watch(myListingsControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.mode == ProposeMode.propose ? 'Propose trade' : 'Counter offer'),
      ),
      body: listingsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load your listings: $error')),
        data: (listings) {
          final active = listings.where((l) => l.status == ListingStatus.active).toList();
          if (active.isEmpty) {
            return const Center(child: Text('You have no active listings to offer.'));
          }
          return Column(
            children: [
              Expanded(
                child: ListView.builder(
                  itemCount: active.length,
                  itemBuilder: (context, index) {
                    final listing = active[index];
                    final checked = _selected.contains(listing.id);
                    return CheckboxListTile(
                      key: Key('offer_checkbox_${listing.id}'),
                      title: Text(listing.title),
                      value: checked,
                      onChanged: (value) {
                        setState(() {
                          if (value ?? false) {
                            _selected.add(listing.id);
                          } else {
                            _selected.remove(listing.id);
                          }
                        });
                      },
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: ElevatedButton(
                  key: const Key('submit_offer_button'),
                  onPressed: _selected.isEmpty ? null : _submit,
                  child: Text(widget.mode == ProposeMode.propose ? 'Send proposal' : 'Send counter'),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _submit() async {
    final offeredIds = _selected.toList();
    if (widget.mode == ProposeMode.propose) {
      final created = await ref
          .read(tradesControllerProvider.notifier)
          .propose(widget.targetId, offeredIds);
      if (mounted) context.pushReplacement('/trades/${created.id}');
    } else {
      final newId = await ref
          .read(tradeDetailControllerProvider(widget.targetId).notifier)
          .counter(offeredIds);
      if (mounted) context.pushReplacement('/trades/$newId');
    }
  }
}
```

- [ ] **Step 2: `test/widget/propose_trade_screen_test.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/listings_providers.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/screens/propose_trade_screen.dart';
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/models/proposal_status.dart';
import 'package:garage_sale_mobile/trades/trades_providers.dart';

import '../support/fake_listings_repository.dart';
import '../support/fake_trades_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _activeListing(String id, String title) => Listing(
  id: id,
  ownerId: 'me',
  type: ListingType.have,
  title: title,
  description: 'desc',
  condition: Condition.good,
  categoryId: 'cat1',
  status: ListingStatus.active,
  photos: const [],
);

void main() {
  testWidgets('ProposeTradeScreen (propose mode) submits selected listings', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));

    final myListing = _activeListing('l2', 'Skates');
    final createdProposal = Proposal(
      id: 'p-new',
      listingId: 'l1',
      listing: _activeListing('l1', 'Bike'),
      proposerId: 'me',
      proposerName: 'Me',
      ownerId: 'owner1',
      ownerName: 'Owner',
      status: ProposalStatus.proposed,
      items: const [],
      confirmations: const [],
      ratings: const [],
      createdAt: DateTime.utc(2026, 7, 15),
    );

    String? pushedPath;
    final router = GoRouter(
      initialLocation: '/trades/propose/l1',
      routes: [
        GoRoute(
          path: '/trades/propose/:listingId',
          builder: (context, state) => ProposeTradeScreen(
            mode: ProposeMode.propose,
            targetId: state.pathParameters['listingId']!,
          ),
        ),
        GoRoute(
          path: '/trades/:id',
          builder: (context, state) {
            pushedPath = state.pathParameters['id'];
            return const SizedBox();
          },
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          listingsRepositoryProvider.overrideWithValue(
            FakeListingsRepository(listings: [myListing]),
          ),
          tradesRepositoryProvider.overrideWithValue(
            FakeTradesRepository(proposals: [createdProposal]),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Skates'), findsOneWidget);

    await tester.tap(find.byKey(const Key('offer_checkbox_l2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('submit_offer_button')));
    await tester.pumpAndSettle();

    expect(pushedPath, 'p-new');
  });
}
```

Confirm the exact provider name (`listingsRepositoryProvider`) and fake class name (`FakeListingsRepository`) against `apps/mobile_flutter/lib/listings/providers.dart` and `apps/mobile_flutter/test/support/fake_listings_repository.dart` before running — adjust the import path/name in this test if F1 named them differently.

- [ ] **Step 3: Run tests, verify pass**

Run: `cd apps/mobile_flutter && flutter test test/widget/propose_trade_screen_test.dart`
Expected: PASS.

- [ ] **Step 4: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: no issues.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/screens/propose_trade_screen.dart apps/mobile_flutter/test/widget/propose_trade_screen_test.dart
git commit -m "Add ProposeTradeScreen (propose + counter modes)"
```

---

## Track D4: BlocksScreen

**Files:**

- Create: `apps/mobile_flutter/lib/screens/blocks_screen.dart`
- Test: `apps/mobile_flutter/test/widget/blocks_screen_test.dart`

Mirrors `watchlist_screen.dart` almost exactly — a read list with a per-row unblock action; blocking itself happens from `TradeDetailScreen` (Track D2), this screen is unblock-only, matching the RN `BlocksScreen.tsx` precedent.

- [ ] **Step 1: `blocks_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../trades/blocks_controller.dart';

class BlocksScreen extends ConsumerWidget {
  const BlocksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blocksAsync = ref.watch(blocksControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Blocked traders')),
      body: blocksAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load blocked traders: $error')),
        data: (entries) {
          if (entries.isEmpty) {
            return const Center(child: Text('You haven\'t blocked anyone.'));
          }
          return ListView.builder(
            itemCount: entries.length,
            itemBuilder: (context, index) {
              final entry = entries[index];
              return ListTile(
                key: Key('block_tile_${entry.blockedUserId}'),
                title: Text(entry.blockedUserName),
                subtitle: entry.reason != null ? Text(entry.reason!) : null,
                trailing: TextButton(
                  key: Key('unblock_button_${entry.blockedUserId}'),
                  onPressed: () =>
                      ref.read(blocksControllerProvider.notifier).unblock(entry.blockedUserId),
                  child: const Text('Unblock'),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 2: `test/widget/blocks_screen_test.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/screens/blocks_screen.dart';
import 'package:garage_sale_mobile/trades/blocks_providers.dart';
import 'package:garage_sale_mobile/trades/models/block_entry.dart';

import '../support/fake_blocks_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  testWidgets('BlocksScreen lists blocked traders and unblocks on tap', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));

    final fakeRepo = FakeBlocksRepository(
      entries: [
        BlockEntry(
          id: 'b1',
          blockedUserId: 'u3',
          blockedUserName: 'Carol',
          createdAt: DateTime.utc(2026, 7, 15),
        ),
      ],
      blockedIds: {'u3'},
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          blocksRepositoryProvider.overrideWithValue(fakeRepo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: BlocksScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Carol'), findsOneWidget);

    await tester.tap(find.byKey(const Key('unblock_button_u3')));
    await tester.pumpAndSettle();

    expect(fakeRepo.unblockCalls, 1);
    expect(find.text('Carol'), findsNothing);
  });
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `cd apps/mobile_flutter && flutter test test/widget/blocks_screen_test.dart`
Expected: PASS.

- [ ] **Step 4: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: no issues.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/screens/blocks_screen.dart apps/mobile_flutter/test/widget/blocks_screen_test.dart
git commit -m "Add BlocksScreen"
```

---

# Wave 5 — sequential, single agent (small, mechanical)

## Task: Router wiring + Home nav + ListingDetailScreen "Propose trade" wire-up

**Files:**

- Modify: `apps/mobile_flutter/lib/router/app_router.dart`
- Modify: `apps/mobile_flutter/lib/screens/home_screen.dart`
- Modify: `apps/mobile_flutter/lib/screens/listing_detail_screen.dart`

This is the one task that touches shared/existing files, so it runs alone after every Wave 4 screen has merged.

- [ ] **Step 1: Add routes to `app_router.dart`**

Read the current `routes:` list (`app_router.dart:52-` per Wave-1 research) and add these entries, respecting the existing literal-before-`:param` ordering rule:

```dart
    GoRoute(path: '/trades', builder: (context, state) => const TradesScreen()),
    GoRoute(
      path: '/trades/propose/:listingId',
      builder: (context, state) => ProposeTradeScreen(
        mode: ProposeMode.propose,
        targetId: state.pathParameters['listingId']!,
      ),
    ),
    GoRoute(
      path: '/trades/:id/counter',
      builder: (context, state) => ProposeTradeScreen(
        mode: ProposeMode.counter,
        targetId: state.pathParameters['id']!,
      ),
    ),
    GoRoute(
      path: '/trades/:id',
      builder: (context, state) => TradeDetailScreen(id: state.pathParameters['id']!),
    ),
    GoRoute(path: '/blocks', builder: (context, state) => const BlocksScreen()),
```

Add the matching imports at the top of the file:

```dart
import '../screens/blocks_screen.dart';
import '../screens/propose_trade_screen.dart';
import '../screens/trade_detail_screen.dart';
import '../screens/trades_screen.dart';
```

- [ ] **Step 2: Add a "Trades" entry point to `home_screen.dart`**

Follow the existing `ElevatedButton` + keyed pattern already used for Browse/Watchlist/My Listings (see `home_screen.dart:22,27,32` per Wave-1 research) — add one more:

```dart
            ElevatedButton(
              key: const Key('trades_button'),
              onPressed: () => context.push('/trades'),
              child: const Text('Trades'),
            ),
```

Add a similar button for `/blocks` if the existing Home layout has room, or nest it under an "Account"-style section if one already exists — match whatever the current `home_screen.dart` structure looks like rather than inventing a new layout pattern.

- [ ] **Step 3: Wire the disabled "Propose trade" stub in `listing_detail_screen.dart`**

F1 left a disabled "Propose trade" button on non-owned `ACTIVE` listings (per project memory). Find that button and replace its disabled `onPressed: null` with:

```dart
              onPressed: () => context.push('/trades/propose/${listing.id}'),
```

(keep the existing visibility condition — non-owner + `status == ListingStatus.active` — unchanged; only the `onPressed` wiring changes).

- [ ] **Step 4: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: no issues.

- [ ] **Step 5: Run the full Flutter test suite**

Run: `cd apps/mobile_flutter && flutter test`
Expected: every test file passes (F0 + F1 + all of this plan's new tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile_flutter/lib/router/app_router.dart apps/mobile_flutter/lib/screens/home_screen.dart apps/mobile_flutter/lib/screens/listing_detail_screen.dart
git commit -m "Wire trades/blocks routes into the router and Home/listing-detail nav"
```

---

# Final: full gate + verification

- [ ] **Step 1: Full Flutter gate**

Run: `cd apps/mobile_flutter && flutter analyze && flutter test`
Expected: clean analyze, all tests pass.

- [ ] **Step 2: Full web gate (backend track)**

Run: `pnpm --filter @garage-sale/web typecheck && pnpm --filter @garage-sale/web lint`
Expected: both exit 0.

- [ ] **Step 3: Repo-wide gate**

Run: `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm format:check`
Expected: green (format:check may still flag the same pre-existing unrelated files noted in prior sessions — not this plan's concern).

- [ ] **Step 4: Manual smoke check (if an Android emulator or device is available)**

Run the Flutter app against a local backend (`EXPO_PUBLIC_API_URL`-equivalent env var for Flutter — check `apps/mobile_flutter/lib/core/env.dart` for the actual config key) pointed at the running `apps/web` dev server, log in as a seeded user, and walk: Home → Trades → (empty state) → a listing detail → Propose trade → select an offered item → submit → see the new proposal in Trades → open it → accept/decline/counter/cancel as appropriate → message send/read → (once ACCEPTED) confirm on both sides → rate. If no emulator/device is available in this environment, say so explicitly rather than claiming this was verified — `flutter analyze`/`flutter test` passing is not proof the feature works end-to-end.

- [ ] **Step 5: Confirm with the user before pushing**

Per this repo's established workflow, confirm before `git push origin main`.

---

# Self-review notes (for whoever executes this plan)

- **Spec coverage:** every `trades.ts`/`blocks.ts` procedure has a REST route (Wave 1 Track A), a repository method (Wave 2), and is exercised from a controller (Wave 3) and screen (Wave 4) — `mine`/`byId`/`propose`/`accept`/`decline`/`counter`/`cancel`/`confirm`/`rate`/`messages`/`sendMessage`/`markThreadRead`/`unreadMessageCount`/`report`/`list`/`status`/`block`/`unblock` are all present somewhere above. `report` is wired directly from `TradeDetailScreen`'s dialog rather than through a controller (matches its one-shot, no-refresh-needed nature — mirrors how RN's report flow has no dedicated screen either).
- **Known soft spots flagged inline, not silently glossed over:** (1) `FamilyAsyncNotifier`/`AsyncNotifierProvider.family` class names may not match the pinned `flutter_riverpod: ^2.5.1` API exactly — Wave 3 Step 7 tells the implementer to check and adjust. (2) The `TradeDetailScreen` test's session-override gap (needing to fake a signed-in user matching `proposal.ownerId`) is called out explicitly rather than hand-waved. (3) `authControllerProvider`'s exact session-user field name (`.id` vs `.user.id`) must be confirmed against `lib/auth/session_user.dart` before Wave 4 Track D2 is executed — flagged inline rather than guessed.
- **Type consistency check:** `Proposal`, `ProposalItem`, `TradeConfirmation`, `TradeRating`, `TradeMessage`, `BlockEntry` field names are used identically across Wave 1 (definition), Wave 2 (repository return types), Wave 3 (controller state types), and Wave 4 (screen field access) — e.g. `proposal.listing.title`, `proposal.items`, `message.senderName`, `entry.blockedUserId` are spelled the same everywhere they appear.
