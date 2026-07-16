import 'models/trade_message.dart';

abstract class MessagesRepository {
  Future<List<TradeMessage>> list(String proposalId, String accessToken);
  Future<TradeMessage> send(String proposalId, String body, String accessToken);
  Future<int> markRead(String proposalId, String accessToken);
  Future<int> unreadCount(String accessToken);
}
