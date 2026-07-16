import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'auth/auth_controller.dart';
import 'core/env.dart';
import 'push/push_registration.dart';
import 'router/app_router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Stripe.publishableKey = Env.stripePublishableKey;
  await Stripe.instance.applySettings();
  await _initializeFirebase();
  runApp(const ProviderScope(child: GarageSaleApp()));
}

Future<void> _initializeFirebase() async {
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onMessage.listen((message) {
      // Foreground push notifications arrive here but aren't displayed as a
      // system banner yet — see the F4 plan's shared context for why that's
      // deferred (needs flutter_local_notifications + a device to verify).
      debugPrint('Foreground push received: ${message.notification?.title}');
    });
  } catch (e) {
    // No Firebase project configured for this build yet — push registration
    // will simply find no device token and no-op. Never block app startup.
    debugPrint('Firebase initialization skipped: $e');
  }
}

class GarageSaleApp extends ConsumerWidget {
  const GarageSaleApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen<AsyncValue<Object?>>(authControllerProvider, (previous, next) {
      final wasAuthenticated = previous?.valueOrNull != null;
      final isAuthenticated = next.valueOrNull != null;
      if (!wasAuthenticated && isAuthenticated) {
        ref.read(pushRegistrationControllerProvider.notifier).registerDevice();
      }
    });
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Garage Sale',
      routerConfig: router,
    );
  }
}
