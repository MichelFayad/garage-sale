import 'models/watchlist_entry.dart';

abstract class WatchlistRepository {
  Future<List<WatchlistEntry>> list(String accessToken);

  Future<void> add(String listingId, String accessToken);

  Future<void> remove(String listingId, String accessToken);
}
