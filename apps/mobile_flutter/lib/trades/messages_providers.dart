import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'messages_repository.dart';
import 'rest_messages_repository.dart';

final messagesRepositoryProvider = Provider<MessagesRepository>(
  (ref) => RestMessagesRepository(ref.watch(apiClientProvider)),
);
