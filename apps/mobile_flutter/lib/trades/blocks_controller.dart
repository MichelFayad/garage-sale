import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'blocks_providers.dart';
import 'blocks_repository.dart';
import 'models/block_entry.dart';

class BlocksController extends AsyncNotifier<List<BlockEntry>> {
  BlocksRepository get _repo => ref.read(blocksRepositoryProvider);

  @override
  Future<List<BlockEntry>> build() => _load();

  Future<List<BlockEntry>> _load() async {
    final token = await requireAccessToken(ref);
    return _repo.list(token);
  }

  Future<void> unblock(String userId) async {
    await future;
    final token = await requireAccessToken(ref);
    await _repo.unblock(userId, token);
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  /// Blocks a user, invalidating [blockStatusProvider] for that user and
  /// this controller's own list so both the thread's button state and the
  /// Blocked-traders list refresh.
  Future<void> block(String userId, String? reason) async {
    await future;
    final token = await requireAccessToken(ref);
    await _repo.block(userId, reason, token);
    ref.invalidate(blockStatusProvider(userId));
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }
}

final blocksControllerProvider = AsyncNotifierProvider<BlocksController, List<BlockEntry>>(
  BlocksController.new,
);

/// Whether the caller has blocked (or been blocked by — the backend checks
/// both directions) the given user. Used by TradeDetailScreen to decide
/// whether to show "Block" or "Unblock".
final blockStatusProvider = FutureProvider.family<bool, String>((ref, userId) async {
  final token = await requireAccessToken(ref);
  return ref.read(blocksRepositoryProvider).status(userId, token);
});
