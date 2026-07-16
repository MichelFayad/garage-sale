import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/push/rest_push_repository.dart';

void main() {
  group('RestPushRepository', () {
    test('register posts the token and platform', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestPushRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.register('token123', 'android', 'tok');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/push/register');
      expect(captured.headers['Authorization'], 'Bearer tok');
      expect(jsonDecode(captured.body), {'token': 'token123', 'platform': 'android'});
    });

    test('register omits platform when null', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestPushRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.register('token123', null, 'tok');

      expect(jsonDecode(captured.body), {'token': 'token123'});
    });

    test('unregister posts the token', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestPushRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.unregister('token123', 'tok');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/push/unregister');
      expect(jsonDecode(captured.body), {'token': 'token123'});
    });
  });
}
