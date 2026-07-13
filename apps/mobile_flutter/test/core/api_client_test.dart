import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/core/api_exception.dart';

void main() {
  group('ApiClient', () {
    test('post sends bearer header and decodes JSON body', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final client = ApiClient(httpClient: mock, baseUrl: 'http://test.local/api');

      final result = await client.post(
        '/mobile/auth/login',
        {'email': 'a@b.com'},
        accessToken: 'tok123',
      );

      expect(result, {'ok': true});
      expect(captured.url.toString(), 'http://test.local/api/mobile/auth/login');
      expect(captured.headers['Authorization'], 'Bearer tok123');
      expect(jsonDecode(captured.body), {'email': 'a@b.com'});
    });

    test('throws ApiException with server error message on non-2xx', () async {
      final mock = MockClient((request) async {
        return http.Response(jsonEncode({'error': 'Invalid email or password'}), 401);
      });
      final client = ApiClient(httpClient: mock, baseUrl: 'http://test.local/api');

      expect(
        () => client.post('/mobile/auth/login', {'email': 'a@b.com'}),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 401)
              .having((e) => e.message, 'message', 'Invalid email or password'),
        ),
      );
    });

    test('get omits Authorization header when no token given', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final client = ApiClient(httpClient: mock, baseUrl: 'http://test.local/api');

      await client.get('/mobile/auth/me');

      expect(captured.headers.containsKey('Authorization'), isFalse);
    });
  });
}
