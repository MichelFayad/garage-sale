import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/models/watchlist_entry.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/screens/watchlist_screen.dart';
import '../support/fake_watchlist_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _listing(String id) {
  return Listing(
    id: id,
    ownerId: 'u2',
    type: ListingType.have,
    title: 'Bike $id',
    description: 'desc',
    condition: Condition.good,
    categoryId: 'c1',
    status: ListingStatus.active,
    photos: const [],
  );
}

void main() {
  testWidgets('shows watched listings and removes on tap', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(
      const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          watchlistRepositoryProvider.overrideWithValue(
            FakeWatchlistRepository(entries: [WatchlistEntry(id: 'w1', listing: _listing('l1'))]),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: WatchlistScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bike l1'), findsOneWidget);

    await tester.tap(find.byKey(const Key('watchlist_remove_l1')));
    await tester.pumpAndSettle();

    expect(find.text('Bike l1'), findsNothing);
  });
}
