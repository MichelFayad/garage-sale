import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/trades/models/trade_message.dart';

void main() {
  test('TradeMessage.fromJson decodes sender name and nullable readAt', () {
    final unread = TradeMessage.fromJson({
      'id': 'm1',
      'proposalId': 'p1',
      'senderId': 'u1',
      'sender': {'id': 'u1', 'displayName': 'Alice'},
      'body': 'Hi there',
      'createdAt': '2026-07-15T10:00:00.000Z',
      'readAt': null,
    });

    expect(unread.senderName, 'Alice');
    expect(unread.body, 'Hi there');
    expect(unread.readAt, isNull);

    final read = TradeMessage.fromJson({
      'id': 'm2',
      'proposalId': 'p1',
      'senderId': 'u2',
      'sender': {'id': 'u2', 'displayName': 'Bob'},
      'body': 'Sounds good',
      'createdAt': '2026-07-15T10:05:00.000Z',
      'readAt': '2026-07-15T10:10:00.000Z',
    });

    expect(read.readAt, DateTime.parse('2026-07-15T10:10:00.000Z'));
  });
}
