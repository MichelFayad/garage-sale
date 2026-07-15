import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:garage_sale_mobile/core/api_client.dart';
import 'package:garage_sale_mobile/trades/rest_trades_repository.dart';

Map<String, dynamic> _proposalJson({String id = 'p1', String status = 'PROPOSED'}) => {
  'id': id,
  'listingId': 'l1',
  'listing': {
    'id': 'l1',
    'ownerId': 'owner1',
    'type': 'HAVE',
    'title': 'Bike',
    'description': 'Road bike',
    'condition': 'GOOD',
    'categoryId': 'cat1',
    'status': 'ACTIVE',
    'photos': [],
  },
  'proposerId': 'u1',
  'proposer': {'id': 'u1', 'displayName': 'Alice'},
  'ownerId': 'u2',
  'owner': {'id': 'u2', 'displayName': 'Bob'},
  'status': status,
  'parentProposalId': null,
  'acceptedAt': null,
  'completedAt': null,
  'cancelledAt': null,
  'createdAt': '2026-07-15T10:00:00.000Z',
  'items': [],
  'confirmations': [],
  'ratings': [],
};

void main() {
  group('RestTradesRepository', () {
    test('mine GETs /mobile/trades and decodes the list', () async {
      final mock = MockClient((request) async {
        expect(request.method, 'GET');
        expect(request.url.path, '/api/mobile/trades');
        return http.Response(jsonEncode([_proposalJson()]), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      final result = await repo.mine('tok1');

      expect(result, hasLength(1));
      expect(result.first.id, 'p1');
    });

    test('propose POSTs listingId and offeredListingIds', () async {
      late Map<String, dynamic> sentBody;
      final mock = MockClient((request) async {
        sentBody = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(jsonEncode(_proposalJson()), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      await repo.propose('l1', ['l2', 'l3'], 'tok1');

      expect(sentBody, {'listingId': 'l1', 'offeredListingIds': ['l2', 'l3']});
    });

    test('accept POSTs to /accept with an empty body', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode(_proposalJson(status: 'ACCEPTED')), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      final result = await repo.accept('p1', 'tok1');

      expect(captured.url.path, '/api/mobile/trades/p1/accept');
      expect(captured.body, '{}');
      expect(result.status.name, 'accepted');
    });

    test('rate POSTs stars and omits review when null', () async {
      late Map<String, dynamic> sentBody;
      final mock = MockClient((request) async {
        sentBody = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(jsonEncode({'ok': true}), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      await repo.rate('p1', 5, null, 'tok1');

      expect(sentBody, {'stars': 5});
    });

    test('byId GETs /mobile/trades/:id', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/mobile/trades/p1');
        return http.Response(jsonEncode(_proposalJson()), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      final result = await repo.byId('p1', 'tok1');

      expect(result.id, 'p1');
    });

    test('decline POSTs to /decline with an empty body', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode(_proposalJson(status: 'DECLINED')), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      final result = await repo.decline('p1', 'tok1');

      expect(captured.url.path, '/api/mobile/trades/p1/decline');
      expect(captured.body, '{}');
      expect(result.status.name, 'declined');
    });

    test('counter POSTs offeredListingIds to /counter', () async {
      late Map<String, dynamic> sentBody;
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        sentBody = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(jsonEncode(_proposalJson(id: 'p2')), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      final result = await repo.counter('p1', ['l4', 'l5'], 'tok1');

      expect(captured.url.path, '/api/mobile/trades/p1/counter');
      expect(sentBody, {'offeredListingIds': ['l4', 'l5']});
      expect(result.id, 'p2');
    });

    test('cancel POSTs to /cancel with an empty body', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode(_proposalJson(status: 'CANCELLED')), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      final result = await repo.cancel('p1', 'tok1');

      expect(captured.url.path, '/api/mobile/trades/p1/cancel');
      expect(captured.body, '{}');
      expect(result.status.name, 'cancelled');
    });

    test('confirm POSTs to /confirm with an empty body', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request as http.Request;
        return http.Response(jsonEncode(_proposalJson(status: 'COMPLETED')), 200);
      });
      final repo = RestTradesRepository(ApiClient(httpClient: mock, baseUrl: 'http://test.local/api'));

      final result = await repo.confirm('p1', 'tok1');

      expect(captured.url.path, '/api/mobile/trades/p1/confirm');
      expect(captured.body, '{}');
      expect(result.status.name, 'completed');
    });
  });
}
