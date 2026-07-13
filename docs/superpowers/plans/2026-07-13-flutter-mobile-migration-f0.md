# Flutter Mobile Migration — F0 (Scaffold + Auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/mobile_flutter` (new Flutter project, RN app untouched) with a working email/password auth flow — register, login, boot-time session hydrate/refresh, logout — backed by a new REST facade over the existing tRPC `auth`/`oauth` procedures, wired through Riverpod + go_router.

**Architecture:** `packages/api` stays tRPC-native (web untouched). New thin JSON REST route handlers under `apps/web/src/app/api/mobile/auth/*` reuse `appRouter.createCaller(ctx)` — the same pattern the existing web login route already uses — so no business logic is duplicated. The Flutter app calls those REST endpoints through a small `ApiClient`, stores the JWT pair in `flutter_secure_storage`, and exposes auth state via a Riverpod `AsyncNotifier` that `go_router` redirects on.

**Tech Stack:** Flutter/Dart, `flutter_riverpod`, `go_router`, `flutter_secure_storage`, `http`. Backend: Next.js route handlers (existing stack, no new deps).

**Scope note:** This plan covers **email/password auth only**. OAuth (Google/Apple/Facebook) is deferred to a follow-up plan — it needs Firebase/Google-console client credentials to be provisioned first (ops-gated, same category as the FCM push work), and the design spec's "F0" auth scope is being split for that reason. See `docs/superpowers/specs/2026-07-13-flutter-mobile-migration-design.md` for full context.

**Verification split:** Dart tasks follow strict TDD (`flutter test` red → green). The backend REST tasks do not get new automated tests — `apps/web` has no test runner configured today (no `test` script, no vitest — confirmed by inspecting `apps/web/package.json`), and the business logic they call (`auth.register`/`auth.login`/`auth.refresh`/`auth.me`) is already covered by `packages/api/src/routers/auth.test.ts`. Backend tasks are verified by `pnpm --filter @garage-sale/web typecheck` + `pnpm --filter @garage-sale/web lint` plus a manual code-shape check against the existing `apps/web/src/app/api/auth/login/route.ts` pattern they mirror. Functional (curl) verification against a real request needs a reachable Postgres, which this project doesn't have locally (see CLAUDE.md gotchas) — that happens at deploy/staging time, same as the rest of the backend.

---

## Task 0: Flutter project scaffold

**Files:**
- Create: `apps/mobile_flutter/` (via `flutter create`)
- Modify: `apps/mobile_flutter/pubspec.yaml`

- [ ] **Step 1: Verify the Flutter toolchain is installed**

Run: `flutter --version`
Expected: prints a Flutter/Dart version (e.g. `Flutter 3.24.x • Dart 3.5.x`). If the command isn't found, install the Flutter SDK first (https://docs.flutter.dev/get-started/install) and re-run `flutter doctor` until there are no blocking issues (an unconfigured iOS toolchain on a non-Mac machine is fine to ignore; Android toolchain should be green).

- [ ] **Step 2: Scaffold the project**

Run (from repo root):
```bash
flutter create --org com.garagesale --project-name garage_sale_mobile apps/mobile_flutter
```
Expected: creates `apps/mobile_flutter/` with a default counter-app template, prints "All done!".

- [ ] **Step 3: Sanity-check the default template**

Run: `cd apps/mobile_flutter && flutter test`
Expected: `00:0X +1: All tests passed!` (the default `test/widget_test.dart` counter test).

- [ ] **Step 4: Add project dependencies**

Edit `apps/mobile_flutter/pubspec.yaml`, replace the `dependencies:` and `dev_dependencies:` blocks with:

```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.5.1
  go_router: ^14.2.0
  flutter_secure_storage: ^9.2.2
  http: ^1.2.2
  cupertino_icons: ^1.0.8

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^4.0.0
```

- [ ] **Step 5: Install dependencies**

Run: `cd apps/mobile_flutter && flutter pub get`
Expected: exits 0, "Got dependencies!".

- [ ] **Step 6: Commit**

```bash
cd apps/mobile_flutter
git add pubspec.yaml pubspec.lock lib test analysis_options.yaml
git commit -m "F0: scaffold Flutter project with core dependencies"
```

---

## Task 1: Secure token storage

**Files:**
- Create: `apps/mobile_flutter/lib/core/key_value_store.dart`
- Create: `apps/mobile_flutter/lib/core/secure_key_value_store.dart`
- Create: `apps/mobile_flutter/lib/auth/token_storage.dart`
- Create: `apps/mobile_flutter/test/support/in_memory_key_value_store.dart`
- Test: `apps/mobile_flutter/test/auth/token_storage_test.dart`

