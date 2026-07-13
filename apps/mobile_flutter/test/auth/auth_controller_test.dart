import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/auth_controller.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import '../support/fake_auth_repository.dart';
import '../support/in_memory_key_value_store.dart';

ProviderContainer _buildContainer(
  FakeAuthRepository repo,
  TokenStorage storage,
) {
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
      final container = _buildContainer(
        FakeAuthRepository(),
        TokenStorage(InMemoryKeyValueStore()),
      );

      final user = await container.read(authControllerProvider.future);

      expect(user, isNull);
    });

    test('hydrates from a stored valid access token', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(
        const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'),
      );
      final container = _buildContainer(FakeAuthRepository(), storage);

      final user = await container.read(authControllerProvider.future);

      expect(user?.id, 'u1');
    });

    test(
      'refreshes when the access token is invalid but the refresh token works',
      () async {
        final storage = TokenStorage(InMemoryKeyValueStore());
        await storage.saveTokens(
          const TokenPair(accessToken: 'stale', refreshToken: 'refresh1'),
        );
        final container = _buildContainer(FakeAuthRepository(), storage);

        final user = await container.read(authControllerProvider.future);

        expect(user?.id, 'u1');
        expect(await storage.getAccessToken(), 'access2');
      },
    );

    test(
      'clears tokens and stays unauthenticated when refresh also fails',
      () async {
        final storage = TokenStorage(InMemoryKeyValueStore());
        await storage.saveTokens(
          const TokenPair(accessToken: 'stale', refreshToken: 'also-stale'),
        );
        final container = _buildContainer(FakeAuthRepository(), storage);

        final user = await container.read(authControllerProvider.future);

        expect(user, isNull);
        expect(await storage.getAccessToken(), isNull);
        expect(await storage.getRefreshToken(), isNull);
      },
    );

    test('login saves tokens and sets authenticated state', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      final container = _buildContainer(FakeAuthRepository(), storage);
      await container.read(authControllerProvider.future);

      await container
          .read(authControllerProvider.notifier)
          .login(email: 'a@b.com', password: 'password123');

      expect(container.read(authControllerProvider).value?.id, 'u1');
      expect(await storage.getAccessToken(), 'access1');
    });

    test('login failure surfaces as AsyncError', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      final container = _buildContainer(FakeAuthRepository(), storage);
      await container.read(authControllerProvider.future);

      await container
          .read(authControllerProvider.notifier)
          .login(email: 'a@b.com', password: 'wrong');

      expect(container.read(authControllerProvider).hasError, isTrue);
    });

    test('logout clears tokens and resets to unauthenticated', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(
        const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'),
      );
      final container = _buildContainer(FakeAuthRepository(), storage);
      await container.read(authControllerProvider.future);

      await container.read(authControllerProvider.notifier).logout();

      expect(container.read(authControllerProvider).value, isNull);
      expect(await storage.getAccessToken(), isNull);
    });

    test('login is not clobbered by a slow-resolving boot hydrate', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(
        const TokenPair(accessToken: 'stale', refreshToken: 'also-stale'),
      );
      final repo = FakeAuthRepository()
        ..meDelay = const Duration(milliseconds: 50);
      final container = _buildContainer(repo, storage);

      // Don't await the initial hydrate — call login while it's still in
      // flight (hydrate's `me()` call is artificially slow and will
      // eventually resolve to unauthenticated on its own).
      final loginFuture = container
          .read(authControllerProvider.notifier)
          .login(email: 'a@b.com', password: 'password123');
      await loginFuture;

      // Give the slow boot hydrate a chance to also resolve and, if the
      // race isn't closed, clobber the freshly-logged-in state. Note: the
      // clobbered value would still carry id 'u1' (the fake repo always
      // returns that), so the real tell is the *token* left in storage —
      // an unguarded hydrate finishing after login overwrites the login's
      // access1/refresh1 with a spurious access2/refresh2 pair minted by
      // its own internal refresh() fallback.
      await Future<void>.delayed(const Duration(milliseconds: 100));

      expect(container.read(authControllerProvider).value?.id, 'u1');
      expect(await storage.getAccessToken(), 'access1');
      expect(await storage.getRefreshToken(), 'refresh1');
    });

    test(
      'register delegates to the repository and does not change auth state',
      () async {
        final storage = TokenStorage(InMemoryKeyValueStore());
        final repo = FakeAuthRepository();
        final container = _buildContainer(repo, storage);
        await container.read(authControllerProvider.future);

        await container
            .read(authControllerProvider.notifier)
            .register(
              email: 'new@user.com',
              password: 'password123',
              displayName: 'New User',
            );

        expect(repo.registerCalled, isTrue);
        expect(container.read(authControllerProvider).value, isNull);
      },
    );
  });
}
