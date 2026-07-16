import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../trades/models/proposal_status.dart';
import '../trades/trades_controller.dart';

class TradesScreen extends ConsumerWidget {
  const TradesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final proposals = ref.watch(tradesControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Trades')),
      body: proposals.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load trades: $error')),
        data: (items) {
          if (items.isEmpty) {
            return const Center(child: Text('No trades yet.'));
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(tradesControllerProvider.notifier).refresh(),
            child: ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final proposal = items[index];
                return ListTile(
                  key: Key('trade_tile_${proposal.id}'),
                  title: Text(proposal.listing.title),
                  subtitle: Text(_statusLabel(proposal.status)),
                  onTap: () => context.push('/trades/${proposal.id}'),
                );
              },
            ),
          );
        },
      ),
    );
  }

  String _statusLabel(ProposalStatus status) {
    switch (status) {
      case ProposalStatus.proposed:
        return 'Proposed';
      case ProposalStatus.accepted:
        return 'Accepted';
      case ProposalStatus.declined:
        return 'Declined';
      case ProposalStatus.countered:
        return 'Countered';
      case ProposalStatus.cancelled:
        return 'Cancelled';
      case ProposalStatus.completed:
        return 'Completed';
    }
  }
}
