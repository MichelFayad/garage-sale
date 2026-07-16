# Flutter Mobile F4: FCM Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the backend's Expo-Push-API-based `sendPush` with Firebase Cloud Messaging (FCM), and give the Flutter mobile app device push registration — reaching push parity with the old RN app (which routed through Expo's push service, itself backed by FCM on Android under the hood).

**Architecture:** `packages/api/src/push.ts`'s `sendPush` is rewritten to call FCM via the official `firebase-admin` SDK instead of Expo's `fetch`-based endpoint — `PushToken` keeps its existing shape (an opaque `token` column, already Expo-or-FCM-agnostic), `registerPushToken`/`unregisterPushToken` and the `push` tRPC router are untouched, and every call site (`notify()` in `trades.ts`) is completely unaffected — this is a clean swap of `sendPush`'s internals, not a coexistence layer (no dual Expo+FCM code path; the RN app is being fully replaced, not run alongside). Two new REST facade routes wrap the existing `push` router for Flutter, mirroring F3's `billing` facade exactly. On the Flutter side: `firebase_messaging` requests notification permission and reads the device's FCM token; registration happens reactively (an app-level `ref.listen` on auth state, mirroring the existing `_RouterRefreshNotifier` pattern already in `app_router.dart`), while unregistration is a direct call inside `AuthController.logout()` — because it must run _before_ the access token is cleared from storage, the same ordering the RN app's `AuthContext.logout()` used.

**Tech Stack:** `firebase-admin` (new, server), `firebase_messaging` (new, Flutter), existing tRPC `push` router (unchanged), Next.js route handlers (new REST facade), Riverpod.

---

## Context for every implementer (do not skip)

