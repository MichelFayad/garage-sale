import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../listings/models/listing.dart';
import '../listings/my_listings_controller.dart';

class MyListingsScreen extends ConsumerWidget {
  const MyListingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listingsState = ref.watch(myListingsControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My Listings')),
      floatingActionButton: FloatingActionButton(
        key: const Key('new_listing_button'),
        onPressed: () => context.push('/listings/new'),
        child: const Icon(Icons.add),
      ),
      body: listingsState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) =>
            const Center(child: Text('Failed to load listings')),
        data: (listings) {
          if (listings.isEmpty) {
            return const Center(child: Text('No listings yet'));
          }
          return ListView.builder(
            itemCount: listings.length,
            itemBuilder: (context, index) {
              final listing = listings[index];
              return ListTile(
                key: Key('listing_tile_${listing.id}'),
                title: Text(listing.title),
                subtitle: Text(listing.status.name),
                onTap: () => context.push('/listings/${listing.id}'),
                trailing: PopupMenuButton<String>(
                  key: Key('listing_menu_${listing.id}'),
                  onSelected: (action) async {
                    final notifier = ref.read(
                      myListingsControllerProvider.notifier,
                    );
                    if (action == 'edit') {
                      context.push(
                        '/listings/${listing.id}/edit',
                        extra: listing,
                      );
                    } else if (action == 'mark_traded') {
                      await notifier.markTraded(listing.id);
                    } else if (action == 'remove') {
                      await notifier.remove(listing.id);
                    }
                  },
                  itemBuilder: (context) => [
                    const PopupMenuItem(value: 'edit', child: Text('Edit')),
                    if (listing.status == ListingStatus.active)
                      const PopupMenuItem(
                        value: 'mark_traded',
                        child: Text('Mark traded'),
                      ),
                    const PopupMenuItem(value: 'remove', child: Text('Remove')),
                    if (listing.status == ListingStatus.draft)
                      const PopupMenuItem(
                        value: 'publish',
                        enabled: false,
                        child: Text('Publish (coming soon)'),
                      ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
