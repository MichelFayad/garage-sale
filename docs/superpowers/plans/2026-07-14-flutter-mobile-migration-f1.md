# Flutter mobile migration — F1 (Listings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full Listings feature for the Flutter mobile app — browse, listing detail, My Listings CRUD, watchlist — at parity with the RN app's shipped scope, backed by a new REST facade over the existing tRPC `listings`/`browse`/`watchlist` routers.

**Architecture:** Thin Next.js REST route handlers (`apps/web/src/app/api/mobile/{listings,browse,watchlist}/*`) wrap `appRouter.createCaller(ctx)` exactly like F0's auth routes — no business-logic duplication. Flutter side: repository-per-resource (`ListingsRepository`, `BrowseRepository`, `WatchlistRepository`) wrapping `ApiClient`, feeding Riverpod `AsyncNotifier`/`FutureProvider` controllers, consumed by 5 screens wired into the existing `go_router` config. Publishing (Stripe fee charge) is explicitly out of scope — deferred to F3; My Listings shows a disabled "Publish (coming soon)" stub.

**Tech Stack:** Same as F0 — Next.js 15 route handlers, tRPC v11 caller, Flutter/Dart, `flutter_riverpod`, `go_router`, `http`/`http/testing.dart`.

---

## Context for the implementer

- F0 (scaffold + auth) is done and merged to `main`. `apps/mobile_flutter` has working login/register/logout, secure token storage, and a Riverpod+go_router shell. Read `apps/mobile_flutter/lib/auth/*` and `apps/mobile_flutter/lib/router/app_router.dart` before starting — this plan's code follows those exact patterns.
- Backend routers already exist and are unchanged by this plan: `packages/api/src/routers/listings.ts`, `packages/api/src/routers/browse.ts`, `packages/api/src/routers/watchlist.ts`. This plan only adds REST wrappers around them.
- `ListingStatus` lifecycle: `DRAFT → PENDING_PAYMENT → ACTIVE → LOCKED/COMPLETED/REMOVED`. There is no non-Stripe way to reach `ACTIVE` — publishing is a separate async, webhook-resolved flow (F3). This plan's My Listings screen must show a **disabled** Publish action for `DRAFT` listings, not implement the charge.
- `browse.search` is a `protectedProcedure` (bearer auth required) despite the name — it excludes the caller's own listings and filters to `ACTIVE` status server-side.
- Location-radius filtering is intentionally omitted (needs device geolocation, same as RN).
- No backend route-handler tests were added in F0 for the REST facade (thin wrappers verified via typecheck/lint, business logic already tested in `packages/api`). This plan follows the same precedent — no new backend test files.

---

## Task 0: ApiClient — PATCH/DELETE and list-decoding support

**Files:**

- Modify: `apps/mobile_flutter/lib/core/api_client.dart`
- Modify: `apps/mobile_flutter/test/core/api_client_test.dart`

`ApiClient` currently only has `get`/`post`, and `_decode` assumes every response body is a JSON object. Listings endpoints need `PATCH`/`DELETE`, and several endpoints (`categories`, `mine`, `browse`, `watchlist`) return JSON **arrays**. This task adds `patch`, `delete`, and `getList` while keeping `get`/`post`'s existing signatures unchanged (F0 tests must keep passing untouched).

- [ ] **Step 1: Write the failing tests**

Append to `apps/mobile_flutter/test/core/api_client_test.dart` (inside the existing `group('ApiClient', () { ... })`, after the last test):

```dart
    test('patch sends bearer header and body, decodes JSON response', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'id': 'l1'}), 200);
      });
      final client = ApiClient(httpClient: mock, baseUrl: 'http://test.local/api');

      final result = await client.patch(
        '/mobile/listings/l1',
        {'title': 'New title'},
        accessToken: 'tok123',
      );

      expect(result, {'id': 'l1'});
      expect(captured.method, 'PATCH');
      expect(captured.headers['Authorization'], 'Bearer tok123');
      expect(jsonDecode(captured.body), {'title': 'New title'});
    });

    test('delete sends bearer header and decodes JSON response', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final client = ApiClient(httpClient: mock, baseUrl: 'http://test.local/api');

      final result = await client.delete(
        '/mobile/listings/l1',
        accessToken: 'tok123',
      );

      expect(result, {'ok': true});
      expect(captured.method, 'DELETE');
      expect(captured.headers['Authorization'], 'Bearer tok123');
    });

    test('getList decodes a JSON array response', () async {
      final mock = MockClient((request) async {
        return http.Response(
          jsonEncode([
            {'id': 'c1'},
            {'id': 'c2'},
          ]),
          200,
        );
      });
      final client = ApiClient(httpClient: mock, baseUrl: 'http://test.local/api');

      final result = await client.getList('/mobile/listings/categories');

      expect(result, [
        {'id': 'c1'},
        {'id': 'c2'},
      ]);
    });

    test('getList throws ApiException with server error message on non-2xx', () async {
      final mock = MockClient((request) async {
        return http.Response(jsonEncode({'error': 'Not a trader session'}), 403);
      });
      final client = ApiClient(httpClient: mock, baseUrl: 'http://test.local/api');

      expect(
        () => client.getList('/mobile/listings/mine'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 403)
              .having((e) => e.message, 'message', 'Not a trader session'),
        ),
      );
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `flutter test test/core/api_client_test.dart` (from `apps/mobile_flutter`)
Expected: FAIL — `patch`, `delete`, `getList` are not defined on `ApiClient`.

- [ ] **Step 3: Rewrite ApiClient**

Replace the full contents of `apps/mobile_flutter/lib/core/api_client.dart`:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_exception.dart';
import 'env.dart';

class ApiClient {
  ApiClient({http.Client? httpClient, String? baseUrl})
      : _client = httpClient ?? http.Client(),
        _baseUrl = baseUrl ?? Env.apiBaseUrl;

  final http.Client _client;
  final String _baseUrl;

  Future<Map<String, dynamic>> get(String path, {String? accessToken}) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(accessToken, hasBody: false),
    );
    return _decodeObject(response);
  }

  Future<List<dynamic>> getList(String path, {String? accessToken}) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(accessToken, hasBody: false),
    );
    return _decodeList(response);
  }

  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    String? accessToken,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(accessToken, hasBody: true),
      body: jsonEncode(body),
    );
    return _decodeObject(response);
  }

  Future<Map<String, dynamic>> patch(
    String path,
    Map<String, dynamic> body, {
    String? accessToken,
  }) async {
    final response = await _client.patch(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(accessToken, hasBody: true),
      body: jsonEncode(body),
    );
    return _decodeObject(response);
  }

  Future<Map<String, dynamic>> delete(String path, {String? accessToken}) async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(accessToken, hasBody: false),
    );
    return _decodeObject(response);
  }

  Map<String, String> _headers(String? accessToken, {required bool hasBody}) {
    return {
      if (hasBody) 'Content-Type': 'application/json',
      if (accessToken != null) 'Authorization': 'Bearer $accessToken',
    };
  }

  dynamic _decodeRaw(http.Response response) {
    final body = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message =
          (body is Map<String, dynamic> ? body['error'] as String? : null) ??
              'Request failed';
      throw ApiException(response.statusCode, message);
    }
    return body;
  }

  Map<String, dynamic> _decodeObject(http.Response response) {
    final decoded = _decodeRaw(response);
    return (decoded as Map<String, dynamic>?) ?? <String, dynamic>{};
  }

  List<dynamic> _decodeList(http.Response response) {
    final decoded = _decodeRaw(response);
    return (decoded as List<dynamic>?) ?? <dynamic>[];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `flutter test test/core/api_client_test.dart` (from `apps/mobile_flutter`)
Expected: PASS — all 7 tests (3 original + 4 new).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/core/api_client.dart apps/mobile_flutter/test/core/api_client_test.dart
git commit -m "F1: add PATCH/DELETE and list-decoding support to ApiClient"
git push
```

---

## Task 1: Backend REST facade — Listings CRUD

**Files:**

- Create: `apps/web/src/app/api/mobile/listings/categories/route.ts`
- Create: `apps/web/src/app/api/mobile/listings/mine/route.ts`
- Create: `apps/web/src/app/api/mobile/listings/route.ts`
- Create: `apps/web/src/app/api/mobile/listings/[id]/route.ts`
- Create: `apps/web/src/app/api/mobile/listings/[id]/mark-traded/route.ts`

Each route is a thin wrap of `appRouter.createCaller(ctx)`, the exact pattern `apps/web/src/app/api/mobile/auth/*/route.ts` (F0) uses. No new business logic — `listings.categories`/`mine`/`byId`/`create`/`update`/`markTraded`/`remove` are unchanged. Dynamic route params in Next 15 are async (`{ params: Promise<{...}> }`), matching `apps/web/src/app/api/oauth/[provider]/route.ts`.

- [ ] **Step 1: Categories endpoint (public)**

`apps/web/src/app/api/mobile/listings/categories/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const categories = await caller.listings.categories();
    return NextResponse.json(categories);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to load categories' }, { status: 400 });
  }
}
```

- [ ] **Step 2: Mine endpoint**

`apps/web/src/app/api/mobile/listings/mine/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403 };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const listings = await caller.listings.mine();
    return NextResponse.json(listings);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load listings' }, { status: 400 });
  }
}
```

- [ ] **Step 3: Create endpoint**

`apps/web/src/app/api/mobile/listings/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import type { Condition, ListingType } from '@garage-sale/db';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400 };

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const listing = await caller.listings.create({
      type: body.type as ListingType,
      title: String(body.title ?? ''),
      description: String(body.description ?? ''),
      condition: body.condition as Condition,
      categoryId: String(body.categoryId ?? ''),
      city: body.city !== undefined ? String(body.city) : undefined,
      neighbourhood: body.neighbourhood !== undefined ? String(body.neighbourhood) : undefined,
      wantedDescription:
        body.wantedDescription !== undefined ? String(body.wantedDescription) : undefined,
      wantedCategoryId:
        body.wantedCategoryId !== undefined ? String(body.wantedCategoryId) : undefined,
      photos: Array.isArray(body.photos) ? body.photos.map((p) => String(p)) : [],
    });
    return NextResponse.json(listing);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 400 });
  }
}
```