- Dart package name for `apps/mobile_flutter` is **`garage_sale_mobile`** (per `pubspec.yaml`). All `package:` imports use `package:garage_sale_mobile/...`.
- The `push` tRPC router (`packages/api/src/routers/push.ts`) and the `PushToken` Prisma model are **out of scope, do not modify**. Only `packages/api/src/push.ts`'s `sendPush` function body changes; `registerPushToken`/`unregisterPushToken` are already provider-agnostic (plain Prisma upsert/delete) and stay exactly as-is.
- **This is a real behavior change, not a bug, and it's fine:** today, `sendPush` works with zero configuration (Expo's endpoint needs no auth). After this phase, `sendPush` needs `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` set, or it throws inside the function — which the existing swallow-all `try/catch` already catches, so an unconfigured dev environment just silently gets no push (same "swallow, never break the caller" contract email/push already had). Don't add a "dev fallback" — this matches how `RESEND_API_KEY` being unset silently degrades in `email.ts` already.
- **Real Firebase project provisioning is a manual ops step, same category as F3's Stripe keys / the RN app's EAS build**: this plan cannot create a real Firebase project, generate `google-services.json`/`GoogleService-Info.plist`, or run `flutterfire configure`. The Flutter side is built so it _compiles and unit-tests cleanly_ without any of that (bare `Firebase.initializeApp()`, wrapped defensively, no generated `firebase_options.dart` dependency), but real push delivery to a device needs those artifacts provisioned afterward — not this plan's job.
- **Foreground notification display is intentionally out of scope.** The RN app used `expo-notifications`' `setNotificationHandler` to show a system banner while foregrounded. The Flutter equivalent needs a second package (`flutter_local_notifications`) plus its own Android channel setup, and — like everything push-related — can't be visually verified without a real device in this environment. This plan wires `FirebaseMessaging.onMessage` to a no-op/log-only listener (structured so a real display implementation can be dropped in later) rather than pulling in another package for something nobody can verify renders correctly. Don't expand this scope.
- **Testability rule (same reasoning as F3's `presentCardSheet`):** anything that calls the real `firebase_messaging` plugin must be injectable, because calling it in a plain `flutter test` (no platform bindings) either throws or hangs. `registerForPushNotifications` (the one function that touches `FirebaseMessaging.instance`) is read through a provider (`devicePushTokenProvider`) specifically so tests can override it with a fake instead of letting the real plugin call happen.
- **`ProviderContainer` does NOT implement `Ref`** (confirmed against the installed `riverpod` 2.6.1 source — `class ProviderContainer implements Node`, not `Ref`). Registration/unregistration logic that needs a `Ref` therefore cannot be a bare top-level function called directly with a `ProviderContainer` in tests — it must live on a `Notifier`, exactly like every other piece of mutable logic in this codebase (`BillingController`, `WatchlistController`, etc.). Both production code and tests then reach it the same, already-established way: `ref.read(pushRegistrationControllerProvider.notifier).registerDevice()` / `container.read(pushRegistrationControllerProvider.notifier).unregisterDevice()` — the exact pattern `test/auth/auth_controller_test.dart` already uses (`container.read(authControllerProvider.notifier).logout()`).
- **Ordering matters for unregister:** `AuthController.logout()` must call the push-unregister step _before_ `_storage.clearTokens()` — the unregister REST call needs a still-valid access token (the `push.unregister` procedure is `protectedProcedure`, same as `register`). This mirrors the RN app's `AuthContext.logout()`, which called `trpc.push.unregister.mutate(...)` before clearing its own stored tokens.
- Every implementer works on branch `feat/flutter-mobile-f4` (already created off `main`). Do **not** run `git commit` if dispatched as part of a parallel wave — the controlling session commits serially after review, to avoid a git-index race. If executing solo/sequentially, commit normally at the end of each task.

---

## Wave 1 — 2 parallel tracks (no shared files, no ordering dependency)

### Task 1 (Track A): Backend FCM rewrite + REST facade

**Files:**

- Create: `packages/api/src/firebase.ts`
- Modify: `packages/api/src/push.ts`
- Create: `packages/api/src/push.test.ts`
- Modify: `packages/api/package.json`
- Create: `apps/web/src/app/api/mobile/push/register/route.ts`
- Create: `apps/web/src/app/api/mobile/push/unregister/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add the firebase-admin dependency**

Run: `pnpm --filter @garage-sale/api add firebase-admin`
Expected: `packages/api/package.json` gains a `firebase-admin: ^<resolved version>` line under `dependencies`. Let pnpm resolve the version — don't hand-type one.

- [ ] **Step 2: Add the lazy Firebase Admin app singleton**

Mirrors `packages/api/src/stripe.ts`'s lazy-singleton-from-env style exactly.

```ts
// packages/api/src/firebase.ts
// Lazy Firebase Admin app singleton, built from FIREBASE_* env vars on first
// use. Server-only. Mirrors stripe.ts's lazy-client pattern.

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';

let app: App | undefined;

/** The shared Firebase Admin app, built from FIREBASE_* env vars on first use. */
export function firebaseApp(): App {
  if (!app) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY are not set');
    }
    app =
      getApps()[0] ??
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }),
      });
  }
  return app;
}
```

The `.replace(/\\n/g, '\n')` handles the standard way a PEM private key survives being stored as a single-line env var (literal `\n` escapes instead of real newlines) — the same reason `APPLE_PRIVATE_KEY` in `.env.example` is documented as a PEM block; Firebase service-account private keys are stored the same way.

- [ ] **Step 3: Rewrite sendPush to use FCM**

Replace the Expo-specific parts of `packages/api/src/push.ts`. `registerPushToken`/`unregisterPushToken` (lines 9-24 in the current file) are untouched — only the `EXPO_PUSH_URL` constant, the `ExpoTicket` interface, and the `sendPush` function body change.

```ts
// packages/api/src/push.ts
// Push notifications via Firebase Cloud Messaging. Tokens are registered per
// device by the mobile app; sendPush fans a message out to all of a user's
// tokens. Mirrors email.ts: failures are swallowed so a push problem never
// breaks the triggering mutation.

