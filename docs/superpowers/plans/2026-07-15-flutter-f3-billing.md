# Flutter Mobile F3: Stripe Card-on-File + Publish Fee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Flutter mobile app (`apps/mobile_flutter`) to parity with the web portal and the old RN app on billing: add a card on file via Stripe's native PaymentSheet, view/replace/remove that card, and publish a DRAFT listing by charging the non-refundable per-post fee.

**Architecture:** The backend business logic (`packages/api/src/billing.ts` + the `billing` tRPC router) is already fully built for web/RN — this phase only adds 4 new REST facade routes under `apps/web/src/app/api/mobile/billing/*` and `apps/web/src/app/api/mobile/listings/[id]/publish/*` that wrap the existing `billing` router (same `appRouter.createCaller` pattern as every other `/api/mobile/*` route — no duplicated business logic). On the Flutter side: `flutter_stripe` (native PaymentSheet, same SDK family as the RN app's `@stripe/stripe-react-native`) collects the card via a SetupIntent; a `BillingRepository`/`RestBillingRepository` + `BillingController` (Riverpod `AsyncNotifier`) mirror the existing `listings`/`watchlist` repo+controller shape; two screens (`PaymentMethodScreen`, `PublishScreen`) replace the "Publish (coming soon)" disabled stub in `my_listings_screen.dart`.

**Tech Stack:** Flutter/Dart, `flutter_riverpod`, `go_router`, `flutter_stripe` (new dependency), Next.js route handlers + tRPC (`@garage-sale/api`), Stripe (already configured server-side).

---

## Context for every implementer (do not skip)

- Dart package name for `apps/mobile_flutter` is **`garage_sale_mobile`** (per `pubspec.yaml` — NOT `mobile_flutter`, despite the directory name). All `package:` imports use `package:garage_sale_mobile/...`.
- Money is in **cents** everywhere on the backend (`feeCents`, `amountCents`) — the Flutter side only ever displays `(feeCents / 100).toStringAsFixed(2)`, never does its own rounding/currency math.
- The backend billing router (`packages/api/src/routers/billing.ts` + `packages/api/src/billing.ts`) is **out of scope** — do not modify it. Its 4 procedures:
  - `billing.createSetupIntent` (mutation, no input) → `{ clientSecret: string }`
  - `billing.status` (query, no input) → `{ paymentValid: boolean, hasCard: boolean, feeCents: number }`
  - `billing.removeCard` (mutation, no input) → `{ ok: true }`
  - `billing.publishListing` (mutation, `{ listingId: string }`) → `{ listingId: string, feeChargeId: string, status: 'PENDING' }`, or throws `NOT_FOUND` / `FORBIDDEN` (not owner, or no valid card) / `BAD_REQUEST` (already charged, or not a DRAFT listing) / `PAYMENT_REQUIRED` (Stripe declined the off-session charge).
- **Fee/publish business rule (already enforced server-side, Flutter just reflects it):** publishing a DRAFT listing charges the current flat fee. It is non-refundable. Editing a live (`ACTIVE`/`LOCKED`) listing never goes through billing at all — there is nothing to wire up for that on the Flutter side, it's already true simply because the edit form doesn't call any billing procedure.
- **Known pre-existing gap, not F3's job to fix:** today only a listing in `DRAFT` status can call `publishListing` — there's no existing flow (web or mobile) to move a `REMOVED`/`COMPLETED` listing back to `DRAFT` for a relist-and-recharge. Don't build that here; it's an identical gap on web, out of scope for this phase.
- **Testability rule for anything touching the real Stripe SDK:** `Stripe.instance.initPaymentSheet`/`presentPaymentSheet` are native platform-channel calls. A previous phase (F1) hit widget tests hanging in `pumpAndSettle` because a screen called a real platform channel (`flutter_secure_storage`) with no override available. To avoid the same problem here, the one function that calls the real Stripe SDK (`presentCardSheet` in `lib/billing/card_sheet.dart`) must be **injectable** — every screen that needs it takes it as an optional constructor parameter defaulting to the real function, so widget tests can pass a fake implementation instead. This is spelled out in the relevant tasks below; don't skip it.
- **`flutter_stripe`'s exact API surface (class names for `initPaymentSheet`'s parameters, the shape of a thrown `StripeException`) is drafted below from best available knowledge, not guaranteed byte-exact.** Before finalizing `lib/billing/card_sheet.dart`, verify the real API against the installed package's source under the pub cache (`flutter pub get` first, then inspect e.g. `~/AppData/Local/Pub/Cache/hosted/pub.dev/flutter_stripe-*/lib/src/...` or wherever `flutter pub deps`/the `.dart_tool/package_config.json` points). This mirrors how F2 verified `FamilyAsyncNotifier` against the real `flutter_riverpod` source before trusting the plan's draft.
- No Android emulator/iOS simulator is available in this dev environment. `flutter analyze` and `flutter test` passing is not proof the native PaymentSheet actually renders — that's a manual smoke-test follow-up once a device/emulator is available (same caveat already recorded for F2).
- Every implementer works on branch `feat/flutter-mobile-f3` (already created off `main`). Do **not** run `git commit` if you were dispatched as part of a parallel wave — the controlling session commits serially after both reviews pass, to avoid a git-index race with other parallel agents. If you're executing this plan solo/sequentially (not as a parallel wave), commit normally at the end of each task as shown.

---

