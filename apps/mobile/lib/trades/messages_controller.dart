import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'messages_providers.dart';
import 'messages_repository.dart';
import 'models/trade_message.dart';

class MessagesController extends FamilyAsyncNotifier<List<TradeMessage>, String> {
  MessagesRepository get _repo => ref.read(messagesRepositoryProvider);

  @override
  Future<List<TradeMessage>> build(String arg) => _load(arg);

  Future<List<TradeMessage>> _load(String proposalId) async {
    final token = await requireAccessToken(ref);
    final messages = await _repo.list(proposalId, token);
    // Fire-and-forget, mirrors web TradeThread.tsx: opening the thread marks
    // the other party's unread messages read; a failure here must not block
    // the thread from rendering.
    unawaited(_repo.markRead(proposalId, token).catchError((_) => 0));
    return messages;
  }

  Future<void> send(String body) async {
    await future;
    final token = await requireAccessToken(ref);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await _repo.send(arg, body, token);
      return _load(arg);
    });
  }
}

final messagesControllerProvider =
    AsyncNotifierProvider.family<MessagesController, List<TradeMessage>, String>(
      MessagesController.new,
    );
