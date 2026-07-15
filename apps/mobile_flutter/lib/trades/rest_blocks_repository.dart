import '../core/api_client.dart';
import 'blocks_repository.dart';
import 'models/block_entry.dart';

class RestBlocksRepository implements BlocksRepository {
  RestBlocksRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<BlockEntry>> list(String accessToken) async {
    final json = await _client.getList('/mobile/blocks', accessToken: accessToken);
    return json.map((b) => BlockEntry.fromJson(b as Map<String, dynamic>)).toList();
  }

  @override
  Future<bool> status(String userId, String accessToken) async {
    final json = await _client.get('/mobile/blocks/$userId', accessToken: accessToken);
    return json['blocked'] as bool;
  }

  @override
  Future<void> block(String userId, String? reason, String accessToken) async {
    await _client.post(
      '/mobile/blocks',
      {'userId': userId, if (reason != null) 'reason': reason},
      accessToken: accessToken,
    );
  }

  @override
  Future<void> unblock(String userId, String accessToken) async {
    await _client.delete('/mobile/blocks/$userId', accessToken: accessToken);
  }
}
