import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'browse_repository.dart';
import 'models/listing.dart';
import 'providers.dart';

class BrowseController extends AsyncNotifier<List<Listing>> {
  BrowseRepository get _repo => ref.read(browseRepositoryProvider);

  @override
  Future<List<Listing>> build() => _search();

  Future<List<Listing>> _search({
    String? keyword,
    String? categoryId,
    Condition? condition,
    ListingType? type,
  }) async {
    final token = await requireAccessToken(ref);
    return _repo.search(
      token,
      keyword: keyword,
      categoryId: categoryId,
      condition: condition,
      type: type,
    );
  }

  Future<void> applyFilters({
    String? keyword,
    String? categoryId,
    Condition? condition,
    ListingType? type,
  }) async {
    await future;
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => _search(keyword: keyword, categoryId: categoryId, condition: condition, type: type),
    );
  }
}

final browseControllerProvider =
    AsyncNotifierProvider<BrowseController, List<Listing>>(BrowseController.new);
