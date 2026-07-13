import '../core/key_value_store.dart';
import '../core/secure_key_value_store.dart';

class TokenPair {
  const TokenPair({required this.accessToken, required this.refreshToken});
  final String accessToken;
  final String refreshToken;
}

class TokenStorage {
  TokenStorage([KeyValueStore? store]) : _store = store ?? const SecureKeyValueStore();

  static const accessKey = 'gs_access_token';
  static const refreshKey = 'gs_refresh_token';

  final KeyValueStore _store;

  Future<void> saveTokens(TokenPair tokens) async {
    await Future.wait([
      _store.write(accessKey, tokens.accessToken),
      _store.write(refreshKey, tokens.refreshToken),
    ]);
  }

  Future<String?> getAccessToken() => _store.read(accessKey);
  Future<String?> getRefreshToken() => _store.read(refreshKey);

  Future<void> clearTokens() async {
    await Future.wait([_store.delete(accessKey), _store.delete(refreshKey)]);
  }
}