## Wave 1 — 2 parallel tracks (no shared files, no ordering dependency)

### Task 1 (Track A): Backend REST facade for billing

**Files:**

- Create: `apps/web/src/app/api/mobile/billing/setup-intent/route.ts`
- Create: `apps/web/src/app/api/mobile/billing/status/route.ts`
- Create: `apps/web/src/app/api/mobile/billing/remove-card/route.ts`
- Create: `apps/web/src/app/api/mobile/listings/[id]/publish/route.ts`

These wrap the existing `billing` tRPC router exactly the way every other file under `apps/web/src/app/api/mobile/*` wraps its router — `appRouter.createCaller(await createContext({ headers: req.headers }))`, a local `STATUS` map translating `TRPCError.code` to an HTTP status, falling back to 400 for anything unmapped or non-tRPC.

- [ ] **Step 1: Create the setup-intent route**

```ts
// apps/web/src/app/api/mobile/billing/setup-intent/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403 };

export async function POST(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.billing.createSetupIntent();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to start card setup' }, { status: 400 });
  }
}
```

- [ ] **Step 2: Create the status route**

```ts
// apps/web/src/app/api/mobile/billing/status/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403 };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.billing.status();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load billing status' }, { status: 400 });
  }
}
```

- [ ] **Step 3: Create the remove-card route**

```ts
// apps/web/src/app/api/mobile/billing/remove-card/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403 };

export async function POST(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.billing.removeCard();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to remove card' }, { status: 400 });
  }
}
```

- [ ] **Step 4: Create the publish route**

Note the extra `PAYMENT_REQUIRED: 402` entry — `billing.publishListing` throws this exact code when Stripe declines the off-session charge (`packages/api/src/billing.ts:137`), and no other existing `/api/mobile/*` route needs it, so it must be added here specifically rather than assumed already present.

```ts
// apps/web/src/app/api/mobile/listings/[id]/publish/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  PAYMENT_REQUIRED: 402,
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.billing.publishListing({ listingId: id });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to publish listing' }, { status: 400 });
  }
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter @garage-sale/web typecheck && pnpm --filter @garage-sale/web lint`
Expected: both pass with no errors.

- [ ] **Step 6: Commit** (skip `git commit` if dispatched as part of a parallel wave — see "Context for every implementer" above)

```bash
git add apps/web/src/app/api/mobile/billing apps/web/src/app/api/mobile/listings/\[id\]/publish
git commit -m "F3(a): add billing REST facade routes for Flutter mobile"
```

---

### Task 2 (Track B): Flutter foundation — flutter_stripe dependency + billing models + Env

**Files:**

- Modify: `apps/mobile_flutter/pubspec.yaml`
- Modify: `apps/mobile_flutter/lib/core/env.dart`
- Create: `apps/mobile_flutter/lib/billing/models/billing_status.dart`
- Create: `apps/mobile_flutter/lib/billing/models/publish_result.dart`
- Test: `apps/mobile_flutter/test/billing/models/billing_status_test.dart`
- Test: `apps/mobile_flutter/test/billing/models/publish_result_test.dart`

- [ ] **Step 1: Add the flutter_stripe dependency**

Run: `cd apps/mobile_flutter && flutter pub add flutter_stripe`
Expected: `pubspec.yaml` gains a `flutter_stripe: ^<resolved version>` line under `dependencies`, and `flutter pub get` runs automatically as part of `pub add`. Use the actual resolved version — don't hand-type a version number, let pub resolve it, since guessing one that doesn't exist would break `pub get` for everyone after you.

Note any post-install message `flutter_stripe` prints about minimum Android `minSdkVersion` or iOS deployment target. If it requires bumping `android/app/build.gradle.kts`'s `minSdk` or `ios/Podfile`'s `platform :ios`, do that bump now and note it in your task summary — there's no emulator/simulator available in this environment to verify a full native build, so this is a best-effort config match against the package's stated requirements, not a verified-working build.

- [ ] **Step 2: Add the Stripe publishable key to Env**

```dart
// apps/mobile_flutter/lib/core/env.dart
class Env {
  /// Override at build/run time: --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
  /// (10.0.2.2 is the Android emulator's alias for the host machine's localhost).
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api',
  );

  /// Override at build/run time: --dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_...
  static const stripePublishableKey = String.fromEnvironment(
    'STRIPE_PUBLISHABLE_KEY',
    defaultValue: '',
  );
}
```

- [ ] **Step 3: Write the failing model tests**

```dart
// apps/mobile_flutter/test/billing/models/billing_status_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/billing/models/billing_status.dart';

void main() {
  test('fromJson decodes all fields', () {
    final status = BillingStatus.fromJson({
      'paymentValid': true,
      'hasCard': true,
      'feeCents': 199,
    });

    expect(status.paymentValid, isTrue);
    expect(status.hasCard, isTrue);
    expect(status.feeCents, 199);
  });
}
```

```dart
// apps/mobile_flutter/test/billing/models/publish_result_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/billing/models/publish_result.dart';

void main() {
  test('fromJson decodes all fields', () {
    final result = PublishResult.fromJson({
      'listingId': 'l1',
      'feeChargeId': 'fee1',
      'status': 'PENDING',
    });

    expect(result.listingId, 'l1');
    expect(result.feeChargeId, 'fee1');
    expect(result.status, 'PENDING');
  });
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd apps/mobile_flutter && flutter test test/billing/models/`
Expected: FAIL — `billing_status.dart`/`publish_result.dart` don't exist yet.

