import '../core/api_client.dart';
import 'reports_repository.dart';

class RestReportsRepository implements ReportsRepository {
  RestReportsRepository(this._client);
  final ApiClient _client;

  @override
  Future<void> report(
    String targetType,
    String targetId,
    String reason,
    String accessToken,
  ) async {
    await _client.post(
      '/mobile/reports',
      {'targetType': targetType, 'targetId': targetId, 'reason': reason},
      accessToken: accessToken,
    );
  }
}