This mirrors `apps/mobile/src/auth/storage.ts` (two `expo-secure-store` keys, `gs_access_token`/`gs_refresh_token`) — same two keys, `flutter_secure_storage` instead. A small `KeyValueStore` interface is inserted so tests don't need platform-channel mocking for the secure storage plugin.

- [ ] **Step 1: Write the interface (no test needed — pure type)**

`apps/mobile_flutter/lib/core/key_value_store.dart`:
```dart
abstract class KeyValueStore {
  Future<void> write(String key, String value);
  Future<String?> read(String key);
  Future<void> delete(String key);
}
```

- [ ] **Step 2: Write the in-memory test double**

`apps/mobile_flutter/test/support/in_memory_key_value_store.dart`:
```dart
import 'package:garage_sale_mobile/core/key_value_store.dart';

class InMemoryKeyValueStore implements KeyValueStore {
  final Map<String, String> _data = {};

  @override
  Future<void> write(String key, String value) async => _data[key] = value;

  @override
  Future<String?> read(String key) async => _data[key];

  @override
  Future<void> delete(String key) async => _data.remove(key);
}
```

- [ ] **Step 3: Write the failing test for TokenStorage**

`apps/mobile_flutter/test/auth/token_storage_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  group('TokenStorage', () {
    test('saves and reads back both tokens', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(
        const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'),
      );

      expect(await storage.getAccessToken(), 'access1');
      expect(await storage.getRefreshToken(), 'refresh1');
    });

    test('returns null for both tokens before anything is saved', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());

      expect(await storage.getAccessToken(), isNull);
      expect(await storage.getRefreshToken(), isNull);
    });

    test('clearTokens removes both tokens', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(
        const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'),
      );

      await storage.clearTokens();

      expect(await storage.getAccessToken(), isNull);
      expect(await storage.getRefreshToken(), isNull);
    });
  });
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/mobile_flutter && flutter test test/auth/token_storage_test.dart`
Expected: FAIL — `Target of URI doesn't exist: 'package:garage_sale_mobile/auth/token_storage.dart'` (file doesn't exist yet).

- [ ] **Step 5: Add flutter_secure_storage-backed implementation**

`apps/mobile_flutter/lib/core/secure_key_value_store.dart`:
```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'key_value_store.dart';

class SecureKeyValueStore implements KeyValueStore {
  const SecureKeyValueStore([this._storage = const FlutterSecureStorage()]);

  final FlutterSecureStorage _storage;

  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}
```

- [ ] **Step 6: Implement TokenStorage**

`apps/mobile_flutter/lib/auth/token_storage.dart`:
```dart
import '../core/key_value_store.dart';
import '../core/secure_key_value_store.dart';

class TokenPair {
  const TokenPair({required this.accessToken, required this.refreshToken});
  final String accessToken;
  final String refreshToken;
}

class TokenStorage {
  TokenStorage([KeyValueStore? store]) : _store = store ?? const SecureKeyValueStore();

  static const accessKey = 'gs_access_token';
  static const refreshKey = 'gs_refresh_token';

  final KeyValueStore _store;

  Future<void> saveTokens(TokenPair tokens) async {
    await Future.wait([
      _store.write(accessKey, tokens.accessToken),
      _store.write(refreshKey, tokens.refreshToken),
    ]);
  }

  Future<String?> getAccessToken() => _store.read(accessKey);
  Future<String?> getRefreshToken() => _store.read(refreshKey);

  Future<void> clearTokens() async {
    await Future.wait([_store.delete(accessKey), _store.delete(refreshKey)]);
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/mobile_flutter && flutter test test/auth/token_storage_test.dart`
Expected: `00:0X +3: All tests passed!`

- [ ] **Step 8: Commit**

```bash
cd apps/mobile_flutter
git add lib/core/key_value_store.dart lib/core/secure_key_value_store.dart lib/auth/token_storage.dart test/support/in_memory_key_value_store.dart test/auth/token_storage_test.dart
git commit -m "F0: add secure token storage"
```

---

## Task 2: API client

**Files:**
- Create: `apps/mobile_flutter/lib/core/env.dart`
- Create: `apps/mobile_flutter/lib/core/api_exception.dart`
- Create: `apps/mobile_flutter/lib/core/api_client.dart`
- Test: `apps/mobile_flutter/test/core/api_client_test.dart`

Mirrors `apps/mobile/src/api/client.ts`'s bearer-header-per-request pattern (base URL `http://localhost:3000/api`, overridable). Uses `package:http`'s built-in `MockClient` test harness (`http/testing.dart`) — no extra mocking dependency needed.

- [ ] **Step 1: Write env + exception types (no test needed — pure types)**

`apps/mobile_flutter/lib/core/env.dart`:
```dart
class Env {
  /// Override at build/run time: --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
  /// (10.0.2.2 is the Android emulator's alias for the host machine's localhost).
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api',
  );
}
```

`apps/mobile_flutter/lib/core/api_exception.dart`:
```dart
class ApiException implements Exception {
  const ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => 'ApiException($statusCode): $message';
}
```

- [ ] **Step 2: Write the failing test for ApiClient**

`apps/mobile_flutter/test/core/api_client_test.dart`:
```dart
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/core/api_exception.dart';

void main() {
  group('ApiClient', () {
    test('post sends bearer header and decodes JSON body', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final client = ApiClient(httpClient: mock, baseUrl: 'http://test.local/api');

      final result = await client.post(
        '/mobile/auth/login',
        {'email': 'a@b.com'},
        accessToken: 'tok123',
      );

      expect(result, {'ok': true});
      expect(captured.url.toString(), 'http://test.local/api/mobile/auth/login');
      expect(captured.headers['Authorization'], 'Bearer tok123');
      expect(jsonDecode(captured.body), {'email': 'a@b.com'});
    });

    test('throws ApiException with server error message on non-2xx', () async {
      final mock = MockClient((request) async {
        return http.Response(jsonEncode({'error': 'Invalid email or password'}), 401);
      });
      final client = ApiClient(httpClient: mock, baseUrl: 'http://test.local/api');

      expect(
        () => client.post('/mobile/auth/login', {'email': 'a@b.com'}),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 401)
              .having((e) => e.message, 'message', 'Invalid email or password'),
        ),
      );
    });

    test('get omits Authorization header when no token given', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final client = ApiClient(httpClient: mock, baseUrl: 'http://test.local/api');

      await client.get('/mobile/auth/me');

      expect(captured.headers.containsKey('Authorization'), isFalse);
    });
  });
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mobile_flutter && flutter test test/core/api_client_test.dart`
Expected: FAIL — `Target of URI doesn't exist: 'package:garage_sale_mobile/core/api_client.dart'`.

- [ ] **Step 4: Implement ApiClient**

`apps/mobile_flutter/lib/core/api_client.dart`:
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

  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    String? accessToken,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl$path'),
      headers: {
        'Content-Type': 'application/json',
        if (accessToken != null) 'Authorization': 'Bearer $accessToken',
      },
      body: jsonEncode(body),
    );
    return _decode(response);
  }

  Future<Map<String, dynamic>> get(String path, {String? accessToken}) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl$path'),
      headers: {
        if (accessToken != null) 'Authorization': 'Bearer $accessToken',
      },
    );
    return _decode(response);
  }

  Map<String, dynamic> _decode(http.Response response) {
    final decoded = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = decoded['error'] as String? ?? 'Request failed';
      throw ApiException(response.statusCode, message);
    }
    return decoded;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile_flutter && flutter test test/core/api_client_test.dart`
Expected: `00:0X +3: All tests passed!`

- [ ] **Step 6: Commit**

```bash
cd apps/mobile_flutter
git add lib/core/env.dart lib/core/api_exception.dart lib/core/api_client.dart test/core/api_client_test.dart
git commit -m "F0: add REST API client"
```

---

## Task 3: Backend REST facade for auth

**Files:**
- Create: `apps/web/src/app/api/mobile/auth/register/route.ts`
- Create: `apps/web/src/app/api/mobile/auth/login/route.ts`
- Create: `apps/web/src/app/api/mobile/auth/refresh/route.ts`
- Create: `apps/web/src/app/api/mobile/auth/me/route.ts`

Each route is a thin wrap of `appRouter.createCaller(ctx)`, the exact pattern `apps/web/src/app/api/auth/login/route.ts` already uses — but returning JSON tokens directly (no cookies; mobile is bearer-only). No new business logic; `auth.register`/`auth.login`/`auth.refresh`/`auth.me` are unchanged and already tested in `packages/api/src/routers/auth.test.ts`.

- [ ] **Step 1: Register endpoint**

`apps/web/src/app/api/mobile/auth/register/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { BAD_REQUEST: 400, CONFLICT: 409 };

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { email?: unknown; password?: unknown; displayName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const result = await caller.auth.register({
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      displayName: String(body.displayName ?? ''),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Registration failed' }, { status: 400 });
  }
}
```

- [ ] **Step 2: Login endpoint**

`apps/web/src/app/api/mobile/auth/login/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400 };

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const result = await caller.auth.login({
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Login failed' }, { status: 400 });
  }
}
```

Note: unlike the web login route, this does **not** fall back to `auth.adminLogin` — admin staff don't use the mobile app (CLAUDE.md: "Admin staff are email/password only" via the web Admin Portal).

- [ ] **Step 3: Refresh endpoint**

`apps/web/src/app/api/mobile/auth/refresh/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { refreshToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const result = await caller.auth.refresh({ refreshToken: String(body.refreshToken ?? '') });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHORIZED' ? 401 : 400 });
    }
    return NextResponse.json({ error: 'Refresh failed' }, { status: 400 });
  }
}
```

- [ ] **Step 4: Me endpoint**

`apps/web/src/app/api/mobile/auth/me/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const me = await caller.auth.me();
    if (me.kind !== 'trader') {
      return NextResponse.json({ error: 'Not a trader session' }, { status: 403 });
    }
    return NextResponse.json(me);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHORIZED' ? 401 : 400 });
    }
    return NextResponse.json({ error: 'Failed to load session' }, { status: 400 });
  }
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter @garage-sale/web typecheck`
Expected: exits 0, no errors.

Run: `pnpm --filter @garage-sale/web lint`
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/mobile/auth/register/route.ts apps/web/src/app/api/mobile/auth/login/route.ts apps/web/src/app/api/mobile/auth/refresh/route.ts apps/web/src/app/api/mobile/auth/me/route.ts
git commit -m "F0: add mobile REST facade for auth (register/login/refresh/me)"
```