- [ ] **Step 4: Get/update/remove by id**

`apps/web/src/app/api/mobile/listings/[id]/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import type { Condition, ListingType } from '@garage-sale/db';
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
    const listing = await caller.listings.byId({ id });
    return NextResponse.json(listing);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load listing' }, { status: 400 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const listing = await caller.listings.update({
      id,
      type: body.type as ListingType,
      title: String(body.title ?? ''),
      description: String(body.description ?? ''),
      condition: body.condition as Condition,
      categoryId: String(body.categoryId ?? ''),
      city: body.city !== undefined ? String(body.city) : undefined,
      neighbourhood: body.neighbourhood !== undefined ? String(body.neighbourhood) : undefined,
      wantedDescription:
        body.wantedDescription !== undefined ? String(body.wantedDescription) : undefined,
      wantedCategoryId:
        body.wantedCategoryId !== undefined ? String(body.wantedCategoryId) : undefined,
      photos: Array.isArray(body.photos) ? body.photos.map((p) => String(p)) : [],
    });
    return NextResponse.json(listing);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to update listing' }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const listing = await caller.listings.remove({ id });
    return NextResponse.json(listing);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to remove listing' }, { status: 400 });
  }
}
```

- [ ] **Step 5: Mark-traded endpoint**

`apps/web/src/app/api/mobile/listings/[id]/mark-traded/route.ts`:

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
    const listing = await caller.listings.markTraded({ id });
    return NextResponse.json(listing);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to mark listing as traded' }, { status: 400 });
  }
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm --filter @garage-sale/web typecheck`
Expected: exits 0, no errors.

Run: `pnpm --filter @garage-sale/web lint`
Expected: exits 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/mobile/listings
git commit -m "F1: add mobile REST facade for listings CRUD"
git push
```

---

## Task 2: Backend REST facade — Browse

**Files:**

- Create: `apps/web/src/app/api/mobile/browse/route.ts`

`browse.search` is a `protectedProcedure`; filters come from query params. Location-radius params (`lat`/`lng`/`radiusKm`) are intentionally omitted — F1 has no geolocation UI.

- [ ] **Step 1: Browse endpoint**

`apps/web/src/app/api/mobile/browse/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import type { Condition, ListingType } from '@garage-sale/db';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, BAD_REQUEST: 400 };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const listings = await caller.browse.search({
      keyword: sp.get('keyword') ?? undefined,
      categoryId: sp.get('categoryId') ?? undefined,
      condition: (sp.get('condition') ?? undefined) as Condition | undefined,
      type: (sp.get('type') ?? undefined) as ListingType | undefined,
    });
    return NextResponse.json(listings);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Search failed' }, { status: 400 });
  }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm --filter @garage-sale/web typecheck`
Expected: exits 0, no errors.

Run: `pnpm --filter @garage-sale/web lint`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/mobile/browse
git commit -m "F1: add mobile REST facade for browse"
git push
```

---

## Task 3: Backend REST facade — Watchlist

**Files:**

- Create: `apps/web/src/app/api/mobile/watchlist/route.ts`
- Create: `apps/web/src/app/api/mobile/watchlist/[listingId]/route.ts`

- [ ] **Step 1: List/add endpoint**

`apps/web/src/app/api/mobile/watchlist/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, NOT_FOUND: 404 };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const entries = await caller.watchlist.list();
    return NextResponse.json(entries);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load watchlist' }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { listingId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const result = await caller.watchlist.add({ listingId: String(body.listingId ?? '') });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to add to watchlist' }, { status: 400 });
  }
}
```

- [ ] **Step 2: Remove endpoint**

`apps/web/src/app/api/mobile/watchlist/[listingId]/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ listingId: string }> },
): Promise<NextResponse> {
  const { listingId } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const result = await caller.watchlist.remove({ listingId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === 'UNAUTHORIZED' ? 401 : 400 },
      );
    }
    return NextResponse.json({ error: 'Failed to remove from watchlist' }, { status: 400 });
  }
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @garage-sale/web typecheck`
Expected: exits 0, no errors.

Run: `pnpm --filter @garage-sale/web lint`
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/mobile/watchlist
git commit -m "F1: add mobile REST facade for watchlist"
git push
```

---

## Task 4: Flutter listing domain models

**Files:**

- Create: `apps/mobile_flutter/lib/listings/models/category.dart`
- Create: `apps/mobile_flutter/lib/listings/models/listing.dart`
- Create: `apps/mobile_flutter/lib/listings/models/watchlist_entry.dart`
- Test: `apps/mobile_flutter/test/listings/models/listing_test.dart`

`Category` and `ListingPhoto`/`WatchlistEntry` are trivial JSON pass-throughs (no dedicated test, same precedent as F0's `SessionUser` — exercised indirectly via repository tests in later tasks). `Listing`/`ListingInput`/the enum JSON extensions have real mapping logic (Dart enum ↔ API's `UPPER_SNAKE_CASE` strings) and get a direct test.

- [ ] **Step 1: Write the failing test**

`apps/mobile_flutter/test/listings/models/listing_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';

void main() {
  group('Listing', () {
    test('fromJson parses core fields, enums, photos, and nested category', () {
      final listing = Listing.fromJson({
        'id': 'l1',
        'ownerId': 'u1',
        'type': 'HAVE',
        'title': 'Bike',
        'description': 'Red bike',
        'condition': 'GOOD',
        'categoryId': 'c1',
        'status': 'ACTIVE',
        'city': 'Austin',
        'photos': [
          {'id': 'p1', 'url': 'https://example.com/a.jpg', 'sortOrder': 0},
        ],
        'category': {'id': 'c1', 'name': 'Bikes', 'sortOrder': 0},
      });

      expect(listing.id, 'l1');
      expect(listing.type, ListingType.have);
      expect(listing.condition, Condition.good);
      expect(listing.status, ListingStatus.active);
      expect(listing.city, 'Austin');
      expect(listing.photos, hasLength(1));
      expect(listing.photos.first.url, 'https://example.com/a.jpg');
      expect(listing.categoryName, 'Bikes');
    });

    test('fromJson handles a listing with no photos or category', () {
      final listing = Listing.fromJson({
        'id': 'l1',
        'ownerId': 'u1',
        'type': 'WANT',
        'title': 'Bike',
        'description': 'Looking for a bike',
        'condition': 'FAIR',
        'categoryId': 'c1',
        'status': 'DRAFT',
      });

      expect(listing.photos, isEmpty);
      expect(listing.categoryName, isNull);
      expect(listing.city, isNull);
    });

    test('copyWith replaces only the given field', () {
      final listing = Listing.fromJson({
        'id': 'l1',
        'ownerId': 'u1',
        'type': 'HAVE',
        'title': 'Bike',
        'description': 'Red bike',
        'condition': 'GOOD',
        'categoryId': 'c1',
        'status': 'ACTIVE',
      });

      final updated = listing.copyWith(status: ListingStatus.completed);

      expect(updated.status, ListingStatus.completed);
      expect(updated.id, listing.id);
      expect(updated.title, listing.title);
    });
  });

  group('ListingInput', () {
    test('toJson serializes enums back to API string values', () {
      const input = ListingInput(
        type: ListingType.have,
        title: 'Bike',
        description: 'Red bike',
        condition: Condition.likeNew,
        categoryId: 'c1',
        photos: ['https://example.com/a.jpg'],
      );

      expect(input.toJson(), {
        'type': 'HAVE',
        'title': 'Bike',
        'description': 'Red bike',
        'condition': 'LIKE_NEW',
        'categoryId': 'c1',
        'photos': ['https://example.com/a.jpg'],
      });
    });

    test('toJson omits null optional fields', () {
      const input = ListingInput(
        type: ListingType.want,
        title: 'Chair',
        description: 'Any chair',
        condition: Condition.poor,
        categoryId: 'c2',
      );

      final json = input.toJson();

      expect(json.containsKey('city'), isFalse);
      expect(json.containsKey('neighbourhood'), isFalse);
      expect(json.containsKey('wantedDescription'), isFalse);
      expect(json.containsKey('wantedCategoryId'), isFalse);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/listings/models/listing_test.dart` (from `apps/mobile_flutter`)
Expected: FAIL — `package:garage_sale_mobile/listings/models/listing.dart` does not exist.

- [ ] **Step 3: Write the models**

`apps/mobile_flutter/lib/listings/models/category.dart`:

```dart
class Category {
  const Category({required this.id, required this.name, required this.sortOrder});

  final String id;
  final String name;
  final int sortOrder;

  factory Category.fromJson(Map<String, dynamic> json) {
    return Category(
      id: json['id'] as String,
      name: json['name'] as String,
      sortOrder: json['sortOrder'] as int,
    );
  }
}
```

`apps/mobile_flutter/lib/listings/models/listing.dart`:

