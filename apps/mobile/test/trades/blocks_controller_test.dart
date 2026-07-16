import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/trades/blocks_controller.dart';
import 'package:garage_sale_mobile/trades/blocks_providers.dart';
import 'package:garage_sale_mobile/trades/models/block_entry.dart';

import '../support/fake_blocks_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  group('BlocksController', () {
    late ProviderContainer container;
    late FakeBlocksRepository fakeRepo;

    setUp(() async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));
      fakeRepo = FakeBlocksRepository(
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
      container = ProviderContainer(
        overrides: [
          blocksRepositoryProvider.overrideWithValue(fakeRepo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
    });

    test('build loads blocked users', () async {
      final result = await container.read(blocksControllerProvider.future);
      expect(result, hasLength(1));
      expect(result.first.blockedUserName, 'Carol');
    });

    test('unblock removes the entry and calls the repository', () async {
      await container.read(blocksControllerProvider.future);
      await container.read(blocksControllerProvider.notifier).unblock('u3');
      expect(fakeRepo.unblockCalls, 1);
      expect(container.read(blocksControllerProvider).value, isEmpty);
    });

    test('blockStatusProvider reflects the repository', () async {
      final blocked = await container.read(blockStatusProvider('u3').future);
      expect(blocked, isTrue);
      final notBlocked = await container.read(blockStatusProvider('u9').future);
      expect(notBlocked, isFalse);
    });

    test('block adds the entry and calls the repository', () async {
      await container.read(blocksControllerProvider.future);
      await container.read(blocksControllerProvider.notifier).block('u9', 'Spam');
      expect(fakeRepo.blockCalls, 1);
      expect(await container.read(blockStatusProvider('u9').future), isTrue);
    });
  });
}
