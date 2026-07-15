import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/models/proposal_status.dart';
import 'package:garage_sale_mobile/trades/trades_controller.dart';
import 'package:garage_sale_mobile/trades/trades_providers.dart';

import '../support/fake_trades_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _listing() => const Listing(
  id: 'l1',
  ownerId: 'owner1',
  type: ListingType.have,
  title: 'Bike',
  description: 'Road bike',
  condition: Condition.good,
  categoryId: 'cat1',
  status: ListingStatus.active,
  photos: [],
);

Proposal _proposal(String id) => Proposal(
  id: id,
  listingId: 'l1',
  listing: _listing(),
  proposerId: 'u1',
  proposerName: 'Alice',
  ownerId: 'u2',
  ownerName: 'Bob',
  status: ProposalStatus.proposed,
  items: const [],
  confirmations: const [],
  ratings: const [],
  createdAt: DateTime.utc(2026, 7, 15),
);

void main() {
  group('TradesController', () {
    late ProviderContainer container;

    setUp(() async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));
      container = ProviderContainer(
        overrides: [
          tradesRepositoryProvider.overrideWithValue(
            FakeTradesRepository(proposals: [_proposal('p1')]),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
    });

    test('build loads the caller\'s proposals', () async {
      final result = await container.read(tradesControllerProvider.future);
      expect(result, hasLength(1));
      expect(result.first.id, 'p1');
    });

    test('refresh reloads after the initial build resolves', () async {
      await container.read(tradesControllerProvider.future);
      await container.read(tradesControllerProvider.notifier).refresh();
      expect(container.read(tradesControllerProvider).value, hasLength(1));
    });

    test('propose calls the repository and returns the created proposal', () async {
      await container.read(tradesControllerProvider.future);
      final result = await container
          .read(tradesControllerProvider.notifier)
          .propose('l1', ['l2', 'l3']);
      expect(result.id, 'p1');
    });
  });
}
