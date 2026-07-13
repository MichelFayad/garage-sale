import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router/app_router.dart';

void main() {
  runApp(const ProviderScope(child: GarageSaleApp()));
}

class GarageSaleApp extends ConsumerWidget {
  const GarageSaleApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Garage Sale',
      routerConfig: router,
    );
  }
}
