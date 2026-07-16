import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/listings/rest_watchlist_repository.dart';

void main() {
  group('RestWatchlistRepository', () {
    test('list decodes watchlist entries with nested listings', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode([
            {
              'id': 'w1',
              'listing': {
                'id': 'l1',
                'ownerId': 'u2',
                'type': 'HAVE',
                'title': 'Bike',
                'description': 'Red bike',
                'condition': 'GOOD',
                'categoryId': 'c1',
                'status': 'ACTIVE',
                'photos': <Map<String, dynamic>>[],
              },
            },
          ]),
          200,
        );
      });
      final repo = RestWatchlistRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final entries = await repo.list('tok123');

      expect(captured.url.path, '/api/mobile/watchlist');
      expect(captured.headers['Authorization'], 'Bearer tok123');
      expect(entries, hasLength(1));
      expect(entries.first.listing.id, 'l1');
    });

    test('add posts the listingId', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestWatchlistRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.add('l1', 'tok123');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/watchlist');
      expect(jsonDecode(captured.body), {'listingId': 'l1'});
    });

    test('remove sends a DELETE to the listing-scoped endpoint', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestWatchlistRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.remove('l1', 'tok123');

      expect(captured.method, 'DELETE');
      expect(captured.url.path, '/api/mobile/watchlist/l1');
    });
  });
}