---

## Task 4: Auth repository

**Files:**
- Create: `apps/mobile_flutter/lib/auth/session_user.dart`
- Create: `apps/mobile_flutter/lib/auth/auth_repository.dart`
- Create: `apps/mobile_flutter/lib/auth/rest_auth_repository.dart`
- Test: `apps/mobile_flutter/test/auth/rest_auth_repository_test.dart`

`AuthRepository` is an abstract interface (so tests/controller can swap in a fake without hitting `ApiClient`); `RestAuthRepository` is the real implementation calling the Task 3 endpoints.

- [ ] **Step 1: Write SessionUser and the AuthRepository interface (no test needed — pure types)**

`apps/mobile_flutter/lib/auth/session_user.dart`:
```dart
class SessionUser {
  const SessionUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.emailVerified,
  });

  final String id;
  final String email;
  final String displayName;
  final bool emailVerified;

  factory SessionUser.fromJson(Map<String, dynamic> json) {
    return SessionUser(
      id: json['id'] as String,
      email: json['email'] as String,
      displayName: json['displayName'] as String,
      emailVerified: json['emailVerified'] as bool,
    );
  }
}
```

`apps/mobile_flutter/lib/auth/auth_repository.dart`:
```dart
import 'session_user.dart';
import 'token_storage.dart';

class AuthResult {
  const AuthResult({required this.user, required this.tokens});
  final SessionUser user;
  final TokenPair tokens;
}

abstract class AuthRepository {
  Future<void> register({
    required String email,
    required String password,
    required String displayName,
  });

  Future<AuthResult> login({required String email, required String password});

  Future<TokenPair> refresh(String refreshToken);

  Future<SessionUser> me(String accessToken);
}
```

