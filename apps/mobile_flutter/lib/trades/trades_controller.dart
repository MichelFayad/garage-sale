import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'models/proposal.dart';
import 'trades_providers.dart';
import 'trades_repository.dart';

class TradesController extends AsyncNotifier<List<Proposal>> {
  TradesRepository get _repo => ref.read(tradesRepositoryProvider);

  @override
  Future<List<Proposal>> build() => _load();

  Future<List<Proposal>> _load() async {
    final token = await requireAccessToken(ref);
    return _repo.mine(token);
  }

  /// Creates a new proposal and returns it (caller navigates to its detail).
  Future<Proposal> propose(String listingId, List<String> offeredListingIds) async {
    await future;
    final token = await requireAccessToken(ref);
    final created = await _repo.propose(listingId, offeredListingIds, token);
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
    return created;
  }

  Future<void> refresh() async {
    await future;
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }
}

final tradesControllerProvider = AsyncNotifierProvider<TradesController, List<Proposal>>(
  TradesController.new,
);
