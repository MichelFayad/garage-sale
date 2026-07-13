import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/main.dart';
import '../support/fake_auth_repository.dart';
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
}