```dart
enum ListingType { have, want }

extension ListingTypeJson on ListingType {
  static const _toApi = {ListingType.have: 'HAVE', ListingType.want: 'WANT'};
  static const _fromApi = {'HAVE': ListingType.have, 'WANT': ListingType.want};

  String toApi() => _toApi[this]!;

  static ListingType fromApi(String value) => _fromApi[value]!;
}

enum Condition { newItem, likeNew, good, fair, poor }

extension ConditionJson on Condition {
  static const _toApi = {
    Condition.newItem: 'NEW',
    Condition.likeNew: 'LIKE_NEW',
    Condition.good: 'GOOD',
    Condition.fair: 'FAIR',
    Condition.poor: 'POOR',
  };
  static const _fromApi = {
    'NEW': Condition.newItem,
    'LIKE_NEW': Condition.likeNew,
    'GOOD': Condition.good,
    'FAIR': Condition.fair,
    'POOR': Condition.poor,
  };

  String toApi() => _toApi[this]!;

  static Condition fromApi(String value) => _fromApi[value]!;
}

enum ListingStatus { draft, pendingPayment, active, locked, completed, removed }

extension ListingStatusJson on ListingStatus {
  static const _fromApi = {
    'DRAFT': ListingStatus.draft,
    'PENDING_PAYMENT': ListingStatus.pendingPayment,
    'ACTIVE': ListingStatus.active,
    'LOCKED': ListingStatus.locked,
    'COMPLETED': ListingStatus.completed,
    'REMOVED': ListingStatus.removed,
  };

  static ListingStatus fromApi(String value) => _fromApi[value]!;
}

class ListingPhoto {
  const ListingPhoto({required this.id, required this.url, required this.sortOrder});

  final String id;
  final String url;
  final int sortOrder;

  factory ListingPhoto.fromJson(Map<String, dynamic> json) {
    return ListingPhoto(
      id: json['id'] as String,
      url: json['url'] as String,
      sortOrder: json['sortOrder'] as int,
    );
  }
}

class Listing {
  const Listing({
    required this.id,
    required this.ownerId,
    required this.type,
    required this.title,
    required this.description,
    required this.condition,
    required this.categoryId,
    required this.status,
    required this.photos,
    this.city,
    this.neighbourhood,
    this.wantedDescription,
    this.wantedCategoryId,
    this.categoryName,
  });

  final String id;
  final String ownerId;
  final ListingType type;
  final String title;
  final String description;
  final Condition condition;
  final String categoryId;
  final ListingStatus status;
  final List<ListingPhoto> photos;
  final String? city;
  final String? neighbourhood;
  final String? wantedDescription;
  final String? wantedCategoryId;
  final String? categoryName;

  factory Listing.fromJson(Map<String, dynamic> json) {
    final category = json['category'] as Map<String, dynamic>?;
    return Listing(
      id: json['id'] as String,
      ownerId: json['ownerId'] as String,
      type: ListingTypeJson.fromApi(json['type'] as String),
      title: json['title'] as String,
      description: json['description'] as String,
      condition: ConditionJson.fromApi(json['condition'] as String),
      categoryId: json['categoryId'] as String,
      status: ListingStatusJson.fromApi(json['status'] as String),
      photos: (json['photos'] as List<dynamic>? ?? [])
          .map((p) => ListingPhoto.fromJson(p as Map<String, dynamic>))
          .toList(),
      city: json['city'] as String?,
      neighbourhood: json['neighbourhood'] as String?,
      wantedDescription: json['wantedDescription'] as String?,
      wantedCategoryId: json['wantedCategoryId'] as String?,
      categoryName: category?['name'] as String?,
    );
  }

  Listing copyWith({ListingStatus? status}) {
    return Listing(
      id: id,
      ownerId: ownerId,
      type: type,
      title: title,
      description: description,
      condition: condition,
      categoryId: categoryId,
      status: status ?? this.status,
      photos: photos,
      city: city,
      neighbourhood: neighbourhood,
      wantedDescription: wantedDescription,
      wantedCategoryId: wantedCategoryId,
      categoryName: categoryName,
    );
  }
}

class ListingInput {
  const ListingInput({
    required this.type,
    required this.title,
    required this.description,
    required this.condition,
    required this.categoryId,
    this.city,
    this.neighbourhood,
    this.wantedDescription,
    this.wantedCategoryId,
    this.photos = const [],
  });

  final ListingType type;
  final String title;
  final String description;
  final Condition condition;
  final String categoryId;
  final String? city;
  final String? neighbourhood;
  final String? wantedDescription;
  final String? wantedCategoryId;
  final List<String> photos;

  Map<String, dynamic> toJson() {
    return {
      'type': type.toApi(),
      'title': title,
      'description': description,
      'condition': condition.toApi(),
      'categoryId': categoryId,
      if (city != null) 'city': city,
      if (neighbourhood != null) 'neighbourhood': neighbourhood,
      if (wantedDescription != null) 'wantedDescription': wantedDescription,
      if (wantedCategoryId != null) 'wantedCategoryId': wantedCategoryId,
      'photos': photos,
    };
  }
}
```

`apps/mobile_flutter/lib/listings/models/watchlist_entry.dart`:

```dart
import 'listing.dart';

class WatchlistEntry {
  const WatchlistEntry({required this.id, required this.listing});

  final String id;
  final Listing listing;

  factory WatchlistEntry.fromJson(Map<String, dynamic> json) {
    return WatchlistEntry(
      id: json['id'] as String,
      listing: Listing.fromJson(json['listing'] as Map<String, dynamic>),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/listings/models/listing_test.dart` (from `apps/mobile_flutter`)
Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/listings/models apps/mobile_flutter/test/listings/models
git commit -m "F1: add listing domain models (Category, Listing, ListingInput, WatchlistEntry)"
git push
```

---

## Task 5: ListingsRepository

**Files:**

- Create: `apps/mobile_flutter/lib/listings/listings_repository.dart`
- Create: `apps/mobile_flutter/lib/listings/rest_listings_repository.dart`
- Test: `apps/mobile_flutter/test/listings/rest_listings_repository_test.dart`

Mirrors `apps/mobile_flutter/lib/auth/{auth_repository,rest_auth_repository}.dart` from F0: an abstract interface so controllers/tests can swap in a fake, and a REST implementation calling Task 1's endpoints.

- [ ] **Step 1: Write the failing test**

`apps/mobile_flutter/test/listings/rest_listings_repository_test.dart`:

```dart
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/rest_listings_repository.dart';

Map<String, dynamic> _listingJson({String id = 'l1', String status = 'DRAFT'}) => {
      'id': id,
      'ownerId': 'u1',
      'type': 'HAVE',
      'title': 'Bike',
      'description': 'Red bike',
      'condition': 'GOOD',
      'categoryId': 'c1',
      'status': status,
      'photos': <Map<String, dynamic>>[],
    };

