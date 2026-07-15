import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../trades/blocks_controller.dart';

class BlocksScreen extends ConsumerWidget {
  const BlocksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blocksAsync = ref.watch(blocksControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Blocked traders')),
      body: blocksAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load blocked traders: $error')),
        data: (entries) {
          if (entries.isEmpty) {
            return const Center(child: Text('You haven\'t blocked anyone.'));
          }
          return ListView.builder(
            itemCount: entries.length,
            itemBuilder: (context, index) {
              final entry = entries[index];
              return ListTile(
                key: Key('block_tile_${entry.blockedUserId}'),
                title: Text(entry.blockedUserName),
                subtitle: entry.reason != null ? Text(entry.reason!) : null,
                trailing: TextButton(
                  key: Key('unblock_button_${entry.blockedUserId}'),
                  onPressed: () =>
                      ref.read(blocksControllerProvider.notifier).unblock(entry.blockedUserId),
                  child: const Text('Unblock'),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
