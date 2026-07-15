import '../core/api_client.dart';
import 'models/proposal.dart';
import 'trades_repository.dart';

class RestTradesRepository implements TradesRepository {
  RestTradesRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<Proposal>> mine(String accessToken) async {
    final json = await _client.getList('/mobile/trades', accessToken: accessToken);
    return json.map((p) => Proposal.fromJson(p as Map<String, dynamic>)).toList();
  }

  @override
  Future<Proposal> byId(String id, String accessToken) async {
    final json = await _client.get('/mobile/trades/$id', accessToken: accessToken);
    return Proposal.fromJson(json);
  }

  @override
  Future<Proposal> propose(
    String listingId,
    List<String> offeredListingIds,
    String accessToken,
  ) async {
    final json = await _client.post(
      '/mobile/trades',
      {'listingId': listingId, 'offeredListingIds': offeredListingIds},
      accessToken: accessToken,
    );
    return Proposal.fromJson(json);
  }

  @override
  Future<Proposal> accept(String id, String accessToken) async {
    final json = await _client.post('/mobile/trades/$id/accept', const {}, accessToken: accessToken);
    return Proposal.fromJson(json);
  }

  @override
  Future<Proposal> decline(String id, String accessToken) async {
    final json = await _client.post(
      '/mobile/trades/$id/decline',
      const {},
      accessToken: accessToken,
    );
    return Proposal.fromJson(json);
  }

  @override
  Future<Proposal> counter(
    String id,
    List<String> offeredListingIds,
    String accessToken,
  ) async {
    final json = await _client.post(
      '/mobile/trades/$id/counter',
      {'offeredListingIds': offeredListingIds},
      accessToken: accessToken,
    );
    return Proposal.fromJson(json);
  }

  @override
  Future<Proposal> cancel(String id, String accessToken) async {
    final json = await _client.post('/mobile/trades/$id/cancel', const {}, accessToken: accessToken);
    return Proposal.fromJson(json);
  }

  @override
  Future<Proposal> confirm(String id, String accessToken) async {
    final json = await _client.post(
      '/mobile/trades/$id/confirm',
      const {},
      accessToken: accessToken,
    );
    return Proposal.fromJson(json);
  }

  @override
  Future<void> rate(String id, int stars, String? review, String accessToken) async {
    await _client.post(
      '/mobile/trades/$id/rate',
      {'stars': stars, if (review != null) 'review': review},
      accessToken: accessToken,
    );
  }
}
