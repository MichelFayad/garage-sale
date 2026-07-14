import 'package:garage_sale_mobile/listings/models/watchlist_entry.dart';
import 'package:garage_sale_mobile/listings/watchlist_repository.dart';

class FakeWatchlistRepository implements WatchlistRepository {
  FakeWatchlistRepository({List<WatchlistEntry> entries = const []})
    : _entries = entries;
  List<WatchlistEntry> _entries;

  @override
  Future<List<WatchlistEntry>> list(String accessToken) async => _entries;

  @override
  Future<void> add(String listingId, String accessToken) async {
    if (_entries.any((e) => e.listing.id == listingId)) return;
    // Tests only assert on the resulting count/ids, so a minimal stand-in
    // listing is fine here — full Listing objects come from FakeListingsRepository.
    throw UnimplementedError(
      'FakeWatchlistRepository.add requires seeding via the entries constructor '
      'param for this test double; extend if a test needs true add() support.',
    );
  }

  @override
  Future<void> remove(String listingId, String accessToken) async {
    _entries = _entries.where((e) => e.listing.id != listingId).toList();
  }
}
