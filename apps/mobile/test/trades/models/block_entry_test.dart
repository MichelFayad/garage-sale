import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/trades/models/block_entry.dart';

void main() {
  test('BlockEntry.fromJson decodes the blocked user and optional reason', () {
    final entry = BlockEntry.fromJson({
      'id': 'b1',
      'reason': 'Spam',
      'createdAt': '2026-07-15T10:00:00.000Z',
      'blocked': {'id': 'u3', 'displayName': 'Carol'},
    });

    expect(entry.blockedUserId, 'u3');
    expect(entry.blockedUserName, 'Carol');
    expect(entry.reason, 'Spam');

    final noReason = BlockEntry.fromJson({
      'id': 'b2',
      'reason': null,
      'createdAt': '2026-07-15T10:00:00.000Z',
      'blocked': {'id': 'u4', 'displayName': 'Dave'},
    });

    expect(noReason.reason, isNull);
  });
}