import type { PrismaClient } from '@garage-sale/db';
import { getMessaging } from 'firebase-admin/messaging';
import { firebaseApp } from './firebase.js';

export async function registerPushToken(
  prisma: PrismaClient,
  userId: string,
  token: string,
  platform?: string,
): Promise<void> {
  await prisma.pushToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform },
  });
}

export async function unregisterPushToken(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.pushToken.deleteMany({ where: { token } });
}

/** FCM error codes that mean the token is permanently dead (app uninstalled, etc.). */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Send a push to every device the user has registered. No-op when none. */
export async function sendPush(
  prisma: PrismaClient,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const tokens = await prisma.pushToken.findMany({
    where: { userId },
    select: { token: true },
  });
  if (tokens.length === 0) return;

  try {
    const response = await getMessaging(firebaseApp()).sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title, body },
      data,
    });
    const dead = response.responses
      .map((r, i) => ({ r, token: tokens[i].token }))
      .filter(({ r }) => !r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code))
      .map(({ token }) => token);
    if (dead.length > 0) {
      await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
    }
  } catch {
    // Swallow — a push failure must not break the mutation that triggered it.
  }
}
```

- [ ] **Step 4: Write push.test.ts**

Mock `firebase-admin/messaging` and `./firebase.js` so no real FCM/Google auth call ever happens. Follow the mocked-Prisma pattern already used in `packages/api/src/billing.test.ts` for the Prisma stub shape.

```ts
// packages/api/src/push.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { sendPush } from './push.js';

const sendEachForMulticast = vi.fn();

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEachForMulticast }),
}));

vi.mock('./firebase.js', () => ({
  firebaseApp: () => ({}),
}));

function fakePrisma(tokens: { token: string }[]) {
  return {
    pushToken: {
      findMany: vi.fn().mockResolvedValue(tokens),
      deleteMany: vi.fn().mockResolvedValue({ count: tokens.length }),
    },
  } as any;
}