- [ ] **Step 5: Implement the models**

```dart
// apps/mobile_flutter/lib/billing/models/billing_status.dart
class BillingStatus {
  const BillingStatus({
    required this.paymentValid,
    required this.hasCard,
    required this.feeCents,
  });

  final bool paymentValid;
  final bool hasCard;
  final int feeCents;

  factory BillingStatus.fromJson(Map<String, dynamic> json) => BillingStatus(
        paymentValid: json['paymentValid'] as bool,
        hasCard: json['hasCard'] as bool,
        feeCents: json['feeCents'] as int,
      );
}
```

```dart
// apps/mobile_flutter/lib/billing/models/publish_result.dart
class PublishResult {
  const PublishResult({
    required this.listingId,
    required this.feeChargeId,
    required this.status,
  });

  final String listingId;
  final String feeChargeId;
  final String status;

  factory PublishResult.fromJson(Map<String, dynamic> json) => PublishResult(
        listingId: json['listingId'] as String,
        feeChargeId: json['feeChargeId'] as String,
        status: json['status'] as String,
      );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/mobile_flutter && flutter test test/billing/models/`
Expected: PASS (2/2).

- [ ] **Step 7: Commit** (skip if dispatched as part of a parallel wave)

```bash
git add apps/mobile_flutter/pubspec.yaml apps/mobile_flutter/pubspec.lock apps/mobile_flutter/lib/core/env.dart apps/mobile_flutter/lib/billing apps/mobile_flutter/test/billing
git commit -m "F3(b): add flutter_stripe dependency and billing domain models"
```

---

## Wave 2 — 1 track (depends on Task 2's models existing)

### Task 3: BillingRepository + RestBillingRepository + FakeBillingRepository

**Files:**

- Create: `apps/mobile_flutter/lib/billing/billing_repository.dart`
- Create: `apps/mobile_flutter/lib/billing/rest_billing_repository.dart`
- Create: `apps/mobile_flutter/test/support/fake_billing_repository.dart`
- Test: `apps/mobile_flutter/test/billing/rest_billing_repository_test.dart`

- [ ] **Step 1: Define the repository interface**

```dart
// apps/mobile_flutter/lib/billing/billing_repository.dart
import 'models/billing_status.dart';
import 'models/publish_result.dart';

abstract class BillingRepository {
  Future<BillingStatus> status(String accessToken);

  /// Returns the Stripe SetupIntent client secret, to hand to the native
  /// PaymentSheet via [presentCardSheet].
  Future<String> createSetupIntent(String accessToken);

  Future<void> removeCard(String accessToken);

  Future<PublishResult> publish(String listingId, String accessToken);
}
```

- [ ] **Step 2: Write the failing REST repository tests**

```dart
// apps/mobile_flutter/test/billing/rest_billing_repository_test.dart
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/billing/rest_billing_repository.dart';

void main() {
  group('RestBillingRepository', () {
    test('status decodes the billing status', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(
          jsonEncode({'paymentValid': true, 'hasCard': true, 'feeCents': 199}),
          200,
        );
      });
      final repo = RestBillingRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final status = await repo.status('tok123');

      expect(captured.method, 'GET');
      expect(captured.url.path, '/api/mobile/billing/status');
      expect(captured.headers['Authorization'], 'Bearer tok123');
      expect(status.paymentValid, isTrue);
      expect(status.feeCents, 199);
    });

    test('createSetupIntent posts and returns the client secret', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'clientSecret': 'seti_123_secret'}), 200);
      });
      final repo = RestBillingRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final clientSecret = await repo.createSetupIntent('tok123');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/billing/setup-intent');
      expect(clientSecret, 'seti_123_secret');
    });

    test('removeCard posts to the remove-card endpoint', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestBillingRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.removeCard('tok123');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/billing/remove-card');
    });

    test('publish posts to the listing-scoped publish endpoint', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(
          jsonEncode({'listingId': 'l1', 'feeChargeId': 'fee1', 'status': 'PENDING'}),
          200,
        );
      });
      final repo = RestBillingRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final result = await repo.publish('l1', 'tok123');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/listings/l1/publish');
      expect(result.feeChargeId, 'fee1');
    });
  });
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/mobile_flutter && flutter test test/billing/rest_billing_repository_test.dart`
Expected: FAIL — `RestBillingRepository` doesn't exist yet.

- [ ] **Step 4: Implement RestBillingRepository**

```dart
// apps/mobile_flutter/lib/billing/rest_billing_repository.dart
import '../core/api_client.dart';
import 'billing_repository.dart';
import 'models/billing_status.dart';
import 'models/publish_result.dart';

class RestBillingRepository implements BillingRepository {
  RestBillingRepository(this._client);
  final ApiClient _client;

  @override
  Future<BillingStatus> status(String accessToken) async {
    final json = await _client.get('/mobile/billing/status', accessToken: accessToken);
    return BillingStatus.fromJson(json);
  }

  @override
  Future<String> createSetupIntent(String accessToken) async {
    final json = await _client.post(
      '/mobile/billing/setup-intent',
      const {},
      accessToken: accessToken,
    );
    return json['clientSecret'] as String;
  }

  @override
  Future<void> removeCard(String accessToken) async {
    await _client.post('/mobile/billing/remove-card', const {}, accessToken: accessToken);
  }

  @override
  Future<PublishResult> publish(String listingId, String accessToken) async {
    final json = await _client.post(
      '/mobile/listings/$listingId/publish',
      const {},
      accessToken: accessToken,
    );
    return PublishResult.fromJson(json);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/mobile_flutter && flutter test test/billing/rest_billing_repository_test.dart`