- [ ] **Step 2: Write the failing test for RestAuthRepository**

`apps/mobile_flutter/test/auth/rest_auth_repository_test.dart`:
```dart
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/core/api_exception.dart';
import 'package:garage_sale_mobile/auth/rest_auth_repository.dart';

void main() {
  group('RestAuthRepository', () {
    test('login parses user and tokens from the REST response', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/auth/login');
        return http.Response(
          jsonEncode({
            'user': {
              'id': 'u1',
              'email': 'a@b.com',
              'displayName': 'Alice',
              'emailVerified': true,
            },
            'tokens': {'accessToken': 'access1', 'refreshToken': 'refresh1'},
          }),
          200,
        );
      });
      final repo = RestAuthRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      final result = await repo.login(email: 'a@b.com', password: 'password123');

      expect(result.user.id, 'u1');
      expect(result.user.email, 'a@b.com');
      expect(result.tokens.accessToken, 'access1');
      expect(result.tokens.refreshToken, 'refresh1');
    });

    test('login throws ApiException on invalid credentials', () async {
      final mock = MockClient((request) async {
        return http.Response(jsonEncode({'error': 'Invalid email or password'}), 401);
      });
      final repo = RestAuthRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      expect(
        () => repo.login(email: 'a@b.com', password: 'wrong'),
        throwsA(isA<ApiException>()),
      );
    });

    test('me sends the bearer token and parses the trader session', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(
          jsonEncode({
            'kind': 'trader',
            'id': 'u1',
            'email': 'a@b.com',
            'displayName': 'Alice',
            'emailVerified': true,
          }),
          200,
        );
      });
      final repo = RestAuthRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      final user = await repo.me('access1');

      expect(user.id, 'u1');
      expect(captured.headers['Authorization'], 'Bearer access1');
    });

    test('refresh parses a fresh token pair', () async {
      final mock = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'tokens': {'accessToken': 'access2', 'refreshToken': 'refresh2'},
          }),
          200,
        );
      });
      final repo = RestAuthRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      final tokens = await repo.refresh('refresh1');

      expect(tokens.accessToken, 'access2');
      expect(tokens.refreshToken, 'refresh2');
    });
  });
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mobile_flutter && flutter test test/auth/rest_auth_repository_test.dart`
Expected: FAIL — `Target of URI doesn't exist: 'package:garage_sale_mobile/auth/rest_auth_repository.dart'`.

