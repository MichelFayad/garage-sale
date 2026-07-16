import 'package:garage_sale_mobile/listings/models/listing.dart';
import 'package:garage_sale_mobile/listings/models/watchlist_entry.dart';
import 'package:garage_sale_mobile/listings/watchlist_repository.dart';

class FakeWatchlistRepository implements WatchlistRepository {
  FakeWatchlistRepository({
    this._entries = const [],
    this._catalog = const [],
  });

  List<WatchlistEntry> _entries;
  final List<Listing> _catalog;

  @override
  Future<List<WatchlistEntry>> list(String accessToken) async => _entries;

  @override
  Future<void> add(String listingId, String accessToken) async {
    if (_entries.any((e) => e.listing.id == listingId)) return;
    final listing = _catalog.firstWhere((l) => l.id == listingId);
    _entries = [
      ..._entries,
      WatchlistEntry(id: 'w-$listingId', listing: listing),
    ];
  }

  @override
  Future<void> remove(String listingId, String accessToken) async {
    _entries = _entries.where((e) => e.listing.id != listingId).toList();
  }
}