Expected: PASS (4/4).

- [ ] **Step 6: Add the fake repository test double**

`publishError` lets a test simulate a declined charge or any other publish failure by throwing whatever the caller sets (e.g. `ApiException(402, 'Your card was declined')`), matching how `RestBillingRepository.publish` would surface a real 402 from the new route.

```dart
// apps/mobile_flutter/test/support/fake_billing_repository.dart
import 'package:garage_sale_mobile/billing/billing_repository.dart';
import 'package:garage_sale_mobile/billing/models/billing_status.dart';
import 'package:garage_sale_mobile/billing/models/publish_result.dart';

class FakeBillingRepository implements BillingRepository {
  FakeBillingRepository({
    BillingStatus initialStatus = const BillingStatus(
      paymentValid: false,
      hasCard: false,
      feeCents: 199,
    ),
    this.setupIntentClientSecret = 'seti_test_secret',
  }) : _status = initialStatus;

  BillingStatus _status;
  final String setupIntentClientSecret;
  int removeCardCalls = 0;
  int publishCalls = 0;
  Object? publishError;

  @override
  Future<BillingStatus> status(String accessToken) async => _status;

  @override
  Future<String> createSetupIntent(String accessToken) async => setupIntentClientSecret;

  @override
  Future<void> removeCard(String accessToken) async {
    removeCardCalls++;
    _status = BillingStatus(
      paymentValid: false,
      hasCard: false,
      feeCents: _status.feeCents,
    );
  }

  @override
  Future<PublishResult> publish(String listingId, String accessToken) async {
    publishCalls++;
    if (publishError != null) throw publishError!;
    return PublishResult(listingId: listingId, feeChargeId: 'fee-1', status: 'PENDING');
  }

  /// Test helper: simulate the setup-intent webhook having completed, i.e.
  /// a card is now on file.
  void markCardOnFile() {
    _status = BillingStatus(paymentValid: true, hasCard: true, feeCents: _status.feeCents);
  }
}
```

- [ ] **Step 7: Commit** (skip if dispatched as part of a parallel wave)

```bash
git add apps/mobile_flutter/lib/billing/billing_repository.dart apps/mobile_flutter/lib/billing/rest_billing_repository.dart apps/mobile_flutter/test/billing/rest_billing_repository_test.dart apps/mobile_flutter/test/support/fake_billing_repository.dart
git commit -m "F3(c): add BillingRepository + REST impl + fake test double"
```

---

## Wave 3 — 1 track (depends on Task 3)

### Task 4: BillingController + billing providers + card_sheet helper

**Files:**

- Create: `apps/mobile_flutter/lib/billing/providers.dart`
- Create: `apps/mobile_flutter/lib/billing/billing_controller.dart`
- Create: `apps/mobile_flutter/lib/billing/card_sheet.dart`
- Test: `apps/mobile_flutter/test/billing/billing_controller_test.dart`

- [ ] **Step 1: Add the repository provider**

```dart
// apps/mobile_flutter/lib/billing/providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'billing_repository.dart';
import 'rest_billing_repository.dart';

final billingRepositoryProvider = Provider<BillingRepository>(
  (ref) => RestBillingRepository(ref.watch(apiClientProvider)),
);
```

- [ ] **Step 2: Write the failing controller tests**

Mirrors `test/listings/watchlist_controller_test.dart`'s shape: seed a `TokenStorage`, override `billingRepositoryProvider` with the fake, read `billingControllerProvider.future` to resolve the initial load, then exercise mutating methods.

```dart
// apps/mobile_flutter/test/billing/billing_controller_test.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/billing/billing_controller.dart';
import 'package:garage_sale_mobile/billing/providers.dart';
import '../support/fake_billing_repository.dart';
import '../support/in_memory_key_value_store.dart';

Future<TokenStorage> _seededTokenStorage() async {
  final storage = TokenStorage(InMemoryKeyValueStore());
  await storage.saveTokens(
    const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
  );
  return storage;
}

void main() {
  group('BillingController', () {
    test('build loads the initial billing status', () async {
      final storage = await _seededTokenStorage();
      final container = ProviderContainer(
        overrides: [
          billingRepositoryProvider.overrideWithValue(FakeBillingRepository()),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);

      final status = await container.read(billingControllerProvider.future);

      expect(status.hasCard, isFalse);
      expect(status.feeCents, 199);
    });

    test('refresh reloads the status', () async {
      final storage = await _seededTokenStorage();
      final repo = FakeBillingRepository();
      final container = ProviderContainer(
        overrides: [
          billingRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
      await container.read(billingControllerProvider.future);
      repo.markCardOnFile();

      await container.read(billingControllerProvider.notifier).refresh();

      final status = container.read(billingControllerProvider).value!;
      expect(status.hasCard, isTrue);
    });

    test('removeCard clears the card and reloads', () async {
      final storage = await _seededTokenStorage();
      final repo = FakeBillingRepository()..markCardOnFile();
      final container = ProviderContainer(
        overrides: [
          billingRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
      await container.read(billingControllerProvider.future);

      await container.read(billingControllerProvider.notifier).removeCard();

      expect(repo.removeCardCalls, 1);
      final status = container.read(billingControllerProvider).value!;
      expect(status.hasCard, isFalse);
    });
  });
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/mobile_flutter && flutter test test/billing/billing_controller_test.dart`
Expected: FAIL — `BillingController`/`billingControllerProvider` don't exist yet.

