import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/billing/models/publish_result.dart';

void main() {
  test('fromJson decodes all fields', () {
    final result = PublishResult.fromJson({
      'listingId': 'l1',
      'feeChargeId': 'fee1',
      'status': 'PENDING',
    });

    expect(result.listingId, 'l1');
    expect(result.feeChargeId, 'fee1');
    expect(result.status, 'PENDING');
  });
}
