import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../listings/listing_detail_provider.dart';
import '../listings/watchlist_controller.dart';

class ListingDetailScreen extends ConsumerWidget {
  const ListingDetailScreen({super.key, required this.listingId});
  final String listingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listingAsync = ref.watch(listingByIdProvider(listingId));
    // Watch so the widget rebuilds when the watchlist changes; read the
    // notifier below to reuse its isWatched() predicate instead of
    // duplicating the membership check here.
    ref.watch(watchlistControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Listing')),
      body: listingAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) =>
            const Center(child: Text('Failed to load listing')),
        data: (listing) {
          final isWatched = ref
              .read(watchlistControllerProvider.notifier)
              .isWatched(listing.id);
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (listing.photos.isNotEmpty)
                  SizedBox(
                    height: 200,
                    child: PageView(
                      children: [
                        for (final photo in listing.photos)
                          Image.network(photo.url, fit: BoxFit.cover),
                      ],
                    ),
                  ),
                const SizedBox(height: 16),
                Text(
                  listing.title,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                Text(listing.description),
                const SizedBox(height: 16),
                Row(
                  children: [
                    IconButton(
                      key: const Key('watchlist_toggle_button'),
                      icon: Icon(
                        isWatched ? Icons.favorite : Icons.favorite_border,
                      ),
                      onPressed: () => ref
                          .read(watchlistControllerProvider.notifier)
                          .toggle(listing.id),
                    ),
                    const Spacer(),
                    ElevatedButton(
                      key: const Key('propose_trade_button'),
                      onPressed: () => context.push('/trades/propose/${listing.id}'),
                      child: const Text('Propose trade'),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
