import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'auth_repository.dart';
import 'providers.dart';
import 'session_user.dart';
import 'token_storage.dart';

class AuthController extends AsyncNotifier<SessionUser?> {
  AuthRepository get _repo => ref.read(authRepositoryProvider);
  TokenStorage get _storage => ref.read(tokenStorageProvider);

  @override
  Future<SessionUser?> build() => _hydrate();

  Future<SessionUser?> _hydrate() async {
    final accessToken = await _storage.getAccessToken();
    if (accessToken != null) {
      try {
        return await _repo.me(accessToken);
      } catch (_) {
        // access token missing/expired — fall through to a refresh attempt.
      }
    }
    final refreshToken = await _storage.getRefreshToken();
    if (refreshToken == null) return null;
    try {
      final tokens = await _repo.refresh(refreshToken);
      await _storage.saveTokens(tokens);
      return await _repo.me(tokens.accessToken);
    } catch (_) {
      await _storage.clearTokens();
      return null;
    }
  }

  Future<void> login({required String email, required String password}) async {
    await future;
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final result = await _repo.login(email: email, password: password);
      await _storage.saveTokens(result.tokens);
      return result.user;
    });
  }

  Future<void> register({
    required String email,
    required String password,
    required String displayName,
  }) {
    // No tokens returned — the trader must verify their email before logging in.
    return _repo.register(
      email: email,
      password: password,
      displayName: displayName,
    );
  }

  Future<void> logout() async {
    await future;
    await _storage.clearTokens();
    state = const AsyncData(null);
  }
}

final authControllerProvider =
    AsyncNotifierProvider<AuthController, SessionUser?>(AuthController.new);