- [ ] **Step 4: Implement BillingController**

```dart
// apps/mobile_flutter/lib/billing/billing_controller.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'billing_repository.dart';
import 'models/billing_status.dart';
import 'providers.dart';

class BillingController extends AsyncNotifier<BillingStatus> {
  BillingRepository get _repo => ref.read(billingRepositoryProvider);

  @override
  Future<BillingStatus> build() => _load();

  Future<BillingStatus> _load() async {
    final token = await requireAccessToken(ref);
    return _repo.status(token);
  }

  Future<void> refresh() async {
    await future;
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  Future<void> removeCard() async {
    await future;
    final token = await requireAccessToken(ref);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await _repo.removeCard(token);
      return _load();
    });
  }
}

final billingControllerProvider =
    AsyncNotifierProvider<BillingController, BillingStatus>(BillingController.new);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/mobile_flutter && flutter test test/billing/billing_controller_test.dart`
Expected: PASS (3/3).

- [ ] **Step 6: Implement the card_sheet helper**

This is the direct Flutter equivalent of the RN app's `apps/mobile/src/billing/useCardSheet.ts` — present the native PaymentSheet in "setup" mode against a SetupIntent client secret, distinguishing a user-cancelled sheet from a real error.

**Before finalizing this file:** verify `SetupPaymentSheetParameters` (the class used for `initPaymentSheet`'s setup-mode parameters) and the exact shape of a thrown `StripeException` (its `.error` field's type and how to detect "user cancelled" vs. a real decline) against the actual installed `flutter_stripe` package source — inspect it under the pub cache after `flutter pub get`. Adjust the code below if the real API differs from this draft.

`presentCardSheet` is a free top-level function (not a method on some class) specifically so screens can accept it as a constructor parameter and swap in a fake for widget tests — see the "Testability rule" note in the plan's shared context section.

```dart
// apps/mobile_flutter/lib/billing/card_sheet.dart
import 'package:flutter_stripe/flutter_stripe.dart';
import 'billing_repository.dart';

class CardSheetResult {
  const CardSheetResult({required this.ok, this.cancelled = false, this.error});
  final bool ok;
  final bool cancelled;
  final String? error;
}

/// Presents the native Stripe PaymentSheet in "setup" mode to collect a card
/// on file. Mirrors `apps/mobile/src/billing/useCardSheet.ts` from the old
/// RN app.
Future<CardSheetResult> presentCardSheet(
  BillingRepository repo,
  String accessToken,
) async {
  try {
    final clientSecret = await repo.createSetupIntent(accessToken);
    await Stripe.instance.initPaymentSheet(
      paymentSheetParameters: SetupPaymentSheetParameters(
        setupIntentClientSecret: clientSecret,
        merchantDisplayName: 'Garage Sale',
      ),
    );
    await Stripe.instance.presentPaymentSheet();
    return const CardSheetResult(ok: true);
  } on StripeException catch (e) {
    if (e.error.code == FailureCode.Canceled) {
      return const CardSheetResult(ok: false, cancelled: true);
    }
    return CardSheetResult(
      ok: false,
      error: e.error.localizedMessage ?? e.error.message ?? 'Could not add card',
    );
  } catch (e) {
    return const CardSheetResult(ok: false, error: 'Could not start card setup');
  }
}
```

- [ ] **Step 7: Run the full billing test suite and analyze**

Run: `cd apps/mobile_flutter && flutter analyze lib/billing test/billing && flutter test test/billing/`
Expected: no analyzer issues; all billing tests pass. `card_sheet.dart` has no direct unit test here (it wraps native platform calls) — it's exercised indirectly via injected fakes in Wave 4's screen tests.

- [ ] **Step 8: Commit** (skip if dispatched as part of a parallel wave)

```bash
git add apps/mobile_flutter/lib/billing/providers.dart apps/mobile_flutter/lib/billing/billing_controller.dart apps/mobile_flutter/lib/billing/card_sheet.dart apps/mobile_flutter/test/billing/billing_controller_test.dart
git commit -m "F3(d): add BillingController, providers, and card_sheet helper"
```

---

## Wave 4 — 2 parallel tracks (both depend on Task 4; touch different files from each other)

### Task 5 (Track E1): PaymentMethodScreen

**Files:**

- Create: `apps/mobile_flutter/lib/screens/payment_method_screen.dart`
- Test: `apps/mobile_flutter/test/widget/payment_method_screen_test.dart`

Mirrors the RN app's `PaymentMethodScreen.tsx`: shows current card status, an add/replace-card button (via the injected `presentCardSheet`), and a remove-card button gated behind a confirm dialog (matching the destructive-confirm pattern the RN screen used).

- [ ] **Step 1: Write the failing widget tests**

The `presentCardSheet` parameter lets the test inject a fake that doesn't touch the real Stripe SDK — see the "Testability rule" in the plan's shared context.