- [ ] **Step 4: Implement RestAuthRepository**

`apps/mobile_flutter/lib/auth/rest_auth_repository.dart`:
```dart
import '../core/api_client.dart';
import 'auth_repository.dart';
import 'session_user.dart';
import 'token_storage.dart';

class RestAuthRepository implements AuthRepository {
  RestAuthRepository(this._client);
  final ApiClient _client;

  @override
  Future<void> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    await _client.post('/mobile/auth/register', {
      'email': email,
      'password': password,
      'displayName': displayName,
    });
  }

  @override
  Future<AuthResult> login({required String email, required String password}) async {
    final json = await _client.post('/mobile/auth/login', {
      'email': email,
      'password': password,
    });
    return AuthResult(
      user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
      tokens: _parseTokens(json['tokens'] as Map<String, dynamic>),
    );
  }

  @override
  Future<TokenPair> refresh(String refreshToken) async {
    final json = await _client.post('/mobile/auth/refresh', {
      'refreshToken': refreshToken,
    });
    return _parseTokens(json['tokens'] as Map<String, dynamic>);
  }

  @override
  Future<SessionUser> me(String accessToken) async {
    final json = await _client.get('/mobile/auth/me', accessToken: accessToken);
    return SessionUser.fromJson(json);
  }

  TokenPair _parseTokens(Map<String, dynamic> json) {
    return TokenPair(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile_flutter && flutter test test/auth/rest_auth_repository_test.dart`
Expected: `00:0X +4: All tests passed!`

- [ ] **Step 6: Commit**

```bash
cd apps/mobile_flutter
git add lib/auth/session_user.dart lib/auth/auth_repository.dart lib/auth/rest_auth_repository.dart test/auth/rest_auth_repository_test.dart
git commit -m "F0: add auth repository over the REST facade"
```

---

## Task 5: Auth controller (Riverpod)

**Files:**
- Create: `apps/mobile_flutter/lib/auth/providers.dart`
- Create: `apps/mobile_flutter/lib/auth/auth_controller.dart`
- Create: `apps/mobile_flutter/test/support/fake_auth_repository.dart`
- Test: `apps/mobile_flutter/test/auth/auth_controller_test.dart`

Mirrors `apps/mobile/src/auth/AuthContext.tsx`'s `hydrate()`: on boot, try `me()` with whatever access token is stored; on failure, try `refresh()` with the stored refresh token and retry `me()`; on total failure, clear tokens and end up unauthenticated. No proactive refresh timer — same as the RN app (reactive, boot-time only).

- [ ] **Step 1: Write the shared fake repository test double**

`apps/mobile_flutter/test/support/fake_auth_repository.dart`:
```dart
import 'package:garage_sale_mobile/auth/auth_repository.dart';
import 'package:garage_sale_mobile/auth/session_user.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';

/// Test double. `password123` is the only password `login` accepts.
/// Access token `access1`/`access2` are the only ones `me` accepts.
class FakeAuthRepository implements AuthRepository {
  bool registerCalled = false;

  @override
  Future<void> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    registerCalled = true;
  }

  @override
  Future<AuthResult> login({required String email, required String password}) async {
    if (password != 'password123') {
      throw Exception('Invalid email or password');
    }
    return AuthResult(
      user: SessionUser(id: 'u1', email: email, displayName: 'Test User', emailVerified: true),
      tokens: const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'),
    );
  }

  @override
  Future<TokenPair> refresh(String refreshToken) async {
    if (refreshToken != 'refresh1') {
      throw Exception('Invalid refresh token');
    }
    return const TokenPair(accessToken: 'access2', refreshToken: 'refresh2');
  }

  @override
  Future<SessionUser> me(String accessToken) async {
    if (accessToken == 'access1' || accessToken == 'access2') {
      return const SessionUser(
        id: 'u1',
        email: 'a@b.com',
        displayName: 'Test User',
        emailVerified: true,
      );
    }
    throw Exception('Unauthenticated');
  }
}
```

