import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'listings_repository.dart';
import 'models/listing.dart';
import 'providers.dart';

class MyListingsController extends AsyncNotifier<List<Listing>> {
  ListingsRepository get _repo => ref.read(listingsRepositoryProvider);

  @override
  Future<List<Listing>> build() => _load();

  Future<List<Listing>> _load() async {
    final token = await requireAccessToken(ref);
    return _repo.mine(token);
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  Future<void> markTraded(String id) async {
    final token = await requireAccessToken(ref);
    await _repo.markTraded(id, token);
    await refresh();
  }

  Future<void> remove(String id) async {
    final token = await requireAccessToken(ref);
    await _repo.remove(id, token);
    await refresh();
  }
}

final myListingsControllerProvider =
    AsyncNotifierProvider<MyListingsController, List<Listing>>(MyListingsController.new);
