import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/browse_controller.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import '../support/fake_browse_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _listing(String id, String title) {
  return Listing(
    id: id,
    ownerId: 'u1',
    type: ListingType.have,
    title: title,
    description: 'A bike',
    condition: Condition.good,
    categoryId: 'c1',
    status: ListingStatus.active,
    photos: const [],
  );
}

ProviderContainer _buildContainer(FakeBrowseRepository repo) {
  final storage = TokenStorage(InMemoryKeyValueStore());
  final container = ProviderContainer(
    overrides: [
      browseRepositoryProvider.overrideWithValue(repo),
      tokenStorageProvider.overrideWithValue(storage),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('BrowseController', () {
    test('build performs an initial unfiltered search', () async {
      final repo = FakeBrowseRepository(results: [_listing('l1', 'Red bike')]);
      final container = _buildContainer(repo);
      await container
          .read(tokenStorageProvider)
          .saveTokens(
            const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
          );

      final listings = await container.read(browseControllerProvider.future);

      expect(repo.lastKeyword, isNull);
      expect(listings, hasLength(1));
      expect(listings.first.id, 'l1');
    });

    test(
      'applyFilters passes categoryId, condition, and type through to the repository',
      () async {
        final repo = FakeBrowseRepository(
          results: [_listing('l1', 'Red bike')],
        );
        final container = _buildContainer(repo);
        await container
            .read(tokenStorageProvider)
            .saveTokens(
              const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
            );
        await container.read(browseControllerProvider.future);

        await container
            .read(browseControllerProvider.notifier)
            .applyFilters(
              keyword: 'bike',
              categoryId: 'c1',
              condition: Condition.good,
              type: ListingType.have,
            );

        expect(repo.lastKeyword, 'bike');
        expect(repo.lastCategoryId, 'c1');
        expect(repo.lastCondition, Condition.good);
        expect(repo.lastType, ListingType.have);
      },
    );
  });
}
