import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/screens/trades_screen.dart';
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/models/proposal_status.dart';
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

void main() {
  testWidgets('TradesScreen renders proposals and navigates on tap', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));

    final proposal = Proposal(
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

    var pushed = '';
    final router = GoRouter(
      initialLocation: '/trades',
      routes: [
        GoRoute(
          path: '/trades',
          builder: (context, state) => const TradesScreen(),
        ),
        GoRoute(
          path: '/trades/:id',
          builder: (context, state) {
            pushed = state.pathParameters['id']!;
            return const SizedBox();
          },
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tradesRepositoryProvider.overrideWithValue(
            FakeTradesRepository(proposals: [proposal]),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bike'), findsOneWidget);
    expect(find.text('Proposed'), findsOneWidget);

    await tester.tap(find.byKey(const Key('trade_tile_p1')));
    await tester.pumpAndSettle();

    expect(pushed, 'p1');
  });

  testWidgets('TradesScreen shows the empty state when there are no proposals', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tradesRepositoryProvider.overrideWithValue(FakeTradesRepository(proposals: const [])),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: MaterialApp.router(
          routerConfig: GoRouter(
            initialLocation: '/trades',
            routes: [GoRoute(path: '/trades', builder: (context, state) => const TradesScreen())],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No trades yet.'), findsOneWidget);
  });

  testWidgets('TradesScreen renders every ProposalStatus with its friendly label', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));

    Proposal proposalWith(String id, ProposalStatus status) => Proposal(
      id: id,
      listingId: 'l1',
      listing: _listing(),
      proposerId: 'u1',
      proposerName: 'Alice',
      ownerId: 'u2',
      ownerName: 'Bob',
      status: status,
      items: const [],
      confirmations: const [],
      ratings: const [],
      createdAt: DateTime.utc(2026, 7, 15),
    );

    final proposals = [
      proposalWith('p1', ProposalStatus.proposed),
      proposalWith('p2', ProposalStatus.accepted),
      proposalWith('p3', ProposalStatus.declined),
      proposalWith('p4', ProposalStatus.countered),
      proposalWith('p5', ProposalStatus.cancelled),
      proposalWith('p6', ProposalStatus.completed),
    ];

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tradesRepositoryProvider.overrideWithValue(FakeTradesRepository(proposals: proposals)),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: MaterialApp.router(
          routerConfig: GoRouter(
            initialLocation: '/trades',
            routes: [GoRoute(path: '/trades', builder: (context, state) => const TradesScreen())],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Proposed'), findsOneWidget);
    expect(find.text('Accepted'), findsOneWidget);
    expect(find.text('Declined'), findsOneWidget);
    expect(find.text('Countered'), findsOneWidget);
    expect(find.text('Cancelled'), findsOneWidget);
    expect(find.text('Completed'), findsOneWidget);
  });
}
