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
          tokenStorageProvider.overrideWithValue(
            TokenStorage(InMemoryKeyValueStore()),
          ),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('email_field')), 'a@b.com');
    await tester.enterText(
      find.byKey(const Key('password_field')),
      'wrong-password',
    );
    await tester.tap(find.byKey(const Key('login_button')));
    await tester.pumpAndSettle();

    expect(find.text('Invalid email or password'), findsOneWidget);
  });

  testWidgets('disables the login button while a login is in flight', (
    tester,
  ) async {
    final authRepository = FakeAuthRepository()
      ..loginDelay = const Duration(milliseconds: 50);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(authRepository),
          tokenStorageProvider.overrideWithValue(
            TokenStorage(InMemoryKeyValueStore()),
          ),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('email_field')), 'a@b.com');
    await tester.enterText(
      find.byKey(const Key('password_field')),
      'password123',
    );
    await tester.tap(find.byKey(const Key('login_button')));
    await tester.pump();

    final button = tester.widget<ElevatedButton>(
      find.byKey(const Key('login_button')),
    );
    expect(button.onPressed, isNull);

    // Let the delayed login resolve so no timers are left pending at test end.
    await tester.pumpAndSettle();
  });
}
