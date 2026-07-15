import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'models/proposal.dart';
import 'trades_controller.dart';
import 'trades_providers.dart';
import 'trades_repository.dart';

class TradeDetailController extends FamilyAsyncNotifier<Proposal, String> {
  TradesRepository get _repo => ref.read(tradesRepositoryProvider);

  @override
  Future<Proposal> build(String arg) => _load(arg);

  Future<Proposal> _load(String id) async {
    final token = await requireAccessToken(ref);
    return _repo.byId(id, token);
  }

  Future<void> accept() async {
    await future;
    final token = await requireAccessToken(ref);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _repo.accept(arg, token));
    ref.invalidate(tradesControllerProvider);
  }

  Future<void> decline() async {
    await future;
    final token = await requireAccessToken(ref);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _repo.decline(arg, token));
    ref.invalidate(tradesControllerProvider);
  }

  Future<void> cancel() async {
    await future;
    final token = await requireAccessToken(ref);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _repo.cancel(arg, token));
    ref.invalidate(tradesControllerProvider);
  }

  Future<void> confirm() async {
    await future;
    final token = await requireAccessToken(ref);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _repo.confirm(arg, token));
    ref.invalidate(tradesControllerProvider);
  }

  // Doesn't invalidate tradesControllerProvider — a rating change doesn't
  // affect a proposal's list-visible status.
  Future<void> rate(int stars, String? review) async {
    await future;
    final token = await requireAccessToken(ref);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await _repo.rate(arg, stars, review, token);
      return _load(arg);
    });
  }

  /// Counters this proposal, returning the id of the newly created proposal.
  /// The old proposal (this controller's `arg`) is now COUNTERED — callers
  /// must navigate to the returned id, not just refresh this instance.
  Future<String> counter(List<String> offeredListingIds) async {
    await future;
    final token = await requireAccessToken(ref);
    final newProposal = await _repo.counter(arg, offeredListingIds, token);
    ref.invalidate(tradesControllerProvider);
    // invalidateSelf(), not ref.invalidate(tradeDetailControllerProvider(arg)):
    // invalidating this family entry by its own arg from inside itself trips
    // Riverpod's "provider cannot depend on itself" assertion.
    ref.invalidateSelf();
    return newProposal.id;
  }
}

final tradeDetailControllerProvider =
    AsyncNotifierProvider.family<TradeDetailController, Proposal, String>(
      TradeDetailController.new,
    );
