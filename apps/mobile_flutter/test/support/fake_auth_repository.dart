import 'package:garage_sale_mobile/auth/auth_repository.dart';
import 'package:garage_sale_mobile/auth/session_user.dart';
import 'package:garage_sale_mobile/auth/token_storage.dart';

/// Test double. `password123` is the only password `login` accepts.
/// Access token `access1`/`access2` are the only ones `me` accepts.
class FakeAuthRepository implements AuthRepository {
  bool registerCalled = false;

  @override
  Future<void> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    registerCalled = true;
  }

  @override
  Future<AuthResult> login({
    required String email,
    required String password,
  }) async {
    if (password != 'password123') {
      throw Exception('Invalid email or password');
    }
    return AuthResult(
      user: SessionUser(
        id: 'u1',
        email: email,
        displayName: 'Test User',
        emailVerified: true,
      ),
      tokens: const TokenPair(accessToken: 'access1', refreshToken: 'refresh1'),
    );
  }

  @override
  Future<TokenPair> refresh(String refreshToken) async {
    if (refreshToken != 'refresh1') {
      throw Exception('Invalid refresh token');
    }
    return const TokenPair(accessToken: 'access2', refreshToken: 'refresh2');
  }

  @override
  Future<SessionUser> me(String accessToken) async {
    if (accessToken == 'access1' || accessToken == 'access2') {
      return const SessionUser(
        id: 'u1',
        email: 'a@b.com',
        displayName: 'Test User',
        emailVerified: true,
      );
    }
    throw Exception('Unauthenticated');
  }
}