- [ ] **Step 2: Write the failing test for AuthController**

`apps/mobile_flutter/test/auth/auth_controller_test.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/auth_controller.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import '../support/fake_auth_repository.dart';
import '../support/in_memory_key_value_store.dart';

ProviderContainer _buildContainer(FakeAuthRepository repo, TokenStorage storage) {
  final container = ProviderContainer(
    overrides: [
      authRepositoryProvider.overrideWithValue(repo),
      tokenStorageProvider.overrideWithValue(storage),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('AuthController', () {
    test('starts unauthenticated when no tokens are stored', () async {
      final container = _buildContainer(FakeAuthRepository(), TokenStorage(InMemoryKeyValueStore()));

      final user = await container.read(authControllerProvider.future);

      expect(user, isNull);
    });

    test('hydrates from a stored valid access token', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'));
      final container = _buildContainer(FakeAuthRepository(), storage);

      final user = await container.read(authControllerProvider.future);

      expect(user?.id, 'u1');
    });

    test('refreshes when the access token is invalid but the refresh token works', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(const TokenPair(accessToken: 'stale', refreshToken: 'refresh1'));
      final container = _buildContainer(FakeAuthRepository(), storage);

      final user = await container.read(authControllerProvider.future);

      expect(user?.id, 'u1');
      expect(await storage.getAccessToken(), 'access2');
    });

    test('clears tokens and stays unauthenticated when refresh also fails', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(const TokenPair(accessToken: 'stale', refreshToken: 'also-stale'));
      final container = _buildContainer(FakeAuthRepository(), storage);

      final user = await container.read(authControllerProvider.future);

      expect(user, isNull);
      expect(await storage.getAccessToken(), isNull);
      expect(await storage.getRefreshToken(), isNull);
    });

    test('login saves tokens and sets authenticated state', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      final container = _buildContainer(FakeAuthRepository(), storage);
      await container.read(authControllerProvider.future);

      await container.read(authControllerProvider.notifier).login(
            email: 'a@b.com',
            password: 'password123',
          );

      expect(container.read(authControllerProvider).value?.id, 'u1');
      expect(await storage.getAccessToken(), 'access1');
    });

    test('login failure surfaces as AsyncError', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      final container = _buildContainer(FakeAuthRepository(), storage);
      await container.read(authControllerProvider.future);

      await container.read(authControllerProvider.notifier).login(
            email: 'a@b.com',
            password: 'wrong',
          );

      expect(container.read(authControllerProvider).hasError, isTrue);
    });

    test('logout clears tokens and resets to unauthenticated', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'));
      final container = _buildContainer(FakeAuthRepository(), storage);
      await container.read(authControllerProvider.future);

      await container.read(authControllerProvider.notifier).logout();

      expect(container.read(authControllerProvider).value, isNull);
      expect(await storage.getAccessToken(), isNull);
    });
  });
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mobile_flutter && flutter test test/auth/auth_controller_test.dart`
Expected: FAIL — `Target of URI doesn't exist: 'package:garage_sale_mobile/auth/auth_controller.dart'`.

- [ ] **Step 4: Implement providers and AuthController**

`apps/mobile_flutter/lib/auth/providers.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import 'auth_repository.dart';
import 'rest_auth_repository.dart';
import 'token_storage.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => RestAuthRepository(ref.watch(apiClientProvider)),
);

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());
```

`apps/mobile_flutter/lib/auth/auth_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'auth_repository.dart';
import 'providers.dart';
import 'session_user.dart';
import 'token_storage.dart';

class AuthController extends AsyncNotifier<SessionUser?> {
  AuthRepository get _repo => ref.read(authRepositoryProvider);
  TokenStorage get _storage => ref.read(tokenStorageProvider);

  @override
  Future<SessionUser?> build() => _hydrate();

  Future<SessionUser?> _hydrate() async {
    final accessToken = await _storage.getAccessToken();
    if (accessToken != null) {
      try {
        return await _repo.me(accessToken);
      } catch (_) {
        // access token missing/expired — fall through to a refresh attempt.
      }
    }
    final refreshToken = await _storage.getRefreshToken();
    if (refreshToken == null) return null;
    try {
      final tokens = await _repo.refresh(refreshToken);
      await _storage.saveTokens(tokens);
      return await _repo.me(tokens.accessToken);
    } catch (_) {
      await _storage.clearTokens();
      return null;
    }
  }

  Future<void> login({required String email, required String password}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final result = await _repo.login(email: email, password: password);
      await _storage.saveTokens(result.tokens);
      return result.user;
    });
  }

  Future<void> register({
    required String email,
    required String password,
    required String displayName,
  }) {
    // No tokens returned — the trader must verify their email before logging in.
    return _repo.register(email: email, password: password, displayName: displayName);
  }

  Future<void> logout() async {
    await _storage.clearTokens();
    state = const AsyncData(null);
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, SessionUser?>(
  AuthController.new,
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile_flutter && flutter test test/auth/auth_controller_test.dart`
Expected: `00:0X +7: All tests passed!`

