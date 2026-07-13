import 'session_user.dart';
import 'token_storage.dart';

class AuthResult {
  const AuthResult({required this.user, required this.tokens});
  final SessionUser user;
  final TokenPair tokens;
}

abstract class AuthRepository {
  Future<void> register({
    required String email,
    required String password,
    required String displayName,
  });

  Future<AuthResult> login({required String email, required String password});

  Future<TokenPair> refresh(String refreshToken);

  Future<SessionUser> me(String accessToken);
}
