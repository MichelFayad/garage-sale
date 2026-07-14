import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'models/watchlist_entry.dart';
import 'providers.dart';
import 'watchlist_repository.dart';

class WatchlistController extends AsyncNotifier<List<WatchlistEntry>> {
  WatchlistRepository get _repo => ref.read(watchlistRepositoryProvider);

  @override
  Future<List<WatchlistEntry>> build() => _load();

  Future<List<WatchlistEntry>> _load() async {
    final token = await requireAccessToken(ref);
    return _repo.list(token);
  }

  bool isWatched(String listingId) {
    final entries = state.valueOrNull ?? const [];
    return entries.any((e) => e.listing.id == listingId);
  }

  Future<void> toggle(String listingId) async {
    await future;
    final token = await requireAccessToken(ref);
    if (isWatched(listingId)) {
      await _repo.remove(listingId, token);
    } else {
      await _repo.add(listingId, token);
    }
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }
}

final watchlistControllerProvider =
    AsyncNotifierProvider<WatchlistController, List<WatchlistEntry>>(
      WatchlistController.new,
    );
