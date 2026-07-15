abstract class ReportsRepository {
  Future<void> report(String targetType, String targetId, String reason, String accessToken);
}
