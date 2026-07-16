import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/trades/rest_blocks_repository.dart';

void main() {
  group('RestBlocksRepository', () {
    test('list GETs /mobile/blocks and decodes entries', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/blocks');
        return http.Response(
          jsonEncode([
            {
              'id': 'b1',
              'reason': null,
              'createdAt': '2026-07-15T10:00:00.000Z',
              'blocked': {'id': 'u3', 'displayName': 'Carol'},
            },
          ]),
          200,
        );
      });
      final repo = RestBlocksRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final result = await repo.list('tok1');

      expect(result, hasLength(1));
      expect(result.first.blockedUserName, 'Carol');
    });

    test('status GETs /mobile/blocks/:userId', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/blocks/u3');
        return http.Response(jsonEncode({'blocked': true}), 200);
      });
      final repo = RestBlocksRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      expect(await repo.status('u3', 'tok1'), isTrue);
    });

    test('unblock DELETEs /mobile/blocks/:userId', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestBlocksRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.unblock('u3', 'tok1');

      expect(captured.method, 'DELETE');
      expect(captured.url.path, '/api/mobile/blocks/u3');
    });
  });
}
