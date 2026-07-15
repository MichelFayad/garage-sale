import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/billing/models/billing_status.dart';

void main() {
  test('fromJson decodes all fields', () {
    final status = BillingStatus.fromJson({
      'paymentValid': true,
      'hasCard': true,
      'feeCents': 199,
    });

    expect(status.paymentValid, isTrue);
    expect(status.hasCard, isTrue);
    expect(status.feeCents, 199);
  });
}
