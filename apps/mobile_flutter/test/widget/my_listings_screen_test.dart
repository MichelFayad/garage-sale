import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/screens/my_listings_screen.dart';
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

Future<TokenStorage> _seededTokenStorage() async {
  final storage = TokenStorage(InMemoryKeyValueStore());
  await storage.saveTokens(
    const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
  );
  return storage;
}

void main() {
  testWidgets('shows the caller\'s listings', (tester) async {
    final tokenStorage = await _seededTokenStorage();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          listingsRepositoryProvider.overrideWithValue(
            FakeListingsRepository(mine: [_listing('l1')]),
          ),
          tokenStorageProvider.overrideWithValue(tokenStorage),
        ],
        child: const MaterialApp(home: MyListingsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bike l1'), findsOneWidget);
  });

  testWidgets('removing a listing drops it from the list', (tester) async {
    final tokenStorage = await _seededTokenStorage();
    final repo = FakeListingsRepository(mine: [_listing('l1'), _listing('l2')]);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          listingsRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(tokenStorage),
        ],
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
