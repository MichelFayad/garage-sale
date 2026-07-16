import 'package:garage_sale_mobile/trades/messages_repository.dart';
import 'package:garage_sale_mobile/trades/models/trade_message.dart';

class FakeMessagesRepository implements MessagesRepository {
  FakeMessagesRepository({
    List<TradeMessage> messages = const [],
    this._unread = 0,
    this.sendSenderId = 'me',
    this.sendSenderName = 'Me',
  }) : _messages = List.of(messages);

  final String sendSenderId;
  final String sendSenderName;
  final List<TradeMessage> _messages;
  int _unread;
  int markReadCalls = 0;
  String? lastSentBody;

  @override
  Future<List<TradeMessage>> list(String proposalId, String accessToken) async {
    return List.of(_messages);
  }

  @override
  Future<TradeMessage> send(String proposalId, String body, String accessToken) async {
    lastSentBody = body;
    final message = TradeMessage(
      id: 'new-${_messages.length}',
      proposalId: proposalId,
      senderId: sendSenderId,
      senderName: sendSenderName,
      body: body,
      createdAt: DateTime.utc(2026, 7, 15),
    );
    _messages.add(message);
    return message;
  }

  @override
  Future<int> markRead(String proposalId, String accessToken) async {
    markReadCalls++;
    final count = _unread;
    _unread = 0;
    return count;
  }

  @override
  Future<int> unreadCount(String accessToken) async => _unread;
}
