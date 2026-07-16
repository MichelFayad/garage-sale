import 'models/billing_status.dart';
import 'models/publish_result.dart';

abstract class BillingRepository {
  Future<BillingStatus> status(String accessToken);

  /// Returns the Stripe SetupIntent client secret, to hand to the native
  /// PaymentSheet via [presentCardSheet].
  Future<String> createSetupIntent(String accessToken);

  Future<void> removeCard(String accessToken);

  Future<PublishResult> publish(String listingId, String accessToken);
}
