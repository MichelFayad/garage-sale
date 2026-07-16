import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/models/proposal_status.dart';
import 'package:garage_sale_mobile/trades/trade_detail_controller.dart';
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

Proposal _proposal() => Proposal(
  id: 'p1',
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
  group('TradeDetailController', () {
    late ProviderContainer container;
    late FakeTradesRepository fakeRepo;

    setUp(() async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));
      fakeRepo = FakeTradesRepository(proposals: [_proposal()]);
      container = ProviderContainer(
        overrides: [
          tradesRepositoryProvider.overrideWithValue(fakeRepo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
    });

    test('build loads the proposal by id', () async {
      final result = await container.read(tradeDetailControllerProvider('p1').future);
      expect(result.id, 'p1');
    });

    test('accept calls the repository once and invalidates the list', () async {
      await container.read(tradeDetailControllerProvider('p1').future);
      await container.read(tradeDetailControllerProvider('p1').notifier).accept();
      expect(fakeRepo.acceptCalls, 1);
    });

    test('rate calls the repository with stars and review', () async {
      await container.read(tradeDetailControllerProvider('p1').future);
      await container.read(tradeDetailControllerProvider('p1').notifier).rate(5, 'Great trade');
      expect(fakeRepo.lastRateStars, 5);
      expect(fakeRepo.lastRateReview, 'Great trade');
    });

    test('decline calls the repository once', () async {
      await container.read(tradeDetailControllerProvider('p1').future);
      await container.read(tradeDetailControllerProvider('p1').notifier).decline();
      expect(fakeRepo.declineCalls, 1);
    });

    test('cancel calls the repository once', () async {
      await container.read(tradeDetailControllerProvider('p1').future);
      await container.read(tradeDetailControllerProvider('p1').notifier).cancel();
      expect(fakeRepo.cancelCalls, 1);
    });

    test('confirm calls the repository once', () async {
      await container.read(tradeDetailControllerProvider('p1').future);
      await container.read(tradeDetailControllerProvider('p1').notifier).confirm();
      expect(fakeRepo.confirmCalls, 1);
    });

    test('counter returns the new proposal id and invalidates the list', () async {
      await container.read(tradeDetailControllerProvider('p1').future);
      final newId = await container
          .read(tradeDetailControllerProvider('p1').notifier)
          .counter(['l9']);
      expect(newId, isNotEmpty);
    });
  });
}
