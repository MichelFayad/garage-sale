import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/models/watchlist_entry.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/listings/watchlist_controller.dart';
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
  group('WatchlistController', () {
    test('isWatched reflects the loaded entries', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(
        const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
      );
      final container = ProviderContainer(
        overrides: [
          watchlistRepositoryProvider.overrideWithValue(
            FakeWatchlistRepository(
              entries: [WatchlistEntry(id: 'w1', listing: _listing('l1'))],
            ),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);

      await container.read(watchlistControllerProvider.future);

      final controller = container.read(watchlistControllerProvider.notifier);
      expect(controller.isWatched('l1'), isTrue);
      expect(controller.isWatched('l2'), isFalse);
    });

    test('toggle removes an already-watched listing', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(
        const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
      );
      final container = ProviderContainer(
        overrides: [
          watchlistRepositoryProvider.overrideWithValue(
            FakeWatchlistRepository(
              entries: [WatchlistEntry(id: 'w1', listing: _listing('l1'))],
            ),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
      await container.read(watchlistControllerProvider.future);

      await container.read(watchlistControllerProvider.notifier).toggle('l1');

      final entries = container.read(watchlistControllerProvider).value!;
      expect(entries, isEmpty);
    });
  });
}
