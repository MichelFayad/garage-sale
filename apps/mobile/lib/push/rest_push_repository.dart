import '../core/api_client.dart';
import 'push_repository.dart';

class RestPushRepository implements PushRepository {
  RestPushRepository(this._client);
  final ApiClient _client;

  @override
  Future<void> register(String token, String? platform, String accessToken) async {
    await _client.post(
      '/mobile/push/register',
      {'token': token, if (platform != null) 'platform': platform},
      accessToken: accessToken,
    );
  }

  @override
  Future<void> unregister(String token, String accessToken) async {
    await _client.post(
      '/mobile/push/unregister',
      {'token': token},
      accessToken: accessToken,
    );
  }
}
