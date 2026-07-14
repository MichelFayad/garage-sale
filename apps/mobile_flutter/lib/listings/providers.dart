import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'browse_repository.dart';
import 'listings_repository.dart';
import 'models/category.dart';
import 'rest_browse_repository.dart';
import 'rest_listings_repository.dart';
import 'rest_watchlist_repository.dart';
import 'watchlist_repository.dart';

final listingsRepositoryProvider = Provider<ListingsRepository>(
  (ref) => RestListingsRepository(ref.watch(apiClientProvider)),
);

final browseRepositoryProvider = Provider<BrowseRepository>(
  (ref) => RestBrowseRepository(ref.watch(apiClientProvider)),
);

final watchlistRepositoryProvider = Provider<WatchlistRepository>(
  (ref) => RestWatchlistRepository(ref.watch(apiClientProvider)),
);

final categoriesProvider = FutureProvider<List<Category>>(
  (ref) => ref.watch(listingsRepositoryProvider).categories(),
);