- [ ] **Step 6: Commit**

```bash
cd apps/mobile_flutter
git add lib/auth/providers.dart lib/auth/auth_controller.dart test/support/fake_auth_repository.dart test/auth/auth_controller_test.dart
git commit -m "F0: add Riverpod AuthController with boot-time hydrate/refresh"
```

---

## Task 6: Screens and router

**Files:**
- Create: `apps/mobile_flutter/lib/screens/login_screen.dart`
- Create: `apps/mobile_flutter/lib/screens/register_screen.dart`
- Create: `apps/mobile_flutter/lib/screens/home_screen.dart`
- Create: `apps/mobile_flutter/lib/router/app_router.dart`
- Test: `apps/mobile_flutter/test/widget/login_screen_test.dart`
- Test: `apps/mobile_flutter/test/widget/app_flow_test.dart`

- [ ] **Step 1: Write the failing test for LoginScreen**

`apps/mobile_flutter/test/widget/login_screen_test.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/screens/login_screen.dart';
import '../support/fake_auth_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  testWidgets('shows an error message when login fails', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
          tokenStorageProvider.overrideWithValue(TokenStorage(InMemoryKeyValueStore())),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('email_field')), 'a@b.com');
    await tester.enterText(find.byKey(const Key('password_field')), 'wrong-password');
    await tester.tap(find.byKey(const Key('login_button')));
    await tester.pumpAndSettle();

    expect(find.text('Invalid email or password'), findsOneWidget);
  });

  testWidgets('disables the login button while a login is in flight', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
          tokenStorageProvider.overrideWithValue(TokenStorage(InMemoryKeyValueStore())),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('email_field')), 'a@b.com');
    await tester.enterText(find.byKey(const Key('password_field')), 'password123');
    await tester.tap(find.byKey(const Key('login_button')));
    await tester.pump();

    final button = tester.widget<ElevatedButton>(find.byKey(const Key('login_button')));
    expect(button.onPressed, isNull);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile_flutter && flutter test test/widget/login_screen_test.dart`
Expected: FAIL — `Target of URI doesn't exist: 'package:garage_sale_mobile/screens/login_screen.dart'`.

- [ ] **Step 3: Implement LoginScreen**

`apps/mobile_flutter/lib/screens/login_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final isLoading = authState.isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('Log in')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              key: const Key('email_field'),
              controller: _emailController,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            TextField(
              key: const Key('password_field'),
              controller: _passwordController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            if (authState.hasError)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('Invalid email or password', style: TextStyle(color: Colors.red)),
              ),
            const SizedBox(height: 16),
            ElevatedButton(
              key: const Key('login_button'),
              onPressed: isLoading
                  ? null
                  : () => ref.read(authControllerProvider.notifier).login(
                        email: _emailController.text,
                        password: _passwordController.text,
                      ),
              child: isLoading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Log in'),
            ),
            TextButton(
              key: const Key('go_to_register'),
              onPressed: () => context.push('/register'),
              child: const Text('Create account'),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile_flutter && flutter test test/widget/login_screen_test.dart`
Expected: `00:0X +2: All tests passed!`

- [ ] **Step 5: Implement RegisterScreen (no dedicated test — see Step 8 for the covered flow)**

`apps/mobile_flutter/lib/screens/register_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_controller.dart';
import '../core/api_exception.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _displayNameController = TextEditingController();
  bool _isSubmitting = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).register(
            email: _emailController.text,
            password: _passwordController.text,
            displayName: _displayNameController.text,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Check your email to verify your account')),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Register')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              key: const Key('display_name_field'),
              controller: _displayNameController,
              decoration: const InputDecoration(labelText: 'Display name'),
            ),
            TextField(
              key: const Key('email_field'),
              controller: _emailController,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            TextField(
              key: const Key('password_field'),
              controller: _passwordController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            const SizedBox(height: 16),
            ElevatedButton(
              key: const Key('register_button'),
              onPressed: _isSubmitting ? null : _submit,
              child: _isSubmitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Register'),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 6: Implement HomeScreen (no dedicated test — see Step 8 for the covered flow)**

`apps/mobile_flutter/lib/screens/home_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
              key: const Key('logout_button'),
              onPressed: () => ref.read(authControllerProvider.notifier).logout(),
              child: const Text('Log out'),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 7: Implement the router**

