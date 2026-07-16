import '../core/api_client.dart';
import 'billing_repository.dart';
import 'models/billing_status.dart';
import 'models/publish_result.dart';

class RestBillingRepository implements BillingRepository {
  RestBillingRepository(this._client);
  final ApiClient _client;

  @override
  Future<BillingStatus> status(String accessToken) async {
    final json = await _client.get('/mobile/billing/status', accessToken: accessToken);
    return BillingStatus.fromJson(json);
  }

  @override
  Future<String> createSetupIntent(String accessToken) async {
    final json = await _client.post(
      '/mobile/billing/setup-intent',
      const {},
      accessToken: accessToken,
    );
    return json['clientSecret'] as String;
  }

  @override
  Future<void> removeCard(String accessToken) async {
    await _client.post('/mobile/billing/remove-card', const {}, accessToken: accessToken);
  }

  @override
  Future<PublishResult> publish(String listingId, String accessToken) async {
    final json = await _client.post(
      '/mobile/listings/$listingId/publish',
      const {},
      accessToken: accessToken,
    );
    return PublishResult.fromJson(json);
  }
}
