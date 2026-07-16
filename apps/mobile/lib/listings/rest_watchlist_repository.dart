import '../core/api_client.dart';
import 'models/watchlist_entry.dart';
import 'watchlist_repository.dart';

class RestWatchlistRepository implements WatchlistRepository {
  RestWatchlistRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<WatchlistEntry>> list(String accessToken) async {
    final json = await _client.getList('/mobile/watchlist', accessToken: accessToken);
    return json.map((e) => WatchlistEntry.fromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Future<void> add(String listingId, String accessToken) async {
    await _client.post(
      '/mobile/watchlist',
      {'listingId': listingId},
      accessToken: accessToken,
    );
  }

  @override
  Future<void> remove(String listingId, String accessToken) async {
    await _client.delete('/mobile/watchlist/$listingId', accessToken: accessToken);
  }
}
