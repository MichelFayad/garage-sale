import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/auth/rest_auth_repository.dart';

void main() {
  group('RestAuthRepository', () {
    test('login parses user and tokens from the REST response', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/auth/login');
        return http.Response(
          jsonEncode({
            'user': {
              'id': 'u1',
              'email': 'a@b.com',
              'displayName': 'Alice',
              'emailVerified': true,
            },
            'tokens': {'accessToken': 'access1', 'refreshToken': 'refresh1'},
          }),
          200,
        );
      });
      final repo = RestAuthRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final result = await repo.login(
        email: 'a@b.com',
        password: 'password123',
      );

      expect(result.user.id, 'u1');
      expect(result.user.email, 'a@b.com');
      expect(result.tokens.accessToken, 'access1');
      expect(result.tokens.refreshToken, 'refresh1');
    });

    test(
      'register posts email, password, and displayName to the register endpoint',
      () async {
        late http.Request captured;
        final mock = MockClient((request) async {
          captured = request;
          return http.Response(
            jsonEncode({
              'user': {
                'id': 'u1',
                'email': 'a@b.com',
                'displayName': 'Alice',
                'emailVerified': false,
              },
              'verificationRequired': true,
            }),
            200,
          );
        });
        final repo = RestAuthRepository(
          ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
        );

        await repo.register(
          email: 'a@b.com',
          password: 'password123',
          displayName: 'Alice',
        );

        expect(captured.url.path, '/api/mobile/auth/register');
        expect(jsonDecode(captured.body), {
          'email': 'a@b.com',
          'password': 'password123',
          'displayName': 'Alice',
        });
      },
    );

    test('me sends the bearer token and parses the trader session', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({
            'kind': 'trader',
            'id': 'u1',
            'email': 'a@b.com',
            'displayName': 'Alice',
            'emailVerified': true,
          }),
          200,
        );
      });
      final repo = RestAuthRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final user = await repo.me('access1');

      expect(user.id, 'u1');
      expect(captured.headers['Authorization'], 'Bearer access1');
    });

    test('refresh parses a fresh token pair', () async {
      final mock = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'tokens': {'accessToken': 'access2', 'refreshToken': 'refresh2'},
          }),
          200,
        );
      });
      final repo = RestAuthRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final tokens = await repo.refresh('refresh1');

      expect(tokens.accessToken, 'access2');
      expect(tokens.refreshToken, 'refresh2');
    });
  });
}
