import '../core/api_client.dart';
import 'auth_repository.dart';
import 'session_user.dart';
import 'token_storage.dart';

class RestAuthRepository implements AuthRepository {
  RestAuthRepository(this._client);
  final ApiClient _client;

  @override
  Future<void> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    await _client.post('/mobile/auth/register', {
      'email': email,
      'password': password,
      'displayName': displayName,
    });
  }

  @override
  Future<AuthResult> login({
    required String email,
    required String password,
  }) async {
    final json = await _client.post('/mobile/auth/login', {
      'email': email,
      'password': password,
    });
    return AuthResult(
      user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
      tokens: _parseTokens(json['tokens'] as Map<String, dynamic>),
    );
  }

  @override
  Future<TokenPair> refresh(String refreshToken) async {
    final json = await _client.post('/mobile/auth/refresh', {
      'refreshToken': refreshToken,
    });
    return _parseTokens(json['tokens'] as Map<String, dynamic>);
  }

  @override
  Future<SessionUser> me(String accessToken) async {
    final json = await _client.get('/mobile/auth/me', accessToken: accessToken);
    return SessionUser.fromJson(json);
  }

  TokenPair _parseTokens(Map<String, dynamic> json) {
    return TokenPair(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
    );
  }
}
