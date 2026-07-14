import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('Garage Sale')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Signed in as ${user?.email ?? ''}'),
            const SizedBox(height: 16),
            ElevatedButton(
              key: const Key('browse_button'),
              onPressed: () => context.push('/browse'),
              child: const Text('Browse'),
            ),
            ElevatedButton(
              key: const Key('my_listings_button'),
              onPressed: () => context.push('/listings/mine'),
              child: const Text('My Listings'),
            ),
            ElevatedButton(
              key: const Key('watchlist_button'),
              onPressed: () => context.push('/watchlist'),
              child: const Text('Watchlist'),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              key: const Key('logout_button'),
              onPressed: () =>
                  ref.read(authControllerProvider.notifier).logout(),
              child: const Text('Log out'),
            ),
          ],
        ),
      ),
    );
  }
}
