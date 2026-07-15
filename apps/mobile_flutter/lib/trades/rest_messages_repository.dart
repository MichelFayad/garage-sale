import '../core/api_client.dart';
import 'messages_repository.dart';
import 'models/trade_message.dart';

class RestMessagesRepository implements MessagesRepository {
  RestMessagesRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<TradeMessage>> list(String proposalId, String accessToken) async {
    final json = await _client.getList(
      '/mobile/trades/$proposalId/messages',
      accessToken: accessToken,
    );
    return json.map((m) => TradeMessage.fromJson(m as Map<String, dynamic>)).toList();
  }

  @override
  Future<TradeMessage> send(String proposalId, String body, String accessToken) async {
    final json = await _client.post(
      '/mobile/trades/$proposalId/messages',
      {'body': body},
      accessToken: accessToken,
    );
    return TradeMessage.fromJson(json);
  }

  @override
  Future<int> markRead(String proposalId, String accessToken) async {
    final json = await _client.post(
      '/mobile/trades/$proposalId/read',
      const {},
      accessToken: accessToken,
    );
    return json['count'] as int;
  }

  @override
  Future<int> unreadCount(String accessToken) async {
    final json = await _client.get('/mobile/trades/unread-count', accessToken: accessToken);
    return json['count'] as int;
  }
}
