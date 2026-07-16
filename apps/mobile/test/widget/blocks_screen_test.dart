import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/screens/blocks_screen.dart';
import 'package:garage_sale_mobile/trades/blocks_providers.dart';
import 'package:garage_sale_mobile/trades/models/block_entry.dart';

import '../support/fake_blocks_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  testWidgets('BlocksScreen lists blocked traders and unblocks on tap', (tester) async {
    final storage = TokenStorage(InMemoryKeyValueStore());
    await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));

    final fakeRepo = FakeBlocksRepository(
      entries: [
        BlockEntry(
          id: 'b1',
          blockedUserId: 'u3',
          blockedUserName: 'Carol',
          createdAt: DateTime.utc(2026, 7, 15),
        ),
      ],
      blockedIds: {'u3'},
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          blocksRepositoryProvider.overrideWithValue(fakeRepo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(home: BlocksScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Carol'), findsOneWidget);

    await tester.tap(find.byKey(const Key('unblock_button_u3')));
    await tester.pumpAndSettle();

    expect(fakeRepo.unblockCalls, 1);
    expect(find.text('Carol'), findsNothing);
  });
}
