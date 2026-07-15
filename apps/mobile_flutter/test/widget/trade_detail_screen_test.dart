import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/screens/trade_detail_screen.dart';
import 'package:garage_sale_mobile/trades/blocks_providers.dart';
import 'package:garage_sale_mobile/trades/messages_providers.dart';
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/models/proposal_status.dart';
import 'package:garage_sale_mobile/trades/trades_providers.dart';

import '../support/fake_auth_repository.dart';
import '../support/fake_blocks_repository.dart';
import '../support/fake_messages_repository.dart';
import '../support/fake_reports_repository.dart';
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
  status: ListingStatus.locked,
  photos: [],
);

void main() {
  testWidgets('TradeDetailScreen shows accept/decline for the owner on a proposed trade', (
    tester,
  ) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'));

    final proposal = Proposal(
      id: 'p1',
      listingId: 'l1',
      listing: _listing(),
      proposerId: 'u2',
      proposerName: 'Alice',
      ownerId: 'u1',
      ownerName: 'Test User',
      status: ProposalStatus.proposed,
      items: const [],
      confirmations: const [],
      ratings: const [],
      createdAt: DateTime.utc(2026, 7, 15),
    );

    final fakeTrades = FakeTradesRepository(proposals: [proposal]);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
          tradesRepositoryProvider.overrideWithValue(fakeTrades),
          messagesRepositoryProvider.overrideWithValue(FakeMessagesRepository()),
          blocksRepositoryProvider.overrideWithValue(FakeBlocksRepository()),
          reportsRepositoryProvider.overrideWithValue(FakeReportsRepository()),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: TradeDetailScreen(id: 'p1')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bike'), findsOneWidget);
    expect(find.byKey(const Key('accept_button')), findsOneWidget);

    await tester.tap(find.byKey(const Key('accept_button')));
    await tester.pumpAndSettle();

    expect(fakeTrades.acceptCalls, 1);
  });

  testWidgets('TradeDetailScreen block button toggles label after tapping', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'));

    final proposal = Proposal(
      id: 'p1',
      listingId: 'l1',
      listing: _listing(),
      proposerId: 'u2',
      proposerName: 'Alice',
      ownerId: 'u1',
      ownerName: 'Test User',
      status: ProposalStatus.proposed,
      items: const [],
      confirmations: const [],
      ratings: const [],
      createdAt: DateTime.utc(2026, 7, 15),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
          tradesRepositoryProvider.overrideWithValue(FakeTradesRepository(proposals: [proposal])),
          messagesRepositoryProvider.overrideWithValue(FakeMessagesRepository()),
          blocksRepositoryProvider.overrideWithValue(FakeBlocksRepository()),
          reportsRepositoryProvider.overrideWithValue(FakeReportsRepository()),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: TradeDetailScreen(id: 'p1')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Block trader'), findsOneWidget);

    await tester.tap(find.byKey(const Key('block_button')));
    await tester.pumpAndSettle();

    expect(find.text('Unblock trader'), findsOneWidget);

    await tester.tap(find.byKey(const Key('block_button')));
    await tester.pumpAndSettle();

    expect(find.text('Block trader'), findsOneWidget);
  });

  testWidgets('TradeDetailScreen hides accept/decline for the non-owner proposer', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'));

    final proposal = Proposal(
      id: 'p1',
      listingId: 'l1',
      listing: _listing(),
      proposerId: 'u1',
      proposerName: 'Test User',
      ownerId: 'u2',
      ownerName: 'Bob',
      status: ProposalStatus.proposed,
      items: const [],
      confirmations: const [],
      ratings: const [],
      createdAt: DateTime.utc(2026, 7, 15),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
          tradesRepositoryProvider.overrideWithValue(FakeTradesRepository(proposals: [proposal])),
          messagesRepositoryProvider.overrideWithValue(FakeMessagesRepository()),
          blocksRepositoryProvider.overrideWithValue(FakeBlocksRepository()),
          reportsRepositoryProvider.overrideWithValue(FakeReportsRepository()),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: TradeDetailScreen(id: 'p1')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('accept_button')), findsNothing);
    expect(find.byKey(const Key('decline_button')), findsNothing);
    expect(find.byKey(const Key('counter_button')), findsOneWidget);
    expect(find.byKey(const Key('cancel_button')), findsOneWidget);
  });
}
