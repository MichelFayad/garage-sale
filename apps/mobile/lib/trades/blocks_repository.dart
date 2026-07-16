import 'models/block_entry.dart';

abstract class BlocksRepository {
  Future<List<BlockEntry>> list(String accessToken);
  Future<bool> status(String userId, String accessToken);
  Future<void> block(String userId, String? reason, String accessToken);
  Future<void> unblock(String userId, String accessToken);
}
