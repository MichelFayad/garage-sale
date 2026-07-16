import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/my_listings_controller.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
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

ProviderContainer _buildContainer(FakeListingsRepository repo) {
  final storage = TokenStorage(InMemoryKeyValueStore());
  final container = ProviderContainer(
    overrides: [
      listingsRepositoryProvider.overrideWithValue(repo),
      tokenStorageProvider.overrideWithValue(storage),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('MyListingsController', () {
    test('loads the caller\'s listings on build', () async {
      final container = _buildContainer(
        FakeListingsRepository(mine: [_listing('l1')]),
      );
      await container
          .read(tokenStorageProvider)
          .saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));

      final listings = await container.read(myListingsControllerProvider.future);

      expect(listings, hasLength(1));
      expect(listings.first.id, 'l1');
    });

    test('markTraded calls the repository and refreshes the list', () async {
      final repo = FakeListingsRepository(mine: [_listing('l1')]);
      final container = _buildContainer(repo);
      await container
          .read(tokenStorageProvider)
          .saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));
      await container.read(myListingsControllerProvider.future);

      await container.read(myListingsControllerProvider.notifier).markTraded('l1');

      expect(repo.lastMarkTradedId, 'l1');
      final listings = container.read(myListingsControllerProvider).value!;
      expect(listings.first.status, ListingStatus.completed);
    });

    test('remove calls the repository and drops the listing from state', () async {
      final repo = FakeListingsRepository(mine: [_listing('l1'), _listing('l2')]);
      final container = _buildContainer(repo);
      await container
          .read(tokenStorageProvider)
          .saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));
      await container.read(myListingsControllerProvider.future);

      await container.read(myListingsControllerProvider.notifier).remove('l1');

      expect(repo.lastRemoveId, 'l1');
      final listings = container.read(myListingsControllerProvider).value!;
      expect(listings.map((l) => l.id), ['l2']);
    });
  });
}
