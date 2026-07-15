import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/trades/rest_messages_repository.dart';

void main() {
  group('RestMessagesRepository', () {
    test('list GETs the thread and decodes messages', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/trades/p1/messages');
        return http.Response(
          jsonEncode([
            {
              'id': 'm1',
              'proposalId': 'p1',
              'senderId': 'u1',
              'sender': {'id': 'u1', 'displayName': 'Alice'},
              'body': 'Hi',
              'createdAt': '2026-07-15T10:00:00.000Z',
              'readAt': null,
            },
          ]),
          200,
        );
      });
      final repo = RestMessagesRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final result = await repo.list('p1', 'tok1');

      expect(result, hasLength(1));
      expect(result.first.senderName, 'Alice');
    });

    test('send POSTs the body', () async {
      late Map<String, dynamic> sentBody;
      final mock = MockClient((request) async {
        sentBody = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({
            'id': 'm2',
            'proposalId': 'p1',
            'senderId': 'u1',
            'sender': {'id': 'u1', 'displayName': 'Alice'},
            'body': 'Sounds good',
            'createdAt': '2026-07-15T10:05:00.000Z',
            'readAt': null,
          }),
          200,
        );
      });
      final repo = RestMessagesRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final message = await repo.send('p1', 'Sounds good', 'tok1');

      expect(sentBody, {'body': 'Sounds good'});
      expect(message.body, 'Sounds good');
    });

    test('markRead POSTs to /read and decodes count', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/trades/p1/read');
        return http.Response(jsonEncode({'count': 2}), 200);
      });
      final repo = RestMessagesRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final count = await repo.markRead('p1', 'tok1');

      expect(count, 2);
    });

    test('unreadCount GETs /mobile/trades/unread-count', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/trades/unread-count');
        return http.Response(jsonEncode({'count': 5}), 200);
      });
      final repo = RestMessagesRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      expect(await repo.unreadCount('tok1'), 5);
    });
  });
}
