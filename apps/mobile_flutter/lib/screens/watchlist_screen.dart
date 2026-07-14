import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../listings/watchlist_controller.dart';

class WatchlistScreen extends ConsumerWidget {
  const WatchlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final watchlistState = ref.watch(watchlistControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Watchlist')),
      body: watchlistState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => const Center(child: Text('Failed to load watchlist')),
        data: (entries) {
          if (entries.isEmpty) {
            return const Center(child: Text('No watched listings'));
          }
          return ListView.builder(
            itemCount: entries.length,
            itemBuilder: (context, index) {
              final entry = entries[index];
              return ListTile(
                key: Key('watchlist_tile_${entry.listing.id}'),
                title: Text(entry.listing.title),
                onTap: () => context.push('/listings/${entry.listing.id}'),
                trailing: IconButton(
                  key: Key('watchlist_remove_${entry.listing.id}'),
                  icon: const Icon(Icons.close),
                  onPressed: () =>
                      ref.read(watchlistControllerProvider.notifier).toggle(entry.listing.id),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
