import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/screens/listing_detail_screen.dart';
import '../support/fake_listings_repository.dart';
import '../support/fake_watchlist_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  testWidgets('shows the listing title and description', (tester) async {
    const listing = Listing(
      id: 'l1',
      ownerId: 'u2',
      type: ListingType.have,
      title: 'Red bike',
      description: 'A very red bike',
      condition: Condition.good,
      categoryId: 'c1',
      status: ListingStatus.active,
      photos: [],
    );
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(
      const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          listingsRepositoryProvider.overrideWithValue(
            FakeListingsRepository(mine: [listing]),
          ),
          watchlistRepositoryProvider.overrideWithValue(
            FakeWatchlistRepository(),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: ListingDetailScreen(listingId: 'l1')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Red bike'), findsOneWidget);
    expect(find.text('A very red bike'), findsOneWidget);
  });

  testWidgets(
    'tapping the watchlist button adds the listing and updates the icon',
    (tester) async {
      const listing = Listing(
        id: 'l1',
        ownerId: 'u2',
        type: ListingType.have,
        title: 'Red bike',
        description: 'A very red bike',
        condition: Condition.good,
        categoryId: 'c1',
        status: ListingStatus.active,
        photos: [],
      );
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(
        const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            listingsRepositoryProvider.overrideWithValue(
              FakeListingsRepository(mine: [listing]),
            ),
            watchlistRepositoryProvider.overrideWithValue(
              FakeWatchlistRepository(catalog: [listing]),
            ),
            tokenStorageProvider.overrideWithValue(storage),
          ],
          child: const MaterialApp(home: ListingDetailScreen(listingId: 'l1')),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.favorite_border), findsOneWidget);
      expect(find.byIcon(Icons.favorite), findsNothing);

      await tester.tap(find.byKey(const Key('watchlist_toggle_button')));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.favorite), findsOneWidget);
      expect(find.byIcon(Icons.favorite_border), findsNothing);
    },
  );
}