void main() {
  group('RestListingsRepository', () {
    test('categories decodes a list of categories', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/listings/categories');
        return http.Response(
          jsonEncode([
            {'id': 'c1', 'name': 'Bikes', 'sortOrder': 0},
          ]),
          200,
        );
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final categories = await repo.categories();

      expect(categories, hasLength(1));
      expect(categories.first.name, 'Bikes');
    });

    test('mine sends the bearer token and decodes a list of listings', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode([_listingJson()]), 200);
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final listings = await repo.mine('tok123');

      expect(captured.url.path, '/api/mobile/listings/mine');
      expect(captured.headers['Authorization'], 'Bearer tok123');
      expect(listings, hasLength(1));
    });

    test('byId decodes a single listing', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/listings/l1');
        return http.Response(jsonEncode(_listingJson()), 200);
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final listing = await repo.byId('l1', 'tok123');

      expect(listing.id, 'l1');
    });

    test('create posts the serialized input and decodes the response', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode(_listingJson()), 200);
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );
      const input = ListingInput(
        type: ListingType.have,
        title: 'Bike',
        description: 'Red bike',
        condition: Condition.good,
        categoryId: 'c1',
      );

      await repo.create(input, 'tok123');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/listings');
      expect(jsonDecode(captured.body), input.toJson());
    });

    test('update patches the listing by id', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode(_listingJson()), 200);
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );
      const input = ListingInput(
        type: ListingType.have,
        title: 'Bike',
        description: 'Red bike',
        condition: Condition.good,
        categoryId: 'c1',
      );

      await repo.update('l1', input, 'tok123');

      expect(captured.method, 'PATCH');
      expect(captured.url.path, '/api/mobile/listings/l1');
    });

    test('markTraded posts to the mark-traded endpoint', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode(_listingJson(status: 'COMPLETED')), 200);
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final listing = await repo.markTraded('l1', 'tok123');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/listings/l1/mark-traded');
      expect(listing.status, ListingStatus.completed);
    });

    test('remove sends a DELETE to the listing endpoint', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.remove('l1', 'tok123');

      expect(captured.method, 'DELETE');
      expect(captured.url.path, '/api/mobile/listings/l1');
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/listings/rest_listings_repository_test.dart` (from `apps/mobile_flutter`)
Expected: FAIL — `RestListingsRepository` does not exist.

- [ ] **Step 3: Write the repository**

`apps/mobile_flutter/lib/listings/listings_repository.dart`:

```dart
import 'models/category.dart';
import 'models/listing.dart';

abstract class ListingsRepository {
  Future<List<Category>> categories();

  Future<List<Listing>> mine(String accessToken);

  Future<Listing> byId(String id, String accessToken);

  Future<Listing> create(ListingInput input, String accessToken);

  Future<Listing> update(String id, ListingInput input, String accessToken);

  Future<Listing> markTraded(String id, String accessToken);

  Future<void> remove(String id, String accessToken);
}
```

`apps/mobile_flutter/lib/listings/rest_listings_repository.dart`:

```dart
import '../core/api_client.dart';
import 'listings_repository.dart';
import 'models/category.dart';
import 'models/listing.dart';

class RestListingsRepository implements ListingsRepository {
  RestListingsRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<Category>> categories() async {
    final json = await _client.getList('/mobile/listings/categories');
    return json.map((e) => Category.fromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Future<List<Listing>> mine(String accessToken) async {
    final json = await _client.getList('/mobile/listings/mine', accessToken: accessToken);
    return json.map((e) => Listing.fromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Future<Listing> byId(String id, String accessToken) async {
    final json = await _client.get('/mobile/listings/$id', accessToken: accessToken);
    return Listing.fromJson(json);
  }

  @override
  Future<Listing> create(ListingInput input, String accessToken) async {
    final json = await _client.post(
      '/mobile/listings',
      input.toJson(),
      accessToken: accessToken,
    );
    return Listing.fromJson(json);
  }

  @override
  Future<Listing> update(String id, ListingInput input, String accessToken) async {
    final json = await _client.patch(
      '/mobile/listings/$id',
      input.toJson(),
      accessToken: accessToken,
    );
    return Listing.fromJson(json);
  }

  @override
  Future<Listing> markTraded(String id, String accessToken) async {
    final json = await _client.post(
      '/mobile/listings/$id/mark-traded',
      const {},
      accessToken: accessToken,
    );
    return Listing.fromJson(json);
  }

  @override
  Future<void> remove(String id, String accessToken) async {
    await _client.delete('/mobile/listings/$id', accessToken: accessToken);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/listings/rest_listings_repository_test.dart` (from `apps/mobile_flutter`)
Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/listings/listings_repository.dart apps/mobile_flutter/lib/listings/rest_listings_repository.dart apps/mobile_flutter/test/listings/rest_listings_repository_test.dart
git commit -m "F1: add ListingsRepository (REST) for categories/mine/byId/CRUD"
git push
```

---

## Task 6: BrowseRepository

**Files:**

- Create: `apps/mobile_flutter/lib/listings/browse_repository.dart`
- Create: `apps/mobile_flutter/lib/listings/rest_browse_repository.dart`
- Test: `apps/mobile_flutter/test/listings/rest_browse_repository_test.dart`

- [ ] **Step 1: Write the failing test**

`apps/mobile_flutter/test/listings/rest_browse_repository_test.dart`:

```dart
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/rest_browse_repository.dart';

void main() {
  group('RestBrowseRepository', () {
    test('search sends the bearer token and no query params when filters are empty', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode([]), 200);
      });
      final repo = RestBrowseRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.search('tok123');

      expect(captured.url.path, '/api/mobile/browse');
      expect(captured.url.queryParameters, isEmpty);
      expect(captured.headers['Authorization'], 'Bearer tok123');
    });

    test('search encodes keyword, category, condition, and type filters', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode([]), 200);
      });
      final repo = RestBrowseRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.search(
        'tok123',
        keyword: 'bike',
        categoryId: 'c1',
        condition: Condition.good,
        type: ListingType.have,
      );

      expect(captured.url.queryParameters, {
        'keyword': 'bike',
        'categoryId': 'c1',
        'condition': 'GOOD',
        'type': 'HAVE',
      });
    });

    test('search decodes the returned listings', () async {
      final mock = MockClient((request) async {
        return http.Response(
          jsonEncode([
            {
              'id': 'l1',
              'ownerId': 'u2',
              'type': 'HAVE',
              'title': 'Bike',
              'description': 'Red bike',
              'condition': 'GOOD',
              'categoryId': 'c1',
              'status': 'ACTIVE',
              'photos': <Map<String, dynamic>>[],
            },
          ]),
          200,
        );
      });
      final repo = RestBrowseRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final listings = await repo.search('tok123');

      expect(listings, hasLength(1));
      expect(listings.first.id, 'l1');
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/listings/rest_browse_repository_test.dart` (from `apps/mobile_flutter`)
Expected: FAIL — `RestBrowseRepository` does not exist.

- [ ] **Step 3: Write the repository**

`apps/mobile_flutter/lib/listings/browse_repository.dart`:

```dart
import 'models/listing.dart';

abstract class BrowseRepository {
  Future<List<Listing>> search(
    String accessToken, {
    String? keyword,
    String? categoryId,
    Condition? condition,
    ListingType? type,
  });
}
```

`apps/mobile_flutter/lib/listings/rest_browse_repository.dart`:

```dart
import '../core/api_client.dart';
import 'browse_repository.dart';
import 'models/listing.dart';

class RestBrowseRepository implements BrowseRepository {
  RestBrowseRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<Listing>> search(
    String accessToken, {
    String? keyword,
    String? categoryId,
    Condition? condition,
    ListingType? type,
  }) async {
    final query = <String, String>{
      if (keyword != null && keyword.isNotEmpty) 'keyword': keyword,
      if (categoryId != null) 'categoryId': categoryId,
      if (condition != null) 'condition': condition.toApi(),
      if (type != null) 'type': type.toApi(),
    };
    final path = Uri(
      path: '/mobile/browse',
      queryParameters: query.isEmpty ? null : query,
    ).toString();
    final json = await _client.getList(path, accessToken: accessToken);
    return json.map((e) => Listing.fromJson(e as Map<String, dynamic>)).toList();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/listings/rest_browse_repository_test.dart` (from `apps/mobile_flutter`)
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/listings/browse_repository.dart apps/mobile_flutter/lib/listings/rest_browse_repository.dart apps/mobile_flutter/test/listings/rest_browse_repository_test.dart
git commit -m "F1: add BrowseRepository (REST) with keyword/category/condition/type filters"
git push
```

---

## Task 7: WatchlistRepository

**Files:**

- Create: `apps/mobile_flutter/lib/listings/watchlist_repository.dart`
- Create: `apps/mobile_flutter/lib/listings/rest_watchlist_repository.dart`
- Test: `apps/mobile_flutter/test/listings/rest_watchlist_repository_test.dart`

- [ ] **Step 1: Write the failing test**

`apps/mobile_flutter/test/listings/rest_watchlist_repository_test.dart`:

```dart
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/listings/rest_watchlist_repository.dart';

void main() {
  group('RestWatchlistRepository', () {
    test('list decodes watchlist entries with nested listings', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(
          jsonEncode([
            {
              'id': 'w1',
              'listing': {
                'id': 'l1',
                'ownerId': 'u2',
                'type': 'HAVE',
                'title': 'Bike',
                'description': 'Red bike',
                'condition': 'GOOD',
                'categoryId': 'c1',
                'status': 'ACTIVE',
                'photos': <Map<String, dynamic>>[],
              },
            },
          ]),
          200,
        );
      });
      final repo = RestWatchlistRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final entries = await repo.list('tok123');

      expect(captured.url.path, '/api/mobile/watchlist');
      expect(captured.headers['Authorization'], 'Bearer tok123');
      expect(entries, hasLength(1));
      expect(entries.first.listing.id, 'l1');
    });

    test('add posts the listingId', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestWatchlistRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.add('l1', 'tok123');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/watchlist');
      expect(jsonDecode(captured.body), {'listingId': 'l1'});
    });

    test('remove sends a DELETE to the listing-scoped endpoint', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestWatchlistRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.remove('l1', 'tok123');

      expect(captured.method, 'DELETE');
      expect(captured.url.path, '/api/mobile/watchlist/l1');
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/listings/rest_watchlist_repository_test.dart` (from `apps/mobile_flutter`)
Expected: FAIL — `RestWatchlistRepository` does not exist.

- [ ] **Step 3: Write the repository**

`apps/mobile_flutter/lib/listings/watchlist_repository.dart`:

```dart
import 'models/watchlist_entry.dart';

abstract class WatchlistRepository {
  Future<List<WatchlistEntry>> list(String accessToken);

  Future<void> add(String listingId, String accessToken);

  Future<void> remove(String listingId, String accessToken);
}
```

`apps/mobile_flutter/lib/listings/rest_watchlist_repository.dart`:

```dart
import '../core/api_client.dart';
import 'models/watchlist_entry.dart';
import 'watchlist_repository.dart';

class RestWatchlistRepository implements WatchlistRepository {
  RestWatchlistRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<WatchlistEntry>> list(String accessToken) async {
    final json = await _client.getList('/mobile/watchlist', accessToken: accessToken);
    return json.map((e) => WatchlistEntry.fromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Future<void> add(String listingId, String accessToken) async {
    await _client.post(
      '/mobile/watchlist',
      {'listingId': listingId},
      accessToken: accessToken,
    );
  }

  @override
  Future<void> remove(String listingId, String accessToken) async {
    await _client.delete('/mobile/watchlist/$listingId', accessToken: accessToken);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/listings/rest_watchlist_repository_test.dart` (from `apps/mobile_flutter`)
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/listings/watchlist_repository.dart apps/mobile_flutter/lib/listings/rest_watchlist_repository.dart apps/mobile_flutter/test/listings/rest_watchlist_repository_test.dart
git commit -m "F1: add WatchlistRepository (REST) for list/add/remove"
git push
```

---

## Task 8: Providers and MyListingsController

**Files:**

- Create: `apps/mobile_flutter/lib/core/require_token.dart`
- Create: `apps/mobile_flutter/lib/listings/providers.dart`
- Create: `apps/mobile_flutter/lib/listings/my_listings_controller.dart`
- Create: `apps/mobile_flutter/test/support/fake_listings_repository.dart`
- Test: `apps/mobile_flutter/test/listings/my_listings_controller_test.dart`

`requireAccessToken` is a small shared helper (reused by every controller from this task on) that reads the stored access token or throws `ApiException(401, ...)` — avoids repeating the same 4 lines in each controller. `MyListingsController` is an `AsyncNotifier<List<Listing>>` mirroring F0's `AuthController` shape.

- [ ] **Step 1: Write the failing test**

`apps/mobile_flutter/test/support/fake_listings_repository.dart`:

```dart
import 'package:garage_sale_mobile/listings/listings_repository.dart';
import 'package:garage_sale_mobile/listings/models/category.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';

/// Test double. Seed `mine` in the constructor; `create`/`update` append/replace
/// in place so screen-level flows can be exercised without a real backend.
class FakeListingsRepository implements ListingsRepository {
  FakeListingsRepository({List<Listing> mine = const [], List<Category> categories = const []})
      : _mine = mine,
        _categories = categories;

  final List<Category> _categories;
  List<Listing> _mine;
  String? lastMarkTradedId;
  String? lastRemoveId;

  @override
  Future<List<Category>> categories() async => _categories;

  @override
  Future<List<Listing>> mine(String accessToken) async => _mine;

  @override
  Future<Listing> byId(String id, String accessToken) async =>
      _mine.firstWhere((l) => l.id == id);

  @override
  Future<Listing> create(ListingInput input, String accessToken) async {
    final listing = _fromInput('new-${_mine.length + 1}', input, ListingStatus.draft);
    _mine = [..._mine, listing];
    return listing;
  }

  @override
  Future<Listing> update(String id, ListingInput input, String accessToken) async {
    final listing = _fromInput(id, input, ListingStatus.draft);
    _mine = [for (final l in _mine) if (l.id == id) listing else l];
    return listing;
  }

  @override
  Future<Listing> markTraded(String id, String accessToken) async {
    lastMarkTradedId = id;
    _mine = [
      for (final l in _mine)
        if (l.id == id) l.copyWith(status: ListingStatus.completed) else l,
    ];
    return _mine.firstWhere((l) => l.id == id);
  }

  @override
  Future<void> remove(String id, String accessToken) async {
    lastRemoveId = id;
    _mine = _mine.where((l) => l.id != id).toList();
  }

  Listing _fromInput(String id, ListingInput input, ListingStatus status) {
    return Listing(
      id: id,
      ownerId: 'u1',
      type: input.type,
      title: input.title,
      description: input.description,
      condition: input.condition,
      categoryId: input.categoryId,
      status: status,
      photos: [
        for (final e in input.photos.asMap().entries)
          ListingPhoto(id: 'p${e.key}', url: e.value, sortOrder: e.key),
      ],
      city: input.city,
      neighbourhood: input.neighbourhood,
      wantedDescription: input.wantedDescription,
      wantedCategoryId: input.wantedCategoryId,
    );
  }
}
```

`apps/mobile_flutter/test/listings/my_listings_controller_test.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/my_listings_controller.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import '../support/fake_listings_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _listing(String id, {ListingStatus status = ListingStatus.active}) {
  return Listing(
    id: id,
    ownerId: 'u1',
    type: ListingType.have,
    title: 'Bike $id',
    description: 'A bike',
    condition: Condition.good,
    categoryId: 'c1',
    status: status,
    photos: const [],
  );
}

ProviderContainer _buildContainer(FakeListingsRepository repo) {
  final storage = TokenStorage(InMemoryKeyValueStore());
  final container = ProviderContainer(
    overrides: [
      listingsRepositoryProvider.overrideWithValue(repo),
      tokenStorageProvider.overrideWithValue(storage),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('MyListingsController', () {
    test('loads the caller\'s listings on build', () async {
      final container = _buildContainer(
        FakeListingsRepository(mine: [_listing('l1')]),
      );
      await container
          .read(tokenStorageProvider)
          .saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));

      final listings = await container.read(myListingsControllerProvider.future);

      expect(listings, hasLength(1));
      expect(listings.first.id, 'l1');
    });

    test('markTraded calls the repository and refreshes the list', () async {
      final repo = FakeListingsRepository(mine: [_listing('l1')]);
      final container = _buildContainer(repo);
      await container
          .read(tokenStorageProvider)
          .saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));
      await container.read(myListingsControllerProvider.future);

      await container.read(myListingsControllerProvider.notifier).markTraded('l1');

      expect(repo.lastMarkTradedId, 'l1');
      final listings = container.read(myListingsControllerProvider).value!;
      expect(listings.first.status, ListingStatus.completed);
    });

    test('remove calls the repository and drops the listing from state', () async {
      final repo = FakeListingsRepository(mine: [_listing('l1'), _listing('l2')]);
      final container = _buildContainer(repo);
      await container
          .read(tokenStorageProvider)
          .saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));
      await container.read(myListingsControllerProvider.future);

      await container.read(myListingsControllerProvider.notifier).remove('l1');

      expect(repo.lastRemoveId, 'l1');
      final listings = container.read(myListingsControllerProvider).value!;
      expect(listings.map((l) => l.id), ['l2']);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/listings/my_listings_controller_test.dart` (from `apps/mobile_flutter`)
Expected: FAIL — `package:garage_sale_mobile/listings/my_listings_controller.dart` and `package:garage_sale_mobile/listings/providers.dart` do not exist.

- [ ] **Step 3: Write the helper, providers, and controller**

`apps/mobile_flutter/lib/core/require_token.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'api_exception.dart';

/// Reads the stored access token, throwing a 401 [ApiException] if the caller
/// is not authenticated. Every listings/browse/watchlist controller reads its
/// token this way instead of duplicating the null-check inline.
Future<String> requireAccessToken(Ref ref) async {
  final token = await ref.read(tokenStorageProvider).getAccessToken();
  if (token == null) {
    throw const ApiException(401, 'Not authenticated');
  }
  return token;
}
```

`apps/mobile_flutter/lib/listings/providers.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'browse_repository.dart';
import 'listings_repository.dart';
import 'models/category.dart';
import 'rest_browse_repository.dart';
import 'rest_listings_repository.dart';
import 'rest_watchlist_repository.dart';
import 'watchlist_repository.dart';

final listingsRepositoryProvider = Provider<ListingsRepository>(
  (ref) => RestListingsRepository(ref.watch(apiClientProvider)),
);

final browseRepositoryProvider = Provider<BrowseRepository>(
  (ref) => RestBrowseRepository(ref.watch(apiClientProvider)),
);

final watchlistRepositoryProvider = Provider<WatchlistRepository>(
  (ref) => RestWatchlistRepository(ref.watch(apiClientProvider)),
);

final categoriesProvider = FutureProvider<List<Category>>(
  (ref) => ref.watch(listingsRepositoryProvider).categories(),
);
```

`apps/mobile_flutter/lib/listings/my_listings_controller.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'listings_repository.dart';
import 'models/listing.dart';
import 'providers.dart';

class MyListingsController extends AsyncNotifier<List<Listing>> {
  ListingsRepository get _repo => ref.read(listingsRepositoryProvider);

  @override
  Future<List<Listing>> build() => _load();

  Future<List<Listing>> _load() async {
    final token = await requireAccessToken(ref);
    return _repo.mine(token);
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  Future<void> markTraded(String id) async {
    final token = await requireAccessToken(ref);
    await _repo.markTraded(id, token);
    await refresh();
  }

  Future<void> remove(String id) async {
    final token = await requireAccessToken(ref);
    await _repo.remove(id, token);
    await refresh();
  }
}

final myListingsControllerProvider =
    AsyncNotifierProvider<MyListingsController, List<Listing>>(MyListingsController.new);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/listings/my_listings_controller_test.dart` (from `apps/mobile_flutter`)
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/core/require_token.dart apps/mobile_flutter/lib/listings/providers.dart apps/mobile_flutter/lib/listings/my_listings_controller.dart apps/mobile_flutter/test/support/fake_listings_repository.dart apps/mobile_flutter/test/listings/my_listings_controller_test.dart
git commit -m "F1: add listings providers, requireAccessToken helper, and MyListingsController"
git push
```

---

## Task 9: My Listings screen

**Files:**

- Create: `apps/mobile_flutter/lib/screens/my_listings_screen.dart`
- Test: `apps/mobile_flutter/test/widget/my_listings_screen_test.dart`

Shows the caller's listings with status, and Edit/Mark traded/Remove actions. `DRAFT` listings show a disabled "Publish (coming soon)" menu item — publishing is F3 (Stripe), not this task.

- [ ] **Step 1: Write the failing test**

`apps/mobile_flutter/test/widget/my_listings_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/screens/my_listings_screen.dart';
import '../support/fake_listings_repository.dart';

Listing _listing(String id, {ListingStatus status = ListingStatus.active}) {
  return Listing(
    id: id,
    ownerId: 'u1',
    type: ListingType.have,
    title: 'Bike $id',
    description: 'A bike',
    condition: Condition.good,
    categoryId: 'c1',
    status: status,
    photos: const [],
  );
}

void main() {
  testWidgets('shows the caller\'s listings', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          listingsRepositoryProvider.overrideWithValue(
            FakeListingsRepository(mine: [_listing('l1')]),
          ),
        ],
        child: const MaterialApp(home: MyListingsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bike l1'), findsOneWidget);
  });

  testWidgets('removing a listing drops it from the list', (tester) async {
    final repo = FakeListingsRepository(mine: [_listing('l1'), _listing('l2')]);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [listingsRepositoryProvider.overrideWithValue(repo)],
        child: const MaterialApp(home: MyListingsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('listing_menu_l1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove').last);
    await tester.pumpAndSettle();

    expect(find.text('Bike l1'), findsNothing);
    expect(find.text('Bike l2'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/widget/my_listings_screen_test.dart` (from `apps/mobile_flutter`)
Expected: FAIL — `package:garage_sale_mobile/screens/my_listings_screen.dart` does not exist.

- [ ] **Step 3: Write the screen**

`apps/mobile_flutter/lib/screens/my_listings_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../listings/models/listing.dart';
import '../listings/my_listings_controller.dart';

class MyListingsScreen extends ConsumerWidget {
  const MyListingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listingsState = ref.watch(myListingsControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My Listings')),
      floatingActionButton: FloatingActionButton(
        key: const Key('new_listing_button'),
        onPressed: () => context.push('/listings/new'),
        child: const Icon(Icons.add),
      ),
      body: listingsState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => const Center(child: Text('Failed to load listings')),
        data: (listings) {
          if (listings.isEmpty) {
            return const Center(child: Text('No listings yet'));
          }
          return ListView.builder(
            itemCount: listings.length,
            itemBuilder: (context, index) {
              final listing = listings[index];
              return ListTile(
                key: Key('listing_tile_${listing.id}'),
                title: Text(listing.title),
                subtitle: Text(listing.status.name),
                onTap: () => context.push('/listings/${listing.id}'),
                trailing: PopupMenuButton<String>(
                  key: Key('listing_menu_${listing.id}'),
                  onSelected: (action) async {
                    final notifier = ref.read(myListingsControllerProvider.notifier);
                    if (action == 'edit') {
                      context.push('/listings/${listing.id}/edit', extra: listing);
                    } else if (action == 'mark_traded') {
                      await notifier.markTraded(listing.id);
                    } else if (action == 'remove') {
                      await notifier.remove(listing.id);
                    }
                  },
                  itemBuilder: (context) => [
                    const PopupMenuItem(value: 'edit', child: Text('Edit')),
                    if (listing.status == ListingStatus.active)
                      const PopupMenuItem(value: 'mark_traded', child: Text('Mark traded')),
                    const PopupMenuItem(value: 'remove', child: Text('Remove')),
                    if (listing.status == ListingStatus.draft)
                      const PopupMenuItem(
                        value: 'publish',
                        enabled: false,
                        child: Text('Publish (coming soon)'),
                      ),
                  ],
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

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/widget/my_listings_screen_test.dart` (from `apps/mobile_flutter`)
Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/screens/my_listings_screen.dart apps/mobile_flutter/test/widget/my_listings_screen_test.dart
git commit -m "F1: add My Listings screen (list, edit/mark-traded/remove, publish stub)"
git push
```

---

## Task 10: Listing create/edit form screen

**Files:**

- Create: `apps/mobile_flutter/lib/screens/listing_form_screen.dart`
- Test: `apps/mobile_flutter/test/widget/listing_form_screen_test.dart`

Takes an optional `existing` listing (passed in directly by the caller via `go_router`'s `extra`, avoiding a redundant re-fetch since My Listings already has the object). `existing == null` means create mode.

- [ ] **Step 1: Write the failing test**

`apps/mobile_flutter/test/widget/listing_form_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/category.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/screens/listing_form_screen.dart';
import '../support/fake_listings_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  testWidgets('create mode submits a new listing with the entered fields', (tester) async {
    final repo = FakeListingsRepository(
      categories: const [Category(id: 'c1', name: 'Bikes', sortOrder: 0)],
    );
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(
      const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          listingsRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: ListingFormScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('title_field')), 'Bike');
    await tester.enterText(find.byKey(const Key('description_field')), 'Red bike');
    await tester.tap(find.byKey(const Key('category_dropdown')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bikes').last);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('save_listing_button')));
    await tester.pumpAndSettle();

    final created = await repo.mine('tok1');
    expect(created, hasLength(1));
    expect(created.first.title, 'Bike');
    expect(created.first.description, 'Red bike');
    expect(created.first.categoryId, 'c1');
  });

  testWidgets('edit mode prefills fields from the existing listing', (tester) async {
    final existing = Listing(
      id: 'l1',
      ownerId: 'u1',
      type: ListingType.want,
      title: 'Chair',
      description: 'Any chair',
      condition: Condition.fair,
      categoryId: 'c1',
      status: ListingStatus.draft,
      photos: const [],
    );
    final repo = FakeListingsRepository(mine: [existing]);
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(
      const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          listingsRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: MaterialApp(home: ListingFormScreen(existing: existing)),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Chair'), findsOneWidget);
    expect(find.text('Any chair'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/widget/listing_form_screen_test.dart` (from `apps/mobile_flutter`)
Expected: FAIL — `package:garage_sale_mobile/screens/listing_form_screen.dart` does not exist.

- [ ] **Step 3: Write the screen**

`apps/mobile_flutter/lib/screens/listing_form_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_exception.dart';
import '../core/require_token.dart';
import '../listings/models/listing.dart';
import '../listings/my_listings_controller.dart';
import '../listings/providers.dart';

class ListingFormScreen extends ConsumerStatefulWidget {
  const ListingFormScreen({super.key, this.existing});
  final Listing? existing;

  @override
  ConsumerState<ListingFormScreen> createState() => _ListingFormScreenState();
}

class _ListingFormScreenState extends ConsumerState<ListingFormScreen> {
  late final TextEditingController _titleController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _cityController;
  late ListingType _type;
  late Condition _condition;
  String? _categoryId;
  final List<TextEditingController> _photoControllers = [];
  bool _isSubmitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _titleController = TextEditingController(text: existing?.title ?? '');
    _descriptionController = TextEditingController(text: existing?.description ?? '');
    _cityController = TextEditingController(text: existing?.city ?? '');
    _type = existing?.type ?? ListingType.have;
    _condition = existing?.condition ?? Condition.good;
    _categoryId = existing?.categoryId;
    for (final photo in existing?.photos ?? const <ListingPhoto>[]) {
      _photoControllers.add(TextEditingController(text: photo.url));
    }
  }

  Future<void> _submit() async {
    if (_categoryId == null) {
      setState(() => _error = 'Choose a category');
      return;
    }
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      final token = await requireAccessToken(ref);
      final input = ListingInput(
        type: _type,
        title: _titleController.text,
        description: _descriptionController.text,
        condition: _condition,
        categoryId: _categoryId!,
        city: _cityController.text.isEmpty ? null : _cityController.text,
        photos: _photoControllers
            .map((c) => c.text)
            .where((url) => url.isNotEmpty)
            .toList(),
      );
      final repo = ref.read(listingsRepositoryProvider);
      if (widget.existing == null) {
        await repo.create(input, token);
      } else {
        await repo.update(widget.existing!.id, input, token);
      }
      ref.invalidate(myListingsControllerProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Failed to save listing. Please try again.');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  void _addPhotoField() {
    setState(() => _photoControllers.add(TextEditingController()));
  }

  @override
  Widget build(BuildContext context) {
    final categoriesAsync = ref.watch(categoriesProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existing == null ? 'New Listing' : 'Edit Listing'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButton<ListingType>(
              key: const Key('type_dropdown'),
              value: _type,
              items: ListingType.values
                  .map((t) => DropdownMenuItem(value: t, child: Text(t.name)))
                  .toList(),
              onChanged: (value) => setState(() => _type = value ?? _type),
            ),
            TextField(
              key: const Key('title_field'),
              controller: _titleController,
              decoration: const InputDecoration(labelText: 'Title'),
            ),
            TextField(
              key: const Key('description_field'),
              controller: _descriptionController,
              decoration: const InputDecoration(labelText: 'Description'),
              maxLines: 3,
            ),
            DropdownButton<Condition>(
              key: const Key('condition_dropdown'),
              value: _condition,
              items: Condition.values
                  .map((c) => DropdownMenuItem(value: c, child: Text(c.name)))
                  .toList(),
              onChanged: (value) => setState(() => _condition = value ?? _condition),
            ),
            categoriesAsync.when(
              loading: () => const CircularProgressIndicator(),
              error: (error, _) => const Text('Failed to load categories'),
              data: (categories) => DropdownButton<String>(
                key: const Key('category_dropdown'),
                value: _categoryId,
                hint: const Text('Choose a category'),
                items: categories
                    .map((c) => DropdownMenuItem(value: c.id, child: Text(c.name)))
                    .toList(),
                onChanged: (value) => setState(() => _categoryId = value),
              ),
            ),
            TextField(
              key: const Key('city_field'),
              controller: _cityController,
              decoration: const InputDecoration(labelText: 'City (optional)'),
            ),
            const SizedBox(height: 8),
            const Text('Photo URLs'),
            for (var i = 0; i < _photoControllers.length; i++)
              TextField(
                key: Key('photo_field_$i'),
                controller: _photoControllers[i],
                decoration: const InputDecoration(labelText: 'Photo URL'),
              ),
            TextButton(
              key: const Key('add_photo_button'),
              onPressed: _addPhotoField,
              child: const Text('Add photo'),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            const SizedBox(height: 16),
            ElevatedButton(
              key: const Key('save_listing_button'),
              onPressed: _isSubmitting ? null : _submit,
              child: _isSubmitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/widget/listing_form_screen_test.dart` (from `apps/mobile_flutter`)
Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/screens/listing_form_screen.dart apps/mobile_flutter/test/widget/listing_form_screen_test.dart
git commit -m "F1: add listing create/edit form screen"
git push
```

---

## Task 11: Browse controller and screen

**Files:**

- Create: `apps/mobile_flutter/lib/listings/browse_controller.dart`
- Create: `apps/mobile_flutter/lib/screens/browse_screen.dart`
- Create: `apps/mobile_flutter/test/support/fake_browse_repository.dart`
- Test: `apps/mobile_flutter/test/widget/browse_screen_test.dart`

- [ ] **Step 1: Write the failing test**

`apps/mobile_flutter/test/support/fake_browse_repository.dart`:

```dart
import 'package:garage_sale_mobile/listings/browse_repository.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';

class FakeBrowseRepository implements BrowseRepository {
  FakeBrowseRepository({List<Listing> results = const []}) : _results = results;
  final List<Listing> _results;
  String? lastKeyword;

  @override
  Future<List<Listing>> search(
    String accessToken, {
    String? keyword,
    String? categoryId,
    Condition? condition,
    ListingType? type,
  }) async {
    lastKeyword = keyword;
    if (keyword == null || keyword.isEmpty) return _results;
    return _results.where((l) => l.title.contains(keyword)).toList();
  }
}
```

`apps/mobile_flutter/test/widget/browse_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/screens/browse_screen.dart';
import '../support/fake_browse_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _listing(String id, String title) {
  return Listing(
    id: id,
    ownerId: 'u2',
    type: ListingType.have,
    title: title,
    description: 'desc',
    condition: Condition.good,
    categoryId: 'c1',
    status: ListingStatus.active,
    photos: const [],
  );
}

void main() {
  testWidgets('shows search results and filters by keyword', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(
      const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
    );
    final repo = FakeBrowseRepository(
      results: [_listing('l1', 'Red bike'), _listing('l2', 'Blue chair')],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          browseRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: BrowseScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Red bike'), findsOneWidget);
    expect(find.text('Blue chair'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('keyword_field')), 'bike');
    await tester.tap(find.byKey(const Key('search_button')));
    await tester.pumpAndSettle();

    expect(repo.lastKeyword, 'bike');
    expect(find.text('Red bike'), findsOneWidget);
    expect(find.text('Blue chair'), findsNothing);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/widget/browse_screen_test.dart` (from `apps/mobile_flutter`)
Expected: FAIL — `package:garage_sale_mobile/listings/browse_controller.dart` and `package:garage_sale_mobile/screens/browse_screen.dart` do not exist.

- [ ] **Step 3: Write the controller and screen**

`apps/mobile_flutter/lib/listings/browse_controller.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'browse_repository.dart';
import 'models/listing.dart';
import 'providers.dart';

class BrowseController extends AsyncNotifier<List<Listing>> {
  BrowseRepository get _repo => ref.read(browseRepositoryProvider);

  @override
  Future<List<Listing>> build() => _search();

  Future<List<Listing>> _search({
    String? keyword,
    String? categoryId,
    Condition? condition,
    ListingType? type,
  }) async {
    final token = await requireAccessToken(ref);
    return _repo.search(
      token,
      keyword: keyword,
      categoryId: categoryId,
      condition: condition,
      type: type,
    );
  }

  Future<void> applyFilters({
    String? keyword,
    String? categoryId,
    Condition? condition,
    ListingType? type,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => _search(keyword: keyword, categoryId: categoryId, condition: condition, type: type),
    );
  }
}

final browseControllerProvider =
    AsyncNotifierProvider<BrowseController, List<Listing>>(BrowseController.new);
```

`apps/mobile_flutter/lib/screens/browse_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../listings/browse_controller.dart';
import '../listings/providers.dart';

class BrowseScreen extends ConsumerStatefulWidget {
  const BrowseScreen({super.key});

  @override
  ConsumerState<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends ConsumerState<BrowseScreen> {
  final _keywordController = TextEditingController();
  String? _categoryId;

  void _search() {
    ref.read(browseControllerProvider.notifier).applyFilters(
          keyword: _keywordController.text.isEmpty ? null : _keywordController.text,
          categoryId: _categoryId,
        );
  }

  @override
  Widget build(BuildContext context) {
    final listingsState = ref.watch(browseControllerProvider);
    final categoriesAsync = ref.watch(categoriesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Browse')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    key: const Key('keyword_field'),
                    controller: _keywordController,
                    decoration: const InputDecoration(labelText: 'Search'),
                  ),
                ),
                categoriesAsync.when(
                  loading: () => const SizedBox.shrink(),
                  error: (error, _) => const SizedBox.shrink(),
                  data: (categories) => DropdownButton<String?>(
                    key: const Key('category_filter_dropdown'),
                    value: _categoryId,
                    hint: const Text('Category'),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('All')),
                      ...categories.map(
                        (c) => DropdownMenuItem(value: c.id, child: Text(c.name)),
                      ),
                    ],
                    onChanged: (value) => setState(() => _categoryId = value),
                  ),
                ),
                IconButton(
                  key: const Key('search_button'),
                  icon: const Icon(Icons.search),
                  onPressed: _search,
                ),
              ],
            ),
          ),
          Expanded(
            child: listingsState.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => const Center(child: Text('Search failed')),
              data: (listings) {
                if (listings.isEmpty) {
                  return const Center(child: Text('No listings found'));
                }
                return ListView.builder(
                  itemCount: listings.length,
                  itemBuilder: (context, index) {
                    final listing = listings[index];
                    return ListTile(
                      key: Key('browse_tile_${listing.id}'),
                      title: Text(listing.title),
                      subtitle: Text(listing.categoryName ?? ''),
                      onTap: () => context.push('/listings/${listing.id}'),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/widget/browse_screen_test.dart` (from `apps/mobile_flutter`)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/listings/browse_controller.dart apps/mobile_flutter/lib/screens/browse_screen.dart apps/mobile_flutter/test/support/fake_browse_repository.dart apps/mobile_flutter/test/widget/browse_screen_test.dart
git commit -m "F1: add BrowseController and Browse screen"
git push
```

---

## Task 12: Listing detail — provider, watchlist controller, screen

**Files:**

- Create: `apps/mobile_flutter/lib/listings/listing_detail_provider.dart`
- Create: `apps/mobile_flutter/lib/listings/watchlist_controller.dart`
- Create: `apps/mobile_flutter/lib/screens/listing_detail_screen.dart`
- Create: `apps/mobile_flutter/test/support/fake_watchlist_repository.dart`
- Test: `apps/mobile_flutter/test/listings/watchlist_controller_test.dart`
- Test: `apps/mobile_flutter/test/widget/listing_detail_screen_test.dart`

- [ ] **Step 1: Write the failing tests**

`apps/mobile_flutter/test/support/fake_watchlist_repository.dart`:

```dart
import 'package:garage_sale_mobile/listings/models/watchlist_entry.dart';
import 'package:garage_sale_mobile/listings/watchlist_repository.dart';

class FakeWatchlistRepository implements WatchlistRepository {
  FakeWatchlistRepository({List<WatchlistEntry> entries = const []}) : _entries = entries;
  List<WatchlistEntry> _entries;

  @override
  Future<List<WatchlistEntry>> list(String accessToken) async => _entries;

  @override
  Future<void> add(String listingId, String accessToken) async {
    if (_entries.any((e) => e.listing.id == listingId)) return;
    // Tests only assert on the resulting count/ids, so a minimal stand-in
    // listing is fine here — full Listing objects come from FakeListingsRepository.
    throw UnimplementedError(
      'FakeWatchlistRepository.add requires seeding via the entries constructor '
      'param for this test double; extend if a test needs true add() support.',
    );
  }

  @override
  Future<void> remove(String listingId, String accessToken) async {
    _entries = _entries.where((e) => e.listing.id != listingId).toList();
  }
}
```

`apps/mobile_flutter/test/listings/watchlist_controller_test.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/models/watchlist_entry.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/listings/watchlist_controller.dart';
import '../support/fake_watchlist_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _listing(String id) {
  return Listing(
    id: id,
    ownerId: 'u2',
    type: ListingType.have,
    title: 'Bike $id',
    description: 'desc',
    condition: Condition.good,
    categoryId: 'c1',
    status: ListingStatus.active,
    photos: const [],
  );
}

void main() {
  group('WatchlistController', () {
    test('isWatched reflects the loaded entries', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(
        const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
      );
      final container = ProviderContainer(
        overrides: [
          watchlistRepositoryProvider.overrideWithValue(
            FakeWatchlistRepository(entries: [WatchlistEntry(id: 'w1', listing: _listing('l1'))]),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);

      await container.read(watchlistControllerProvider.future);

      final controller = container.read(watchlistControllerProvider.notifier);
      expect(controller.isWatched('l1'), isTrue);
      expect(controller.isWatched('l2'), isFalse);
    });

    test('toggle removes an already-watched listing', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(
        const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
      );
      final container = ProviderContainer(
        overrides: [
          watchlistRepositoryProvider.overrideWithValue(
            FakeWatchlistRepository(entries: [WatchlistEntry(id: 'w1', listing: _listing('l1'))]),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
      await container.read(watchlistControllerProvider.future);

      await container.read(watchlistControllerProvider.notifier).toggle('l1');

      final entries = container.read(watchlistControllerProvider).value!;
      expect(entries, isEmpty);
    });
  });
}
```

`apps/mobile_flutter/test/widget/listing_detail_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/screens/listing_detail_screen.dart';
import '../support/fake_listings_repository.dart';
import '../support/fake_watchlist_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  testWidgets('shows the listing title and description', (tester) async {
    final listing = Listing(
      id: 'l1',
      ownerId: 'u2',
      type: ListingType.have,
      title: 'Red bike',
      description: 'A very red bike',
      condition: Condition.good,
      categoryId: 'c1',
      status: ListingStatus.active,
      photos: const [],
    );
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(
      const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          listingsRepositoryProvider.overrideWithValue(
            FakeListingsRepository(mine: [listing]),
          ),
          watchlistRepositoryProvider.overrideWithValue(FakeWatchlistRepository()),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: ListingDetailScreen(listingId: 'l1')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Red bike'), findsOneWidget);
    expect(find.text('A very red bike'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `flutter test test/listings/watchlist_controller_test.dart test/widget/listing_detail_screen_test.dart` (from `apps/mobile_flutter`)
Expected: FAIL — `watchlist_controller.dart`, `listing_detail_provider.dart`, and `listing_detail_screen.dart` do not exist.

- [ ] **Step 3: Write the provider, controller, and screen**

`apps/mobile_flutter/lib/listings/listing_detail_provider.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'models/listing.dart';
import 'providers.dart';

final listingByIdProvider = FutureProvider.family<Listing, String>((ref, id) async {
  final token = await requireAccessToken(ref);
  return ref.watch(listingsRepositoryProvider).byId(id, token);
});
```

`apps/mobile_flutter/lib/listings/watchlist_controller.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'models/watchlist_entry.dart';
import 'providers.dart';
import 'watchlist_repository.dart';

class WatchlistController extends AsyncNotifier<List<WatchlistEntry>> {
  WatchlistRepository get _repo => ref.read(watchlistRepositoryProvider);

  @override
  Future<List<WatchlistEntry>> build() => _load();

  Future<List<WatchlistEntry>> _load() async {
    final token = await requireAccessToken(ref);
    return _repo.list(token);
  }

  bool isWatched(String listingId) {
    final entries = state.valueOrNull ?? const [];
    return entries.any((e) => e.listing.id == listingId);
  }

  Future<void> toggle(String listingId) async {
    final token = await requireAccessToken(ref);
    if (isWatched(listingId)) {
      await _repo.remove(listingId, token);
    } else {
      await _repo.add(listingId, token);
    }
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }
}

final watchlistControllerProvider =
    AsyncNotifierProvider<WatchlistController, List<WatchlistEntry>>(WatchlistController.new);
```

`apps/mobile_flutter/lib/screens/listing_detail_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../listings/listing_detail_provider.dart';
import '../listings/watchlist_controller.dart';

class ListingDetailScreen extends ConsumerWidget {
  const ListingDetailScreen({super.key, required this.listingId});
  final String listingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listingAsync = ref.watch(listingByIdProvider(listingId));
    final watchlistState = ref.watch(watchlistControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Listing')),
      body: listingAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => const Center(child: Text('Failed to load listing')),
        data: (listing) {
          final isWatched =
              watchlistState.valueOrNull?.any((e) => e.listing.id == listing.id) ?? false;
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (listing.photos.isNotEmpty)
                  SizedBox(
                    height: 200,
                    child: PageView(
                      children: [
                        for (final photo in listing.photos)
                          Image.network(photo.url, fit: BoxFit.cover),
                      ],
                    ),
                  ),
                const SizedBox(height: 16),
                Text(listing.title, style: Theme.of(context).textTheme.headlineSmall),
                Text(listing.description),
                const SizedBox(height: 16),
                Row(
                  children: [
                    IconButton(
                      key: const Key('watchlist_toggle_button'),
                      icon: Icon(isWatched ? Icons.favorite : Icons.favorite_border),
                      onPressed: () =>
                          ref.read(watchlistControllerProvider.notifier).toggle(listing.id),
                    ),
                    const Spacer(),
                    ElevatedButton(
                      key: const Key('propose_trade_button'),
                      onPressed: null,
                      child: const Text('Propose trade (coming soon)'),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `flutter test test/listings/watchlist_controller_test.dart test/widget/listing_detail_screen_test.dart` (from `apps/mobile_flutter`)
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/listings/listing_detail_provider.dart apps/mobile_flutter/lib/listings/watchlist_controller.dart apps/mobile_flutter/lib/screens/listing_detail_screen.dart apps/mobile_flutter/test/support/fake_watchlist_repository.dart apps/mobile_flutter/test/listings/watchlist_controller_test.dart apps/mobile_flutter/test/widget/listing_detail_screen_test.dart
git commit -m "F1: add listing detail screen, WatchlistController, listingByIdProvider"
git push
```

---

## Task 13: Watchlist screen, router wiring, Home nav

**Files:**

- Create: `apps/mobile_flutter/lib/screens/watchlist_screen.dart`
- Modify: `apps/mobile_flutter/lib/router/app_router.dart`
- Modify: `apps/mobile_flutter/lib/screens/home_screen.dart`
- Test: `apps/mobile_flutter/test/widget/watchlist_screen_test.dart`
- Modify: `apps/mobile_flutter/test/widget/app_flow_test.dart`

Wires everything from Tasks 9–12 into navigation. **Route ordering matters:** `go_router` matches top-level routes in list order, so `/listings/mine` and `/listings/new` (literal segments) must be declared before `/listings/:id` (dynamic) — otherwise `/listings/mine` would match `:id = 'mine'` first.

- [ ] **Step 1: Write the failing tests**

`apps/mobile_flutter/test/widget/watchlist_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/models/watchlist_entry.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/screens/watchlist_screen.dart';
import '../support/fake_watchlist_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _listing(String id) {
  return Listing(
    id: id,
    ownerId: 'u2',
    type: ListingType.have,
    title: 'Bike $id',
    description: 'desc',
    condition: Condition.good,
    categoryId: 'c1',
    status: ListingStatus.active,
    photos: const [],
  );
}

void main() {
  testWidgets('shows watched listings and removes on tap', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(
      const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          watchlistRepositoryProvider.overrideWithValue(
            FakeWatchlistRepository(entries: [WatchlistEntry(id: 'w1', listing: _listing('l1'))]),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: WatchlistScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bike l1'), findsOneWidget);

    await tester.tap(find.byKey(const Key('watchlist_remove_l1')));
    await tester.pumpAndSettle();

    expect(find.text('Bike l1'), findsNothing);
  });
}
```

Append to `apps/mobile_flutter/test/widget/app_flow_test.dart` (a second `testWidgets` block inside the existing `main()`, after the login/logout test):

```dart
  testWidgets('navigates from home to My Listings via the literal route, not the :id route', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
          tokenStorageProvider.overrideWithValue(
            TokenStorage(InMemoryKeyValueStore()),
          ),
          listingsRepositoryProvider.overrideWithValue(FakeListingsRepository()),
        ],
        child: const GarageSaleApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('email_field')), 'a@b.com');
    await tester.enterText(
      find.byKey(const Key('password_field')),
      'password123',
    );
    await tester.tap(find.byKey(const Key('login_button')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('my_listings_button')));
    await tester.pumpAndSettle();

    expect(find.text('My Listings'), findsOneWidget);
    expect(find.text('No listings yet'), findsOneWidget);
  });
```

Add the two new imports this second test needs to the top of `app_flow_test.dart`:

```dart
import 'package:garage_sale_mobile/listings/providers.dart';
import '../support/fake_listings_repository.dart';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `flutter test test/widget/watchlist_screen_test.dart test/widget/app_flow_test.dart` (from `apps/mobile_flutter`)
Expected: FAIL — `package:garage_sale_mobile/screens/watchlist_screen.dart` does not exist; `/listings/mine` route and `my_listings_button` don't exist yet.

- [ ] **Step 3: Write the watchlist screen, router, and home screen**

`apps/mobile_flutter/lib/screens/watchlist_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../listings/watchlist_controller.dart';

class WatchlistScreen extends ConsumerWidget {
  const WatchlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final watchlistState = ref.watch(watchlistControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Watchlist')),
      body: watchlistState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => const Center(child: Text('Failed to load watchlist')),
        data: (entries) {
          if (entries.isEmpty) {
            return const Center(child: Text('No watched listings'));
          }
          return ListView.builder(
            itemCount: entries.length,
            itemBuilder: (context, index) {
              final entry = entries[index];
              return ListTile(
                key: Key('watchlist_tile_${entry.listing.id}'),
                title: Text(entry.listing.title),
                onTap: () => context.push('/listings/${entry.listing.id}'),
                trailing: IconButton(
                  key: Key('watchlist_remove_${entry.listing.id}'),
                  icon: const Icon(Icons.close),
                  onPressed: () =>
                      ref.read(watchlistControllerProvider.notifier).toggle(entry.listing.id),
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

Replace the full contents of `apps/mobile_flutter/lib/router/app_router.dart`:

```dart
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';
import '../listings/models/listing.dart';
import '../screens/browse_screen.dart';
import '../screens/home_screen.dart';
import '../screens/listing_detail_screen.dart';
import '../screens/listing_form_screen.dart';
import '../screens/login_screen.dart';
import '../screens/my_listings_screen.dart';
import '../screens/register_screen.dart';
import '../screens/watchlist_screen.dart';

class _RouterRefreshNotifier extends ChangeNotifier {
  _RouterRefreshNotifier(Ref ref) {
    ref.listen(authControllerProvider, (_, __) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefreshNotifier(ref);
  return GoRouter(
    initialLocation: '/login',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      if (auth.isLoading) return null;
      final authenticated = auth.valueOrNull != null;
      final loggingIn =
          state.matchedLocation == '/login' ||
          state.matchedLocation == '/register';
      if (!authenticated && !loggingIn) return '/login';
      if (authenticated && loggingIn) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
      GoRoute(path: '/browse', builder: (context, state) => const BrowseScreen()),
      GoRoute(
        path: '/watchlist',
        builder: (context, state) => const WatchlistScreen(),
      ),
      // Literal segments must come before the /listings/:id family below —
      // go_router matches top-level routes in list order.
      GoRoute(
        path: '/listings/mine',
        builder: (context, state) => const MyListingsScreen(),
      ),
      GoRoute(
        path: '/listings/new',
        builder: (context, state) => const ListingFormScreen(),
      ),
      GoRoute(
        path: '/listings/:id/edit',
        builder: (context, state) =>
            ListingFormScreen(existing: state.extra as Listing?),
      ),
      GoRoute(
        path: '/listings/:id',
        builder: (context, state) =>
            ListingDetailScreen(listingId: state.pathParameters['id']!),
      ),
    ],
  );
});
```

Replace the full contents of `apps/mobile_flutter/lib/screens/home_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('Garage Sale')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Signed in as ${user?.email ?? ''}'),
            const SizedBox(height: 16),
            ElevatedButton(
              key: const Key('browse_button'),
              onPressed: () => context.push('/browse'),
              child: const Text('Browse'),
            ),
            ElevatedButton(
              key: const Key('my_listings_button'),
              onPressed: () => context.push('/listings/mine'),
              child: const Text('My Listings'),
            ),
            ElevatedButton(
              key: const Key('watchlist_button'),
              onPressed: () => context.push('/watchlist'),
              child: const Text('Watchlist'),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              key: const Key('logout_button'),
              onPressed: () =>
                  ref.read(authControllerProvider.notifier).logout(),
              child: const Text('Log out'),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `flutter test` (from `apps/mobile_flutter`)
Expected: PASS — the full suite (all tasks 0–13), no regressions in F0's tests.

- [ ] **Step 5: Analyze**

Run: `flutter analyze` (from `apps/mobile_flutter`)
Expected: "No issues found!"

- [ ] **Step 6: Commit**

```bash
git add apps/mobile_flutter/lib/screens/watchlist_screen.dart apps/mobile_flutter/lib/router/app_router.dart apps/mobile_flutter/lib/screens/home_screen.dart apps/mobile_flutter/test/widget/watchlist_screen_test.dart apps/mobile_flutter/test/widget/app_flow_test.dart
git commit -m "F1: add Watchlist screen, wire listings routes and Home nav"
git push
```

---

## Final verification

After Task 13, run the full pre-commit-equivalent gate before considering F1 done:

- [ ] **Backend:** `pnpm --filter @garage-sale/web typecheck && pnpm --filter @garage-sale/web lint`
- [ ] **Flutter:** `flutter test && flutter analyze` (from `apps/mobile_flutter`)
- [ ] **Repo-wide format:** `pnpm format:check` (from repo root — `apps/mobile_flutter` stays excluded per `.prettierignore`)

All three must pass clean before merging this branch back to `main`.
