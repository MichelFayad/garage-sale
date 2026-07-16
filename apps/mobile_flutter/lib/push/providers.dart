import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'push_repository.dart';
import 'register_push.dart';
import 'rest_push_repository.dart';

final pushRepositoryProvider = Provider<PushRepository>(
  (ref) => RestPushRepository(ref.watch(apiClientProvider)),
);

/// Injectable so tests can avoid the real Firebase plugin. Defaults to the
/// real implementation.
final devicePushTokenProvider = Provider<Future<String?> Function()>(
  (ref) => registerForPushNotifications,
);
