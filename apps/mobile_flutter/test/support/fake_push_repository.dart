import 'package:garage_sale_mobile/push/push_repository.dart';

class FakePushRepository implements PushRepository {
  int registerCalls = 0;
  int unregisterCalls = 0;
  String? lastRegisteredToken;
  String? lastRegisteredPlatform;
  String? lastUnregisteredToken;

  @override
  Future<void> register(String token, String? platform, String accessToken) async {
    registerCalls++;
    lastRegisteredToken = token;
    lastRegisteredPlatform = platform;
  }

  @override
  Future<void> unregister(String token, String accessToken) async {
    unregisterCalls++;
    lastUnregisteredToken = token;
  }
}
