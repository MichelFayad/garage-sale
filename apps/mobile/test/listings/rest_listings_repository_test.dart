import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/rest_listings_repository.dart';

Map<String, dynamic> _listingJson({String id = 'l1', String status = 'DRAFT'}) => {
      'id': id,
      'ownerId': 'u1',
      'type': 'HAVE',
      'title': 'Bike',
      'description': 'Red bike',
      'condition': 'GOOD',
      'categoryId': 'c1',
      'status': status,
      'photos': <Map<String, dynamic>>[],
    };

void main() {
  group('RestListingsRepository', () {
    test('categories decodes a list of categories', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/listings/categories');
        return http.Response(
          jsonEncode([
            {'id': 'c1', 'name': 'Bikes', 'sortOrder': 0},
          ]),
          200,
        );
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final categories = await repo.categories();

      expect(categories, hasLength(1));
      expect(categories.first.name, 'Bikes');
    });

    test('mine sends the bearer token and decodes a list of listings', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode([_listingJson()]), 200);
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final listings = await repo.mine('tok123');

      expect(captured.url.path, '/api/mobile/listings/mine');
      expect(captured.headers['Authorization'], 'Bearer tok123');
      expect(listings, hasLength(1));
    });

    test('byId decodes a single listing', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/listings/l1');
        return http.Response(jsonEncode(_listingJson()), 200);
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final listing = await repo.byId('l1', 'tok123');

      expect(listing.id, 'l1');
    });

    test('create posts the serialized input and decodes the response', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode(_listingJson()), 200);
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );
      const input = ListingInput(
        type: ListingType.have,
        title: 'Bike',
        description: 'Red bike',
        condition: Condition.good,
        categoryId: 'c1',
      );

      await repo.create(input, 'tok123');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/listings');
      expect(jsonDecode(captured.body), input.toJson());
    });

    test('update patches the listing by id', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode(_listingJson()), 200);
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );
      const input = ListingInput(
        type: ListingType.have,
        title: 'Bike',
        description: 'Red bike',
        condition: Condition.good,
        categoryId: 'c1',
      );

      await repo.update('l1', input, 'tok123');

      expect(captured.method, 'PATCH');
      expect(captured.url.path, '/api/mobile/listings/l1');
    });

    test('markTraded posts to the mark-traded endpoint', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode(_listingJson(status: 'COMPLETED')), 200);
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      final listing = await repo.markTraded('l1', 'tok123');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/mobile/listings/l1/mark-traded');
      expect(listing.status, ListingStatus.completed);
    });

    test('remove sends a DELETE to the listing endpoint', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestListingsRepository(
        ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'),
      );

      await repo.remove('l1', 'tok123');

      expect(captured.method, 'DELETE');
      expect(captured.url.path, '/api/mobile/listings/l1');
    });
  });
}
