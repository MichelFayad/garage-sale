abstract class PushRepository {
  Future<void> register(String token, String? platform, String accessToken);

  Future<void> unregister(String token, String accessToken);
}
