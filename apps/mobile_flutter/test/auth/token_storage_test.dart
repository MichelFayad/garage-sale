import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';
import '../support/in_memory_key_value_store.dart';

void main() {
  group('TokenStorage', () {
    test('saves and reads back both tokens', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(
        const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'),
      );

      expect(await storage.getAccessToken(), 'access1');
      expect(await storage.getRefreshToken(), 'refresh1');
    });

    test('returns null for both tokens before anything is saved', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());

      expect(await storage.getAccessToken(), isNull);
      expect(await storage.getRefreshToken(), isNull);
    });

    test('clearTokens removes both tokens', () async {
      final storage = TokenStorage(InMemoryKeyValueStore());
      await storage.saveTokens(
        const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'),
      );

      await storage.clearTokens();

      expect(await storage.getAccessToken(), isNull);
      expect(await storage.getRefreshToken(), isNull);
    });
  });
}
