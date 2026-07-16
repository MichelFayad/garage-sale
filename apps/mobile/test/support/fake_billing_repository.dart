import 'package:garage_sale_mobile/billing/billing_repository.dart';
import 'package:garage_sale_mobile/billing/models/billing_status.dart';
import 'package:garage_sale_mobile/billing/models/publish_result.dart';

class FakeBillingRepository implements BillingRepository {
  FakeBillingRepository({
    BillingStatus initialStatus = const BillingStatus(
      paymentValid: false,
      hasCard: false,
      feeCents: 199,
    ),
    this.setupIntentClientSecret = 'seti_test_secret',
  }) : _status = initialStatus;

  BillingStatus _status;
  final String setupIntentClientSecret;
  int removeCardCalls = 0;
  int publishCalls = 0;
  Object? publishError;

  @override
  Future<BillingStatus> status(String accessToken) async => _status;

  @override
  Future<String> createSetupIntent(String accessToken) async => setupIntentClientSecret;

  @override
  Future<void> removeCard(String accessToken) async {
    removeCardCalls++;
    _status = BillingStatus(
      paymentValid: false,
      hasCard: false,
      feeCents: _status.feeCents,
    );
  }

  @override
  Future<PublishResult> publish(String listingId, String accessToken) async {
    publishCalls++;
    if (publishError != null) throw publishError!;
    return PublishResult(listingId: listingId, feeChargeId: 'fee-1', status: 'PENDING');
  }

  /// Test helper: simulate the setup-intent webhook having completed, i.e.
  /// a card is now on file.
  void markCardOnFile() {
    _status = BillingStatus(paymentValid: true, hasCard: true, feeCents: _status.feeCents);
  }
}
