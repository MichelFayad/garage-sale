import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/providers.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import 'package:garage_sale_mobile/billing/billing_controller.dart';
import 'package:garage_sale_mobile/billing/providers.dart';
import '../support/fake_billing_repository.dart';
import '../support/in_memory_key_value_store.dart';

Future<TokenStorage> _seededTokenStorage() async {
  final storage = TokenStorage(InMemoryKeyValueStore());
  await storage.saveTokens(
    const TokenPair(accessToken: 'tok1', refreshToken: 'ref1'),
  );
  return storage;
}

void main() {
  group('BillingController', () {
    test('build loads the initial billing status', () async {
      final storage = await _seededTokenStorage();
      final container = ProviderContainer(
        overrides: [
          billingRepositoryProvider.overrideWithValue(FakeBillingRepository()),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);

      final status = await container.read(billingControllerProvider.future);

      expect(status.hasCard, isFalse);
      expect(status.feeCents, 199);
    });

    test('refresh reloads the status', () async {
      final storage = await _seededTokenStorage();
      final repo = FakeBillingRepository();
      final container = ProviderContainer(
        overrides: [
          billingRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
      await container.read(billingControllerProvider.future);
      repo.markCardOnFile();

      await container.read(billingControllerProvider.notifier).refresh();

      final status = container.read(billingControllerProvider).value!;
      expect(status.hasCard, isTrue);
    });

    test('removeCard clears the card and reloads', () async {
      final storage = await _seededTokenStorage();
      final repo = FakeBillingRepository()..markCardOnFile();
      final container = ProviderContainer(
        overrides: [
          billingRepositoryProvider.overrideWithValue(repo),
          tokenStorageProvider.overrideWithValue(storage),
        ],
      );
      addTearDown(container.dispose);
      await container.read(billingControllerProvider.future);

      await container.read(billingControllerProvider.notifier).removeCard();

      expect(repo.removeCardCalls, 1);
      final status = container.read(billingControllerProvider).value!;
      expect(status.hasCard, isFalse);
    });
  });
}
