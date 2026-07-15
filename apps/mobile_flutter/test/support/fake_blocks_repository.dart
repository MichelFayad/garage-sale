import 'package:garage_sale_mobile/trades/blocks_repository.dart';
import 'package:garage_sale_mobile/trades/models/block_entry.dart';

class FakeBlocksRepository implements BlocksRepository {
  FakeBlocksRepository({List<BlockEntry> entries = const [], Set<String> blockedIds = const {}})
    : _entries = List.of(entries),
      _blockedIds = Set.of(blockedIds);

  final List<BlockEntry> _entries;
  final Set<String> _blockedIds;
  int unblockCalls = 0;

  @override
  Future<List<BlockEntry>> list(String accessToken) async => List.of(_entries);

  @override
  Future<bool> status(String userId, String accessToken) async => _blockedIds.contains(userId);

  @override
  Future<void> block(String userId, String? reason, String accessToken) async {
    _blockedIds.add(userId);
  }

  @override
  Future<void> unblock(String userId, String accessToken) async {
    unblockCalls++;
    _blockedIds.remove(userId);
    _entries.removeWhere((e) => e.blockedUserId == userId);
  }
}
