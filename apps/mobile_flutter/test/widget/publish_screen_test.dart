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