```dart
// apps/mobile_flutter/test/widget/payment_method_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/billing/billing_repository.dart';
import 'package:garage_sale_mobile/billing/card_sheet.dart';
import 'package:garage_sale_mobile/billing/providers.dart';
import 'package:garage_sale_mobile/screens/payment_method_screen.dart';
import '../support/fake_billing_repository.dart';
import '../support/in_memory_key_value_store.dart';

Future<TokenStorage> _seededTokenStorage() async {
  final storage = TokenStorage(InMemoryKeyValueStore());
  await storage.saveTokens(
    const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
  );
  return storage;
}

void main() {
  testWidgets('shows "No card on file" and adds a card', (tester) async {
    final tokenStorage = await _seededTokenStorage();
    final repo = FakeBillingRepository();
    Future<CardSheetResult> fakeCardSheet(BillingRepository r, String token) async {
      repo.markCardOnFile();
      return const CardSheetResult(ok: true);
    }

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          billingRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(tokenStorage),
        ],
        child: MaterialApp(
          home: PaymentMethodScreen(presentCardSheet: fakeCardSheet),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No card on file'), findsOneWidget);

    await tester.tap(find.byKey(const Key('add_replace_card_button')));
    await tester.pumpAndSettle();

    expect(find.text('Card on file'), findsOneWidget);
  });

  testWidgets('removing a card requires confirmation', (tester) async {
    final tokenStorage = await _seededTokenStorage();
    final repo = FakeBillingRepository()..markCardOnFile();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          billingRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(tokenStorage),
        ],
        child: const MaterialApp(home: PaymentMethodScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('remove_card_button')));
    await tester.pumpAndSettle();
    expect(repo.removeCardCalls, 0);

    await tester.tap(find.byKey(const Key('confirm_remove_card_button')));
    await tester.pumpAndSettle();

    expect(repo.removeCardCalls, 1);
    expect(find.text('No card on file'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile_flutter && flutter test test/widget/payment_method_screen_test.dart`
Expected: FAIL — `PaymentMethodScreen` doesn't exist yet.

- [ ] **Step 3: Implement PaymentMethodScreen**

```dart
// apps/mobile_flutter/lib/screens/payment_method_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import '../billing/billing_controller.dart';
import '../billing/billing_repository.dart';
import '../billing/card_sheet.dart';
import '../billing/providers.dart';
import '../core/require_token.dart';

class PaymentMethodScreen extends ConsumerStatefulWidget {
  const PaymentMethodScreen({super.key, this.presentCardSheet = presentCardSheet});

  /// Injected so widget tests can avoid touching the real Stripe SDK's
  /// platform channels. Defaults to the real implementation.
  final Future<CardSheetResult> Function(BillingRepository, String) presentCardSheet;

  @override
  ConsumerState<PaymentMethodScreen> createState() => _PaymentMethodScreenState();
}

class _PaymentMethodScreenState extends ConsumerState<PaymentMethodScreen> {
  bool _isBusy = false;
  String? _error;

  Future<void> _addOrReplaceCard() async {
    setState(() {
      _isBusy = true;
      _error = null;
    });
    final token = await requireAccessTokenFrom(ref.read(tokenStorageProvider));
    final result = await widget.presentCardSheet(ref.read(billingRepositoryProvider), token);
    if (mounted) setState(() => _isBusy = false);
    if (!result.ok && !result.cancelled) {
      setState(() => _error = result.error ?? 'Could not add card');
      return;
    }
    if (result.ok) ref.invalidate(billingControllerProvider);
  }

  Future<void> _removeCard() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove card?'),
        content: const Text(
          'You will need to add a new card before publishing another listing.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            key: const Key('confirm_remove_card_button'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() {
      _isBusy = true;
      _error = null;
    });
    try {
      await ref.read(billingControllerProvider.notifier).removeCard();
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusAsync = ref.watch(billingControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Payment method')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: statusAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => const Center(child: Text('Failed to load billing status')),
          data: (status) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                status.hasCard && status.paymentValid ? 'Card on file' : 'No card on file',
                key: const Key('card_status_text'),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                key: const Key('add_replace_card_button'),
                onPressed: _isBusy ? null : _addOrReplaceCard,
                child: Text(status.hasCard ? 'Replace card' : 'Add card'),
              ),
              if (status.hasCard)
                TextButton(
                  key: const Key('remove_card_button'),
                  onPressed: _isBusy ? null : _removeCard,
                  child: const Text('Remove card'),
                ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(_error!, style: const TextStyle(color: Colors.red)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile_flutter && flutter test test/widget/payment_method_screen_test.dart`
Expected: PASS (2/2).

- [ ] **Step 5: Commit** (skip if dispatched as part of a parallel wave)

```bash
git add apps/mobile_flutter/lib/screens/payment_method_screen.dart apps/mobile_flutter/test/widget/payment_method_screen_test.dart
git commit -m "F3(e): add PaymentMethodScreen"
```

---

### Task 6 (Track E2): PublishScreen

**Files:**

- Create: `apps/mobile_flutter/lib/screens/publish_screen.dart`
- Test: `apps/mobile_flutter/test/widget/publish_screen_test.dart`

Mirrors the RN app's `PublishScreen.tsx`: if a valid card is on file, shows the fee amount and a "Publish" button; otherwise shows "Add a card" first. The submit path follows the same `_isSubmitting`/`_error`/try-catch-finally convention as `listing_form_screen.dart`'s `_submit()` (finally always resets `_isSubmitting`, since navigating away on success unmounts the widget shortly after anyway).

- [ ] **Step 1: Write the failing widget tests**

