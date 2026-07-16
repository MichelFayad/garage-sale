import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/push/providers.dart';
import 'package:garage_sale_mobile/push/push_registration.dart';
import '../support/fake_push_repository.dart';
import '../support/in_memory_key_value_store.dart';

Future<TokenStorage> _seededTokenStorage() async {
  final storage = TokenStorage(InMemoryKeyValueStore());
  await storage.saveTokens(
    const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
  );
  return storage;
}

void main() {
  group('PushRegistrationController', () {
    test('registerDevice registers the device token', () async {
      final storage = await _seededTokenStorage();
      final repo = FakePushRepository();
      final container = ProviderContainer(
        overrides: [
          pushRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
          devicePushTokenProvider.overrideWithValue(() async => 'device-token-1'),
        ],
      );
      addTearDown(container.dispose);

      await container.read(pushRegistrationControllerProvider.notifier).registerDevice();

      expect(repo.registerCalls, 1);
      expect(repo.lastRegisteredToken, 'device-token-1');
    });

    test('registerDevice does nothing when no device token is available', () async {
      final storage = await _seededTokenStorage();
      final repo = FakePushRepository();
      final container = ProviderContainer(
        overrides: [
          pushRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
          devicePushTokenProvider.overrideWithValue(() async => null),
        ],
      );
      addTearDown(container.dispose);

      await container.read(pushRegistrationControllerProvider.notifier).registerDevice();

      expect(repo.registerCalls, 0);
    });

    test('unregisterDevice does nothing when no device was registered', () async {
      final storage = await _seededTokenStorage();
      final repo = FakePushRepository();
      final container = ProviderContainer(
        overrides: [
          pushRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);

      await container.read(pushRegistrationControllerProvider.notifier).unregisterDevice();

      expect(repo.unregisterCalls, 0);
    });

    test('unregisterDevice unregisters the previously-registered token', () async {
      final storage = await _seededTokenStorage();
      final repo = FakePushRepository();
      final container = ProviderContainer(
        overrides: [
          pushRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
          devicePushTokenProvider.overrideWithValue(() async => 'device-token-1'),
        ],
      );
      addTearDown(container.dispose);
      final notifier = container.read(pushRegistrationControllerProvider.notifier);
      await notifier.registerDevice();

      await notifier.unregisterDevice();

      expect(repo.unregisterCalls, 1);
      expect(repo.lastUnregisteredToken, 'device-token-1');
    });
  });
}
