import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/billing/rest_billing_repository.dart';

void main() {
  group('RestBillingRepository', () {
    test('status decodes the billing status', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({'paymentValid': true, 'hasCard': true, 'feeCents': 199}),
          200,
        );
      });
      final repo = RestBillingRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final status = await repo.status('tok123');

      expect(captured.method, 'GET');
      expect(captured.url.path, '/api/mobile/billing/status');
      expect(captured.headers['Authorization'], 'Bearer tok123');
      expect(status.paymentValid, isTrue);
      expect(status.feeCents, 199);
    });

    test('createSetupIntent posts and returns the client secret', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode({'clientSecret': 'seti_123_secret'}), 200);
      });
      final repo = RestBillingRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final clientSecret = await repo.createSetupIntent('tok123');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/billing/setup-intent');
      expect(clientSecret, 'seti_123_secret');
    });

    test('removeCard posts to the remove-card endpoint', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestBillingRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.removeCard('tok123');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/billing/remove-card');
    });

    test('publish posts to the listing-scoped publish endpoint', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({'listingId': 'l1', 'feeChargeId': 'fee1', 'status': 'PENDING'}),
          200,
        );
      });
      final repo = RestBillingRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final result = await repo.publish('l1', 'tok123');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/listings/l1/publish');
      expect(result.feeChargeId, 'fee1');
    });
  });
}