`apps/mobile_flutter/lib/router/app_router.dart`:
```dart
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';
import '../screens/home_screen.dart';
import '../screens/login_screen.dart';
import '../screens/register_screen.dart';

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
      final loggingIn = state.matchedLocation == '/login' || state.matchedLocation == '/register';
      if (!authenticated && !loggingIn) return '/login';
      if (authenticated && loggingIn) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/register', builder: (context, state) => const RegisterScreen()),
      GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
    ],
  );
});
```

- [ ] **Step 8: Write and run the end-to-end app flow test**

`apps/mobile_flutter/test/widget/app_flow_test.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/main.dart';
import '../support/fake_auth_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  testWidgets('redirects to login when unauthenticated, then home after login', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
          tokenStorageProvider.overrideWithValue(TokenStorage(InMemoryKeyValueStore())),
        ],
        child: const GarageSaleApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Log in'), findsWidgets);

    await tester.enterText(find.byKey(const Key('email_field')), 'a@b.com');
    await tester.enterText(find.byKey(const Key('password_field')), 'password123');
    await tester.tap(find.byKey(const Key('login_button')));
    await tester.pumpAndSettle();

    expect(find.textContaining('Signed in as'), findsOneWidget);

    await tester.tap(find.byKey(const Key('logout_button')));
    await tester.pumpAndSettle();

    expect(find.text('Log in'), findsWidgets);
  });
}
```

This test imports `garage_sale_mobile/main.dart`, which doesn't have `GarageSaleApp` yet — it's created in Task 7. Leave this file in place; it'll fail to compile until Task 7 Step 4. Do not run it yet.

- [ ] **Step 9: Commit**

```bash
cd apps/mobile_flutter
git add lib/screens/login_screen.dart lib/screens/register_screen.dart lib/screens/home_screen.dart lib/router/app_router.dart test/widget/login_screen_test.dart test/widget/app_flow_test.dart
git commit -m "F0: add login/register/home screens and go_router wiring"
```

---

## Task 7: App entry point and final wiring

**Files:**
- Modify: `apps/mobile_flutter/lib/main.dart` (replace default counter app)
- Delete: `apps/mobile_flutter/test/widget_test.dart` (default counter test, no longer applicable)

- [ ] **Step 1: Replace main.dart**

`apps/mobile_flutter/lib/main.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router/app_router.dart';

void main() {
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

- [ ] **Step 2: Delete the obsolete default test**

Run: `cd apps/mobile_flutter && rm test/widget_test.dart`

(This test referenced the default `MyApp` counter widget removed in Step 1 — it would fail to compile otherwise.)

- [ ] **Step 3: Run the full test suite**

Run: `cd apps/mobile_flutter && flutter test`
Expected: all tests pass, including `test/widget/app_flow_test.dart` from Task 6 Step 8 (now that `GarageSaleApp` exists).

- [ ] **Step 4: Run static analysis**

Run: `cd apps/mobile_flutter && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 5: Manual smoke test**

This needs a running backend with a reachable database (see plan header — not available in this local dev environment without one). Once `apps/web` is running against a real Postgres with `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` set:

```bash
# terminal 1
pnpm --filter @garage-sale/web dev

# terminal 2
cd apps/mobile_flutter
flutter run -d <device-id> --dart-define=API_BASE_URL=http://10.0.2.2:3000/api   # Android emulator
# or --dart-define=API_BASE_URL=http://localhost:3000/api                          # iOS simulator
```
Expected: app opens to the login screen; registering an account triggers the existing verification-email flow (check the dev-log fallback in the web server's console if `RESEND_API_KEY` isn't set); after verifying and logging in, the app shows the home screen with "Signed in as \<email\>"; killing and relaunching the app keeps you logged in (boot-time hydrate); logout returns to the login screen.

- [ ] **Step 6: Commit**

```bash
cd apps/mobile_flutter
git add lib/main.dart
git rm test/widget_test.dart
git commit -m "F0: wire app entry point, remove default counter template"
```

---

## After F0

F0 delivers a working, testable Flutter app shell with full email/password auth — nothing else. Subsequent phases (F1 listings, F2 trades, F3 Stripe, F4 FCM push, F5 cutover) each get their own plan via `/gsd:plan-phase`-style planning once F0 is verified working, per the phased build order in the design spec. OAuth (Google/Apple/Facebook) sign-in gets a separate follow-up plan once Firebase/Google-console credentials are provisioned.