```dart
// apps/mobile_flutter/test/widget/publish_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/billing/billing_repository.dart';
import 'package:garage_sale_mobile/billing/card_sheet.dart';
import 'package:garage_sale_mobile/billing/providers.dart';
import 'package:garage_sale_mobile/core/api_exception.dart';
import 'package:garage_sale_mobile/screens/publish_screen.dart';
import '../support/fake_billing_repository.dart';
import '../support/in_memory_key_value_store.dart';

Future<TokenStorage> _seededTokenStorage() async {
  final storage = TokenStorage(InMemoryKeyValueStore());
  await storage.saveTokens(
    const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
  );
  return storage;
}

void main() {
  testWidgets('prompts to add a card when none is on file', (tester) async {
    final tokenStorage = await _seededTokenStorage();
    final repo = FakeBillingRepository();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          billingRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(tokenStorage),
        ],
        child: const MaterialApp(home: PublishScreen(listingId: 'l1')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('add_card_button')), findsOneWidget);
    expect(find.byKey(const Key('publish_button')), findsNothing);
  });

  testWidgets('publishes when a valid card is on file', (tester) async {
    final tokenStorage = await _seededTokenStorage();
    final repo = FakeBillingRepository()..markCardOnFile();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          billingRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(tokenStorage),
        ],
        child: const MaterialApp(home: PublishScreen(listingId: 'l1')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('1.99'), findsOneWidget);
    await tester.tap(find.byKey(const Key('publish_button')));
    await tester.pumpAndSettle();

    expect(repo.publishCalls, 1);
  });

  testWidgets('shows an error message when publish fails', (tester) async {
    final tokenStorage = await _seededTokenStorage();
    final repo = FakeBillingRepository()..markCardOnFile();
    repo.publishError = const ApiException(402, 'Your card was declined');

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          billingRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(tokenStorage),
        ],
        child: const MaterialApp(home: PublishScreen(listingId: 'l1')),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('publish_button')));
    await tester.pumpAndSettle();

    expect(find.text('Your card was declined'), findsOneWidget);
  });

  testWidgets('adding a card via the injected sheet reveals the publish button', (tester) async {
    final tokenStorage = await _seededTokenStorage();
    final repo = FakeBillingRepository();
    Future<CardSheetResult> fakeCardSheet(BillingRepository r, String token) async {
      repo.markCardOnFile();
      return const CardSheetResult(ok: true);
    }

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          billingRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(tokenStorage),
        ],
        child: MaterialApp(
          home: PublishScreen(listingId: 'l1', presentCardSheet: fakeCardSheet),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('add_card_button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('publish_button')), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile_flutter && flutter test test/widget/publish_screen_test.dart`
Expected: FAIL — `PublishScreen` doesn't exist yet.

- [ ] **Step 3: Implement PublishScreen**

```dart
// apps/mobile_flutter/lib/screens/publish_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import '../billing/billing_controller.dart';
import '../billing/billing_repository.dart';
import '../billing/card_sheet.dart';
import '../billing/providers.dart';
import '../core/api_exception.dart';
import '../core/require_token.dart';
import '../listings/my_listings_controller.dart';

class PublishScreen extends ConsumerStatefulWidget {
  const PublishScreen({
    super.key,
    required this.listingId,
    this.presentCardSheet = presentCardSheet,
  });

  final String listingId;

  /// Injected so widget tests can avoid touching the real Stripe SDK's
  /// platform channels. Defaults to the real implementation.
  final Future<CardSheetResult> Function(BillingRepository, String) presentCardSheet;

  @override
  ConsumerState<PublishScreen> createState() => _PublishScreenState();
}

class _PublishScreenState extends ConsumerState<PublishScreen> {
  bool _isSubmitting = false;
  String? _error;

  Future<void> _addCard() async {
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    final token = await requireAccessTokenFrom(ref.read(tokenStorageProvider));
    final result = await widget.presentCardSheet(ref.read(billingRepositoryProvider), token);
    if (mounted) setState(() => _isSubmitting = false);
    if (!result.ok && !result.cancelled) {
      setState(() => _error = result.error ?? 'Could not add card');
      return;
    }
    if (result.ok) ref.invalidate(billingControllerProvider);
  }

  Future<void> _publish() async {
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      final token = await requireAccessTokenFrom(ref.read(tokenStorageProvider));
      await ref.read(billingRepositoryProvider).publish(widget.listingId, token);
      ref.invalidate(myListingsControllerProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Failed to publish listing. Please try again.');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusAsync = ref.watch(billingControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Publish listing')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: statusAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => const Center(child: Text('Failed to load billing status')),
          data: (status) {
            final fee = (status.feeCents / 100).toStringAsFixed(2);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'The fee is charged when your listing goes live and is '
                  'non-refundable. Editing a live listing is free.',
                ),
                const SizedBox(height: 16),
                if (status.paymentValid && status.hasCard) ...[
                  const Text('Card on file', key: Key('card_on_file_text')),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    key: const Key('publish_button'),
                    onPressed: _isSubmitting ? null : _publish,
                    child: _isSubmitting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text('Publish — \$$fee'),
                  ),
                ] else
                  ElevatedButton(
                    key: const Key('add_card_button'),
                    onPressed: _isSubmitting ? null : _addCard,
                    child: const Text('Add a card'),
                  ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(_error!, style: const TextStyle(color: Colors.red)),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile_flutter && flutter test test/widget/publish_screen_test.dart`
