import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/rest_browse_repository.dart';

void main() {
  group('RestBrowseRepository', () {
    test('search sends the bearer token and no query params when filters are empty', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode([]), 200);
      });
      final repo = RestBrowseRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.search('tok123');

      expect(captured.url.path, '/api/mobile/browse');
      expect(captured.url.queryParameters, isEmpty);
      expect(captured.headers['Authorization'], 'Bearer tok123');
    });

    test('search encodes keyword, category, condition, and type filters', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(jsonEncode([]), 200);
      });
      final repo = RestBrowseRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.search(
        'tok123',
        keyword: 'bike',
        categoryId: 'c1',
        condition: Condition.good,
        type: ListingType.have,
      );

      expect(captured.url.queryParameters, {
        'keyword': 'bike',
        'categoryId': 'c1',
        'condition': 'GOOD',
        'type': 'HAVE',
      });
    });

    test('search decodes the returned listings', () async {
      final mock = MockClient((request) async {
        return http.Response(
          jsonEncode([
            {
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
          ]),
          200,
        );
      });
      final repo = RestBrowseRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final listings = await repo.search('tok123');

      expect(listings, hasLength(1));
      expect(listings.first.id, 'l1');
    });
  });
}
