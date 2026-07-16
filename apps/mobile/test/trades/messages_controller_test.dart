import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/trades/messages_controller.dart';
import 'package:garage_sale_mobile/trades/messages_providers.dart';
import 'package:garage_sale_mobile/trades/models/trade_message.dart';

import '../support/fake_messages_repository.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  group('MessagesController', () {
    late ProviderContainer container;
    late FakeMessagesRepository fakeRepo;

    setUp(() async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'));
      fakeRepo = FakeMessagesRepository(
        messages: [
          TradeMessage(
            id: 'm1',
            proposalId: 'p1',
            senderId: 'u2',
            senderName: 'Bob',
            body: 'Hi',
            createdAt: DateTime.utc(2026, 7, 15),
          ),
        ],
        unread: 1,
      );
      container = ProviderContainer(
        overrides: [
          messagesRepositoryProvider.overrideWithValue(fakeRepo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
    });

    test('build loads the thread and marks it read', () async {
      final result = await container.read(messagesControllerProvider('p1').future);
      expect(result, hasLength(1));
      // markRead is fired-and-forgotten inside _load; give it a tick to run.
      await Future<void>.delayed(Duration.zero);
      expect(fakeRepo.markReadCalls, 1);
    });

    test('send posts the body and reloads the thread', () async {
      await container.read(messagesControllerProvider('p1').future);
      await container.read(messagesControllerProvider('p1').notifier).send('New message');
      expect(fakeRepo.lastSentBody, 'New message');
      final result = container.read(messagesControllerProvider('p1')).value;
      expect(result, hasLength(2));
    });
  });
}