Expected: PASS (4/4).

- [ ] **Step 5: Commit** (skip if dispatched as part of a parallel wave)

```bash
git add apps/mobile_flutter/lib/screens/publish_screen.dart apps/mobile_flutter/test/widget/publish_screen_test.dart
git commit -m "F3(f): add PublishScreen"
```

---

## Wave 5 — 1 sequential task (the shared-file wiring; depends on Wave 4 both tracks)

### Task 7: Router wiring, Home/My-Listings nav, Stripe init, full gate

**Files:**

- Modify: `apps/mobile_flutter/lib/router/app_router.dart`
- Modify: `apps/mobile_flutter/lib/screens/home_screen.dart`
- Modify: `apps/mobile_flutter/lib/screens/my_listings_screen.dart`
- Modify: `apps/mobile_flutter/lib/main.dart`

- [ ] **Step 1: Add the new routes**

```dart
// apps/mobile_flutter/lib/router/app_router.dart
// Add these imports alongside the existing screen imports:
import '../screens/payment_method_screen.dart';
import '../screens/publish_screen.dart';

// Add these routes to the `routes:` list — literal-prefix routes before any
// dynamic /listings/:id family, same reasoning as the existing ordering
// comment above /listings/mine and /listings/new:
GoRoute(
  path: '/billing',
  builder: (context, state) => const PaymentMethodScreen(),
),
GoRoute(
  path: '/listings/:id/publish',
  builder: (context, state) =>
      PublishScreen(listingId: state.pathParameters['id']!),
),
```

Place `/listings/:id/publish` directly above the existing `/listings/:id` route (same ordering rule already documented in the file: literal-prefix routes must be listed before the shorter dynamic route they'd otherwise be shadowed by).

- [ ] **Step 2: Add a "Payment method" button to Home**

```dart
// apps/mobile_flutter/lib/screens/home_screen.dart
// Add after the existing blocks_button, before the SizedBox(height: 16)/logout_button:
ElevatedButton(
  key: const Key('payment_method_button'),
  onPressed: () => context.push('/billing'),
  child: const Text('Payment method'),
),
```

- [ ] **Step 3: Wire the live publish action into My Listings**

Replace the disabled stub (`enabled: false`, "Publish (coming soon)") with a real menu item, and handle it in `onSelected` alongside the existing `edit`/`mark_traded`/`remove` branches:

```dart
// apps/mobile_flutter/lib/screens/my_listings_screen.dart
// In the onSelected callback, add an else-if branch:
} else if (action == 'publish') {
  context.push('/listings/${listing.id}/publish');
}

// In itemBuilder, replace the disabled stub:
if (listing.status == ListingStatus.draft)
  const PopupMenuItem(value: 'publish', child: Text('Publish')),
```

- [ ] **Step 4: Initialize Stripe at app startup**

**Before finalizing this step:** verify against the installed `flutter_stripe` package's README/source whether setting `Stripe.publishableKey` and calling `Stripe.instance.applySettings()` before `runApp` is sufficient, or whether a wrapping widget (the RN app used a `<StripeProvider>` component, but `flutter_stripe`'s API may not need an equivalent) is required. Adjust the snippet below if the real API differs.

```dart
// apps/mobile_flutter/lib/main.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'core/env.dart';
import 'router/app_router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Stripe.publishableKey = Env.stripePublishableKey;
  await Stripe.instance.applySettings();
  runApp(const ProviderScope(child: GarageSaleApp()));
}

class GarageSaleApp extends ConsumerWidget {
  const GarageSaleApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Garage Sale',
      routerConfig: router,
    );
  }
}
```

- [ ] **Step 5: Update the existing my_listings_screen widget test if it asserts on the stub text**

Search `test/widget/my_listings_screen_test.dart` for any assertion on `'Publish (coming soon)'` and update/remove it to match the new live menu item — if no such assertion exists, skip this step.

- [ ] **Step 6: Run the full gate**

Run:

```bash
cd apps/mobile_flutter
flutter analyze
flutter test
```

Expected: no analyzer issues; all tests pass (should be 105 + the new billing/screen tests from this plan — 2 model + 4 repo + 3 controller + 2 PaymentMethodScreen + 4 PublishScreen = 15 new tests, so 120 total, adjust expectation if step 5 removed/changed an existing test).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile_flutter/lib/router/app_router.dart apps/mobile_flutter/lib/screens/home_screen.dart apps/mobile_flutter/lib/screens/my_listings_screen.dart apps/mobile_flutter/lib/main.dart apps/mobile_flutter/test/widget/my_listings_screen_test.dart
git commit -m "F3(g): wire billing routes, Home/My-Listings nav, and Stripe init"
```

---

## Final: full-repo gate + review

- [ ] Run the repo-root pre-commit gate: `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm format:check` (run `pnpm format` first if `format:check` fails).
- [ ] Dispatch a final code-reviewer subagent over the full `feat/flutter-mobile-f3` diff against `main`.
- [ ] Use `superpowers:finishing-a-development-branch` once the final review is clean.

**Not in scope for this phase (flag, don't build):** the REMOVED/COMPLETED → DRAFT relist gap noted above; a manual emulator/device smoke test of the real PaymentSheet (no device available in this environment); Google Pay / Apple Pay (the RN app explicitly disabled Google Pay and never wired Apple Pay either — F3 matches that scope, card-only).
