import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/category.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/screens/listing_form_screen.dart';
import '../support/fake_listings_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  testWidgets('create mode submits a new listing with the entered fields', (tester) async {
    final repo = FakeListingsRepository(
      categories: const [Category(id: 'c1', name: 'Bikes', sortOrder: 0)],
    );
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(
      const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          listingsRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: ListingFormScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('title_field')), 'Bike');
    await tester.enterText(find.byKey(const Key('description_field')), 'Red bike');
    await tester.tap(find.byKey(const Key('category_dropdown')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bikes').last);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('save_listing_button')));
    await tester.pumpAndSettle();

    final created = await repo.mine('tok1');
    expect(created, hasLength(1));
    expect(created.first.title, 'Bike');
    expect(created.first.description, 'Red bike');
    expect(created.first.categoryId, 'c1');
  });

  testWidgets('edit mode prefills fields from the existing listing', (tester) async {
    final existing = Listing(
      id: 'l1',
      ownerId: 'u1',
      type: ListingType.want,
      title: 'Chair',
      description: 'Any chair',
      condition: Condition.fair,
      categoryId: 'c1',
      status: ListingStatus.draft,
      photos: const [],
    );
    final repo = FakeListingsRepository(mine: [existing]);
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(
      const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          listingsRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: MaterialApp(home: ListingFormScreen(existing: existing)),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Chair'), findsOneWidget);
    expect(find.text('Any chair'), findsOneWidget);
  });
}
