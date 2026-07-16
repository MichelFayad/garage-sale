import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/main.dart';
import 'package:garage_sale_mobile/push/providers.dart';
import '../support/fake_auth_repository.dart';
import '../support/fake_listings_repository.dart';
import '../support/fake_push_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  testWidgets(
    'redirects to login when unauthenticated, then home after login',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
            tokenStorageProvider.overrideWithValue(
              TokenStorage(InMemoryKeyValueStore()),
            ),
          ],
          child: const GarageSaleApp(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Log in'), findsWidgets);

      await tester.enterText(find.byKey(const Key('email_field')), 'a@b.com');
      await tester.enterText(
        find.byKey(const Key('password_field')),
        'password123',
      );
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pumpAndSettle();

      expect(find.textContaining('Signed in as'), findsOneWidget);

      await tester.tap(find.byKey(const Key('logout_button')));
      await tester.pumpAndSettle();

      expect(find.text('Log in'), findsWidgets);
    },
  );

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

  testWidgets('registers the device push token on login via the auth listener', (
    tester,
  ) async {
    final pushRepo = FakePushRepository();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
          tokenStorageProvider.overrideWithValue(
            TokenStorage(InMemoryKeyValueStore()),
          ),
          pushRepositoryProvider.overrideWithValue(pushRepo),
          devicePushTokenProvider.overrideWithValue(() async => 'device-token-1'),
        ],
        child: const GarageSaleApp(),
      ),
    );
    await tester.pumpAndSettle();

    // Unauthenticated boot must not register anything.
    expect(pushRepo.registerCalls, 0);

    await tester.enterText(find.byKey(const Key('email_field')), 'a@b.com');
    await tester.enterText(
      find.byKey(const Key('password_field')),
      'password123',
    );
    await tester.tap(find.byKey(const Key('login_button')));
    await tester.pumpAndSettle();

    // The unauthenticated -> authenticated transition fires the main.dart
    // ref.listen callback, which registers this device's push token.
    expect(pushRepo.registerCalls, 1);
    expect(pushRepo.lastRegisteredToken, 'device-token-1');
  });
}