describe('sendPush', () => {
  beforeEach(() => {
    sendEachForMulticast.mockReset();
  });

  it('no-ops when the user has no registered tokens', async () => {
    const prisma = fakePrisma([]);

    await sendPush(prisma, 'u1', 'Title', 'Body');

    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('sends to every registered token', async () => {
    const prisma = fakePrisma([{ token: 't1' }, { token: 't2' }]);
    sendEachForMulticast.mockResolvedValue({
      responses: [{ success: true }, { success: true }],
    });

    await sendPush(prisma, 'u1', 'Title', 'Body');

    expect(sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ['t1', 't2'] }),
    );
  });

  it('prunes tokens FCM reports as unregistered', async () => {
    const prisma = fakePrisma([{ token: 'dead' }, { token: 'alive' }]);
    sendEachForMulticast.mockResolvedValue({
      responses: [
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: true },
      ],
    });

    await sendPush(prisma, 'u1', 'Title', 'Body');

    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['dead'] } },
    });
  });

  it('does not prune tokens that failed for a different reason', async () => {
    const prisma = fakePrisma([{ token: 't1' }]);
    sendEachForMulticast.mockResolvedValue({
      responses: [{ success: false, error: { code: 'messaging/internal-error' } }],
    });

    await sendPush(prisma, 'u1', 'Title', 'Body');

    expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled();
  });

  it('swallows a thrown error instead of propagating it', async () => {
    const prisma = fakePrisma([{ token: 't1' }]);
    sendEachForMulticast.mockRejectedValue(new Error('FCM is down'));

    await expect(sendPush(prisma, 'u1', 'Title', 'Body')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @garage-sale/api test`
Expected: all tests pass, including the 5 new `sendPush` tests alongside the existing `billing.test.ts`/`routers/*.test.ts` suites.

- [ ] **Step 6: Add the REST facade routes**

Same pattern as F3's billing routes — thin wraps of `caller.push.register`/`caller.push.unregister`. `BAD_REQUEST` covers a zod input-validation failure (e.g. an empty token string).

```ts
// apps/web/src/app/api/mobile/push/register/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, BAD_REQUEST: 400 };

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.push.register({
      token: String(body.token ?? ''),
      platform: body.platform !== undefined ? String(body.platform) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to register push token' }, { status: 400 });
  }
}
```

```ts
// apps/web/src/app/api/mobile/push/unregister/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, BAD_REQUEST: 400 };

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.push.unregister({ token: String(body.token ?? '') });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to unregister push token' }, { status: 400 });
  }
}
```

- [ ] **Step 7: Add Firebase env vars to .env.example**

Add this new section (placement: after the "─── Stripe ───" section, before "─── Email ───", matching the file's existing grouping-by-integration style):

```bash
# ─── Push notifications (Firebase Cloud Messaging) ──────────
# Service-account credentials for the Firebase project backing FCM. Leave
# unset in dev — sendPush swallows the resulting error and silently no-ops,
# same as an unset RESEND_API_KEY degrades email.
FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""       # PKCS#8 PEM (-----BEGIN PRIVATE KEY----- …)
```

- [ ] **Step 8: Typecheck and lint**

Run: `pnpm --filter @garage-sale/api typecheck && pnpm --filter @garage-sale/api lint && pnpm --filter @garage-sale/web typecheck && pnpm --filter @garage-sale/web lint`
Expected: all pass with no errors.

- [ ] **Step 9: Commit** (skip if dispatched as part of a parallel wave)

```bash
git add packages/api/src/firebase.ts packages/api/src/push.ts packages/api/src/push.test.ts packages/api/package.json packages/api/../../pnpm-lock.yaml apps/web/src/app/api/mobile/push .env.example
git commit -m "F4(a): rewrite sendPush for FCM, add push REST facade routes"
```

---

### Task 2 (Track B): Flutter push foundation — dependency + repository

**Files:**

- Modify: `apps/mobile_flutter/pubspec.yaml`
- Create: `apps/mobile_flutter/lib/push/push_repository.dart`
- Create: `apps/mobile_flutter/lib/push/rest_push_repository.dart`
- Create: `apps/mobile_flutter/test/support/fake_push_repository.dart`
- Test: `apps/mobile_flutter/test/push/rest_push_repository_test.dart`

- [ ] **Step 1: Add the Firebase dependencies**

Run: `cd apps/mobile_flutter && flutter pub add firebase_core firebase_messaging`
Expected: `pubspec.yaml` gains `firebase_core: ^<resolved>` and `firebase_messaging: ^<resolved>` lines. Let pub resolve versions. Note any post-install message about minimum Android `minSdkVersion`/iOS deployment target the same way F3's `flutter_stripe` addition did — bump `android/app/build.gradle.kts`/`ios/Podfile` only if the tool actually asks for it, and note what you found (or "none needed") in your report. No emulator is available to verify a full native build.

- [ ] **Step 2: Define the repository interface**

```dart
// apps/mobile_flutter/lib/push/push_repository.dart
abstract class PushRepository {
  Future<void> register(String token, String? platform, String accessToken);

  Future<void> unregister(String token, String accessToken);
}
```

- [ ] **Step 3: Write the failing REST repository tests**

```dart
// apps/mobile_flutter/test/push/rest_push_repository_test.dart
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/push/rest_push_repository.dart';

void main() {
  group('RestPushRepository', () {
    test('register posts the token and platform', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestPushRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.register('token123', 'android', 'tok');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/push/register');
      expect(captured.headers['Authorization'], 'Bearer tok');
      expect(jsonDecode(captured.body), {'token': 'token123', 'platform': 'android'});
    });

    test('register omits platform when null', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestPushRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.register('token123', null, 'tok');

      expect(jsonDecode(captured.body), {'token': 'token123'});
    });

    test('unregister posts the token', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestPushRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.unregister('token123', 'tok');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/push/unregister');
      expect(jsonDecode(captured.body), {'token': 'token123'});
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd apps/mobile_flutter && flutter test test/push/rest_push_repository_test.dart`
Expected: FAIL — `RestPushRepository` doesn't exist yet.

- [ ] **Step 5: Implement RestPushRepository**

```dart
// apps/mobile_flutter/lib/push/rest_push_repository.dart
import '../core/api_client.dart';
import 'push_repository.dart';

class RestPushRepository implements PushRepository {
  RestPushRepository(this._client);
  final ApiClient _client;

  @override
  Future<void> register(String token, String? platform, String accessToken) async {
    await _client.post(
      '/mobile/push/register',
      {'token': token, if (platform != null) 'platform': platform},
      accessToken: accessToken,
    );
  }

  @override
  Future<void> unregister(String token, String accessToken) async {
    await _client.post(
      '/mobile/push/unregister',
      {'token': token},
      accessToken: accessToken,
    );
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/mobile_flutter && flutter test test/push/rest_push_repository_test.dart`
Expected: PASS (3/3).

- [ ] **Step 7: Add the fake repository test double**

```dart
// apps/mobile_flutter/test/support/fake_push_repository.dart
import 'package:garage_sale_mobile/push/push_repository.dart';

class FakePushRepository implements PushRepository {
  int registerCalls = 0;
  int unregisterCalls = 0;
  String? lastRegisteredToken;
  String? lastRegisteredPlatform;
  String? lastUnregisteredToken;

  @override
  Future<void> register(String token, String? platform, String accessToken) async {
    registerCalls++;
    lastRegisteredToken = token;
    lastRegisteredPlatform = platform;
  }

  @override
  Future<void> unregister(String token, String accessToken) async {
    unregisterCalls++;
    lastUnregisteredToken = token;
  }
}
```

- [ ] **Step 8: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze lib/push test/push test/support/fake_push_repository.dart`
Expected: no issues.

- [ ] **Step 9: Commit** (skip if dispatched as part of a parallel wave)

```bash
git add apps/mobile_flutter/pubspec.yaml apps/mobile_flutter/pubspec.lock apps/mobile_flutter/lib/push apps/mobile_flutter/test/push apps/mobile_flutter/test/support/fake_push_repository.dart
git commit -m "F4(b): add push_flutter dependency and PushRepository"
```

---

## Wave 2 — 1 track (depends on Task 2)

### Task 3: Device push token registration (registerForPushNotifications) + registration providers

**Files:**

- Create: `apps/mobile_flutter/lib/push/register_push.dart`
- Create: `apps/mobile_flutter/lib/push/providers.dart`
- Create: `apps/mobile_flutter/lib/push/push_registration.dart`
- Test: `apps/mobile_flutter/test/push/push_registration_test.dart`

- [ ] **Step 1: Implement registerForPushNotifications**

Mirrors the RN app's `apps/mobile/src/push/registerPush.ts` — request permission, then read the device's FCM token. Everything is wrapped so a denied permission, a missing/misconfigured Firebase setup, or a platform-channel failure in a test environment all resolve to `null` rather than throwing.

**Before finalizing this file:** verify `FirebaseMessaging.instance.requestPermission()`'s return type (`NotificationSettings`, with an `authorizationStatus` field of type `AuthorizationStatus`) and `FirebaseMessaging.instance.getToken()`'s signature against the actual installed `firebase_messaging` package source in the pub cache — same verification discipline F3 used for `flutter_stripe`. Adjust if the real API differs from this draft.

```dart
// apps/mobile_flutter/lib/push/register_push.dart
import 'package:firebase_messaging/firebase_messaging.dart';

/// Requests notification permission and returns this device's FCM
/// registration token, or null if permission was denied, Firebase isn't
/// configured, or the plugin call otherwise fails (e.g. no platform binding
/// in a unit test). Mirrors the RN app's `registerForPushNotifications`
/// (apps/mobile/src/push/registerPush.ts).
Future<String?> registerForPushNotifications() async {
  try {
    final settings = await FirebaseMessaging.instance.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) return null;
    return await FirebaseMessaging.instance.getToken();
  } catch (_) {
    return null;
  }
}
```

- [ ] **Step 2: Add the injectable provider**

`devicePushTokenProvider` exists so tests never invoke the real Firebase plugin — mirrors why `PublishScreen`/`PaymentMethodScreen` took `presentCardSheet` as an injectable parameter in F3.

```dart
// apps/mobile_flutter/lib/push/providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'push_repository.dart';
import 'register_push.dart';
import 'rest_push_repository.dart';

final pushRepositoryProvider = Provider<PushRepository>(
  (ref) => RestPushRepository(ref.watch(apiClientProvider)),
);

/// Injectable so tests can avoid the real Firebase plugin. Defaults to the
/// real implementation.
final devicePushTokenProvider = Provider<Future<String?> Function()>(
  (ref) => registerForPushNotifications,
);
```

- [ ] **Step 3: Write the failing registration-flow tests**

```dart
// apps/mobile_flutter/test/push/push_registration_test.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/push/providers.dart';
import 'package:garage_sale_mobile/push/push_registration.dart';
import '../support/fake_push_repository.dart';
import '../support/in_memory_key_value_store.dart';

Future<TokenStorage> _seededTokenStorage() async {
  final storage = TokenStorage(InMemoryKeyValueStore());
  await storage.saveTokens(
    const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
  );
  return storage;
}

void main() {
  group('PushRegistrationController', () {
    test('registerDevice registers the device token', () async {
      final storage = await _seededTokenStorage();
      final repo = FakePushRepository();
      final container = ProviderContainer(
        overrides: [
          pushRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
          devicePushTokenProvider.overrideWithValue(() async => 'device-token-1'),
        ],
      );
      addTearDown(container.dispose);

      await container.read(pushRegistrationControllerProvider.notifier).registerDevice();

      expect(repo.registerCalls, 1);
      expect(repo.lastRegisteredToken, 'device-token-1');
    });

    test('registerDevice does nothing when no device token is available', () async {
      final storage = await _seededTokenStorage();
      final repo = FakePushRepository();
      final container = ProviderContainer(
        overrides: [
          pushRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
          devicePushTokenProvider.overrideWithValue(() async => null),
        ],
      );
      addTearDown(container.dispose);

      await container.read(pushRegistrationControllerProvider.notifier).registerDevice();

      expect(repo.registerCalls, 0);
    });

    test('unregisterDevice does nothing when no device was registered', () async {
      final storage = await _seededTokenStorage();
      final repo = FakePushRepository();
      final container = ProviderContainer(
        overrides: [
          pushRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);

      await container.read(pushRegistrationControllerProvider.notifier).unregisterDevice();

      expect(repo.unregisterCalls, 0);
    });

    test('unregisterDevice unregisters the previously-registered token', () async {
      final storage = await _seededTokenStorage();
      final repo = FakePushRepository();
      final container = ProviderContainer(
        overrides: [
          pushRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
          devicePushTokenProvider.overrideWithValue(() async => 'device-token-1'),
        ],
      );
      addTearDown(container.dispose);
      final notifier = container.read(pushRegistrationControllerProvider.notifier);
      await notifier.registerDevice();

      await notifier.unregisterDevice();

      expect(repo.unregisterCalls, 1);
      expect(repo.lastUnregisteredToken, 'device-token-1');
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd apps/mobile_flutter && flutter test test/push/push_registration_test.dart`
Expected: FAIL — `PushRegistrationController`/`pushRegistrationControllerProvider` don't exist yet.

- [ ] **Step 5: Implement push_registration.dart**

A `Notifier` (not `AsyncNotifier` — there's no async state to expose, just two callable actions) so both production code and tests obtain a genuine `Ref` the same established way every other controller in this codebase does (`ref.read(someControllerProvider.notifier).someMethod()`) — see the plan's shared context for why a bare top-level function taking `Ref` doesn't work here. State is `Object?`, always `null` — this controller has nothing to expose to the UI, it's pure side effect.

`_lastRegisteredToken` is an in-memory cache of the device's own token — mirrors the RN app's `pushTokenRef.current` (`apps/mobile/src/auth/AuthContext.tsx`), which is exactly how it remembers what to unregister at logout without re-reading the plugin. Both methods swallow all failures — push registration must never surface an error to the caller or block an auth flow.

```dart
// apps/mobile_flutter/lib/push/push_registration.dart
import 'dart:io' show Platform;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'providers.dart';

String? _platformName() {
  if (Platform.isAndroid) return 'android';
  if (Platform.isIOS) return 'ios';
  return null;
}

class PushRegistrationController extends Notifier<Object?> {
  String? _lastRegisteredToken;

  @override
  Object? build() => null;

  /// Requests a device push token and registers it with the backend. Called
  /// reactively on successful auth (see the `ref.listen` wiring in
  /// main.dart) — never throws, never blocks the caller.
  Future<void> registerDevice() async {
    try {
      final getToken = ref.read(devicePushTokenProvider);
      final token = await getToken();
      if (token == null) return;
      final accessToken = await requireAccessToken(ref);
      await ref.read(pushRepositoryProvider).register(token, _platformName(), accessToken);
      _lastRegisteredToken = token;
    } catch (_) {
      // Push registration is non-critical — never block/break auth flows.
    }
  }

  /// Unregisters this device's last-registered push token, if any. Must be
  /// called with a still-valid access token — see AuthController.logout(),
  /// which calls this before clearing stored tokens.
  Future<void> unregisterDevice() async {
    final token = _lastRegisteredToken;
    if (token == null) return;
    try {
      final accessToken = await requireAccessToken(ref);
      await ref.read(pushRepositoryProvider).unregister(token, accessToken);
    } catch (_) {
      // Non-critical.
    } finally {
      _lastRegisteredToken = null;
    }
  }
}

final pushRegistrationControllerProvider =
    NotifierProvider<PushRegistrationController, Object?>(PushRegistrationController.new);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/mobile_flutter && flutter test test/push/`
Expected: PASS (7/7 — 3 repo tests from Task 2 + 4 registration tests).

- [ ] **Step 7: Analyze**

Run: `cd apps/mobile_flutter && flutter analyze lib/push test/push`
Expected: no issues.

- [ ] **Step 8: Commit** (skip if dispatched as part of a parallel wave)

```bash
git add apps/mobile_flutter/lib/push/register_push.dart apps/mobile_flutter/lib/push/providers.dart apps/mobile_flutter/lib/push/push_registration.dart apps/mobile_flutter/test/push/push_registration_test.dart
git commit -m "F4(c): add device push token registration and providers"
```

---

## Wave 3 — 1 sequential task (depends on Task 3)

### Task 4: Wire registration into auth flows, initialize Firebase, full gate

**Files:**

- Modify: `apps/mobile_flutter/lib/main.dart`
- Modify: `apps/mobile_flutter/lib/auth/auth_controller.dart`

- [ ] **Step 1: Initialize Firebase and register the auth-state listener in main.dart**

`Firebase.initializeApp()` is wrapped in `try/catch` — without a real Firebase project's config files (not available in this environment, see the plan's shared context), it will fail, and the app must still start normally. The `ref.listen` on `authControllerProvider` mirrors the exact pattern `_RouterRefreshNotifier` already uses in `app_router.dart` (`ref.listen(authControllerProvider, (_, __) => notifyListeners())`) — reacting to the previous/next `AsyncValue<SessionUser?>` pair to detect an unauthenticated→authenticated transition (covers both a fresh login and a successful cold-boot hydrate, since the initial state change is `AsyncLoading` → `AsyncData(user)`, and `previous?.valueOrNull` on the loading state is `null`).

The `FirebaseMessaging.onMessage` listener is intentionally just a log line — see the plan's shared context for why displaying a foreground banner is out of scope for this phase.

```dart
// apps/mobile_flutter/lib/main.dart
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'auth/auth_controller.dart';
import 'core/env.dart';
import 'push/push_registration.dart';
import 'router/app_router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Stripe.publishableKey = Env.stripePublishableKey;
  await Stripe.instance.applySettings();
  await _initializeFirebase();
  runApp(const ProviderScope(child: GarageSaleApp()));
}

Future<void> _initializeFirebase() async {
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onMessage.listen((message) {
      // Foreground push notifications arrive here but aren't displayed as a
      // system banner yet — see the F4 plan's shared context for why that's
      // deferred (needs flutter_local_notifications + a device to verify).
      debugPrint('Foreground push received: ${message.notification?.title}');
    });
  } catch (e) {
    // No Firebase project configured for this build yet — push registration
    // will simply find no device token and no-op. Never block app startup.
    debugPrint('Firebase initialization skipped: $e');
  }
}

class GarageSaleApp extends ConsumerWidget {
  const GarageSaleApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen<AsyncValue<Object?>>(authControllerProvider, (previous, next) {
      final wasAuthenticated = previous?.valueOrNull != null;
      final isAuthenticated = next.valueOrNull != null;
      if (!wasAuthenticated && isAuthenticated) {
        ref.read(pushRegistrationControllerProvider.notifier).registerDevice();
      }
    });
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Garage Sale',
      routerConfig: router,
    );
  }
}
```

- [ ] **Step 2: Call unregisterDeviceForPush before clearing tokens in logout()**

The one-line addition — must come before `_storage.clearTokens()`, not after (see the plan's shared context on why ordering matters).

```dart
// apps/mobile_flutter/lib/auth/auth_controller.dart
// In AuthController, replace:
  Future<void> logout() async {
    await future;
    await _storage.clearTokens();
    state = const AsyncData(null);
  }

// with:
  Future<void> logout() async {
    await future;
    await ref.read(pushRegistrationControllerProvider.notifier).unregisterDevice();
    await _storage.clearTokens();
    state = const AsyncData(null);
  }
```

Add the import: `import '../push/push_registration.dart';` at the top of `auth_controller.dart`.

- [ ] **Step 3: Run the existing auth controller tests to confirm no regression**

Run: `cd apps/mobile_flutter && flutter test test/auth/auth_controller_test.dart`
Expected: all 12 existing tests still pass unmodified — none of them register a device token first, so `unregisterDeviceForPush`'s `if (token == null) return;` short-circuit means `logout()`'s new line never touches any push provider during these tests. If any test unexpectedly fails or hangs here, stop and report BLOCKED with the failure — do not paper over it by adding provider overrides to existing tests without understanding why the assumption above didn't hold.

- [ ] **Step 4: Run the full gate**

Run:

```bash
cd apps/mobile_flutter
flutter analyze
flutter test
```

Expected: no analyzer errors (pre-existing warnings in files this task doesn't touch are fine); all tests pass — 124 (F0-F3 total) + 7 (F4 Wave 1-2) = 131, adjust if step count differs.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile_flutter/lib/main.dart apps/mobile_flutter/lib/auth/auth_controller.dart
git commit -m "F4(d): wire push registration into auth flows, initialize Firebase"
```

---

## Final: full-repo gate + review

- [ ] Run the repo-root pre-commit gate: `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm format:check` (run `pnpm format` first if `format:check` fails — check `git diff` after, since this repo has hit CRLF/LF checkout false-positives before; don't assume every flagged file has real content drift).
- [ ] Dispatch a final code-reviewer subagent over the full `feat/flutter-mobile-f4` diff against `main`.
- [ ] Use `superpowers:finishing-a-development-branch` once the final review is clean.

**Not in scope for this phase (flag, don't build):** real Firebase project provisioning, `flutterfire configure`, native config files (`google-services.json`/`GoogleService-Info.plist`), foreground notification banners (`flutter_local_notifications`), a manual device smoke test (no emulator available in this environment, same caveat as every prior Flutter phase).
