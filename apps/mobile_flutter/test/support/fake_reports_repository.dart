import 'package:garage_sale_mobile/trades/reports_repository.dart';

class FakeReportsRepository implements ReportsRepository {
  String? lastTargetType;
  String? lastTargetId;
  String? lastReason;

  @override
  Future<void> report(
    String targetType,
    String targetId,
    String reason,
    String accessToken,
  ) async {
    lastTargetType = targetType;
    lastTargetId = targetId;
    lastReason = reason;
  }
}
