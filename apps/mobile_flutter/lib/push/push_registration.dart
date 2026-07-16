import 'dart:io' show Platform;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'providers.dart';

String? _platformName() {
  if (Platform.isAndroid) return 'android';
  if (Platform.isIOS) return 'ios';
  return null;
}

class PushRegistrationController extends Notifier<Object?> {
  String? _lastRegisteredToken;

  @override
  Object? build() => null;

  /// Requests a device push token and registers it with the backend. Called
  /// reactively on successful auth (see the `ref.listen` wiring in
  /// main.dart) — never throws, never blocks the caller.
  Future<void> registerDevice() async {
    try {
      final getToken = ref.read(devicePushTokenProvider);
      final token = await getToken();
      if (token == null) return;
      final accessToken = await requireAccessToken(ref);
      await ref.read(pushRepositoryProvider).register(token, _platformName(), accessToken);
      _lastRegisteredToken = token;
    } catch (_) {
      // Push registration is non-critical — never block/break auth flows.
    }
  }

  /// Unregisters this device's last-registered push token, if any. Must be
  /// called with a still-valid access token — see AuthController.logout(),
  /// which calls this before clearing stored tokens.
  Future<void> unregisterDevice() async {
    final token = _lastRegisteredToken;
    if (token == null) return;
    try {
      final accessToken = await requireAccessToken(ref);
      await ref.read(pushRepositoryProvider).unregister(token, accessToken);
    } catch (_) {
      // Non-critical.
    } finally {
      _lastRegisteredToken = null;
    }
  }
}

final pushRegistrationControllerProvider =
    NotifierProvider<PushRegistrationController, Object?>(PushRegistrationController.new);
