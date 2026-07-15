import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/screens/propose_trade_screen.dart';
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/models/proposal_status.dart';
import 'package:garage_sale_mobile/trades/trades_providers.dart';

import '../support/fake_listings_repository.dart';
import '../support/fake_trades_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _activeListing(String id, String title) => Listing(
  id: id,
  ownerId: 'me',
  type: ListingType.have,
  title: title,
  description: 'desc',
  condition: Condition.good,
  categoryId: 'cat1',
  status: ListingStatus.active,
  photos: const [],
);

void main() {
  testWidgets('ProposeTradeScreen (propose mode) submits selected listings', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));

    final myListing = _activeListing('l2', 'Skates');
    final createdProposal = Proposal(
      id: 'p-new',
      listingId: 'l1',
      listing: _activeListing('l1', 'Bike'),
      proposerId: 'me',
      proposerName: 'Me',
      ownerId: 'owner1',
      ownerName: 'Owner',
      status: ProposalStatus.proposed,
      items: const [],
      confirmations: const [],
      ratings: const [],
      createdAt: DateTime.utc(2026, 7, 15),
    );

    String? pushedPath;
    final router = GoRouter(
      initialLocation: '/trades/propose/l1',
      routes: [
        GoRoute(
          path: '/trades/propose/:listingId',
          builder: (context, state) => ProposeTradeScreen(
            mode: ProposeMode.propose,
            targetId: state.pathParameters['listingId']!,
          ),
        ),
        GoRoute(
          path: '/trades/:id',
          builder: (context, state) {
            pushedPath = state.pathParameters['id'];
            return const SizedBox();
          },
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          listingsRepositoryProvider.overrideWithValue(
            FakeListingsRepository(mine: [myListing]),
          ),
          tradesRepositoryProvider.overrideWithValue(
            FakeTradesRepository(proposals: [createdProposal]),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Skates'), findsOneWidget);

    await tester.tap(find.byKey(const Key('offer_checkbox_l2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('submit_offer_button')));
    await tester.pumpAndSettle();

    expect(pushedPath, 'p-new');
  });

  testWidgets('ProposeTradeScreen (counter mode) submits selected listings', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));

    final myListing = _activeListing('l2', 'Skates');
    final targetProposal = Proposal(
      id: 'p1',
      listingId: 'l1',
      listing: _activeListing('l1', 'Bike'),
      proposerId: 'owner1',
      proposerName: 'Owner',
      ownerId: 'me',
      ownerName: 'Me',
      status: ProposalStatus.proposed,
      items: const [],
      confirmations: const [],
      ratings: const [],
      createdAt: DateTime.utc(2026, 7, 15),
    );
    final counteredProposal = Proposal(
      id: 'p-counter',
      listingId: 'l1',
      listing: _activeListing('l1', 'Bike'),
      proposerId: 'me',
      proposerName: 'Me',
      ownerId: 'owner1',
      ownerName: 'Owner',
      status: ProposalStatus.proposed,
      items: const [],
      confirmations: const [],
      ratings: const [],
      createdAt: DateTime.utc(2026, 7, 15),
    );

    String? pushedPath;
    final router = GoRouter(
      initialLocation: '/trades/p1/counter',
      routes: [
        GoRoute(
          path: '/trades/:id/counter',
          builder: (context, state) => ProposeTradeScreen(
            mode: ProposeMode.counter,
            targetId: state.pathParameters['id']!,
          ),
        ),
        GoRoute(
          path: '/trades/:id',
          builder: (context, state) {
            pushedPath = state.pathParameters['id'];
            return const SizedBox();
          },
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          listingsRepositoryProvider.overrideWithValue(
            FakeListingsRepository(mine: [myListing]),
          ),
          tradesRepositoryProvider.overrideWithValue(
            FakeTradesRepository(proposals: [targetProposal, counteredProposal]),
          ),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('offer_checkbox_l2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('submit_offer_button')));
    await tester.pumpAndSettle();

    // FakeTradesRepository.counter(id, ...) returns _proposals.firstWhere((p) => p.id == id).
    // TradeDetailController.counter() calls _repo.counter(arg, ...) where arg is the
    // controller's own family id (widget.targetId = 'p1' here), so the fake returns
    // targetProposal (id 'p1'), not counteredProposal.
    expect(pushedPath, 'p1');
  });
}
