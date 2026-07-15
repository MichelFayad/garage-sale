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

  testWidgets('shows an error when the card sheet fails', (tester) async {
    final tokenStorage = await _seededTokenStorage();
    final repo = FakeBillingRepository();
    Future<CardSheetResult> fakeCardSheet(BillingRepository r, String token) async {
      return const CardSheetResult(ok: false, error: 'Your card was declined');
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

    await tester.tap(find.byKey(const Key('add_replace_card_button')));
    await tester.pumpAndSettle();

    expect(find.text('Your card was declined'), findsOneWidget);
    expect(find.text('No card on file'), findsOneWidget);
  });

  testWidgets('does nothing when the card sheet is cancelled', (tester) async {
    final tokenStorage = await _seededTokenStorage();
    final repo = FakeBillingRepository();
    Future<CardSheetResult> fakeCardSheet(BillingRepository r, String token) async {
      return const CardSheetResult(ok: false, cancelled: true);
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

    await tester.tap(find.byKey(const Key('add_replace_card_button')));
    await tester.pumpAndSettle();

    expect(find.text('No card on file'), findsOneWidget);
  });
}
