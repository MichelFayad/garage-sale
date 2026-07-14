import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/providers.dart';
import 'package:garage_sale_mobile/screens/browse_screen.dart';
import '../support/fake_browse_repository.dart';
import '../support/in_memory_key_value_store.dart';

Listing _listing(String id, String title) {
  return Listing(
    id: id,
    ownerId: 'u2',
    type: ListingType.have,
    title: title,
    description: 'desc',
    condition: Condition.good,
    categoryId: 'c1',
    status: ListingStatus.active,
    photos: const [],
  );
}

void main() {
  testWidgets('shows search results and filters by keyword', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(
      const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
    );
    final repo = FakeBrowseRepository(
      results: [_listing('l1', 'Red bike'), _listing('l2', 'Blue chair')],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          browseRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: BrowseScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Red bike'), findsOneWidget);
    expect(find.text('Blue chair'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('keyword_field')), 'bike');
    await tester.tap(find.byKey(const Key('search_button')));
    await tester.pumpAndSettle();

    expect(repo.lastKeyword, 'bike');
    expect(find.text('Red bike'), findsOneWidget);
    expect(find.text('Blue chair'), findsNothing);
  });
}
