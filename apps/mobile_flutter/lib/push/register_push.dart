import 'package:firebase_messaging/firebase_messaging.dart';

/// Requests notification permission and returns this device's FCM
/// registration token, or null if permission was denied, Firebase isn't
/// configured, or the plugin call otherwise fails (e.g. no platform binding
/// in a unit test). Mirrors the RN app's `registerForPushNotifications`
/// (apps/mobile/src/push/registerPush.ts).
Future<String?> registerForPushNotifications() async {
  try {
    final settings = await FirebaseMessaging.instance.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) return null;
    return await FirebaseMessaging.instance.getToken();
  } catch (_) {
    return null;
  }
}
