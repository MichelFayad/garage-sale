import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';
import '../auth/providers.dart';
import '../core/require_token.dart';
import '../trades/blocks_controller.dart';
import '../trades/blocks_providers.dart';
import '../trades/messages_controller.dart';
import '../trades/models/proposal.dart';
import '../trades/models/proposal_status.dart';
import '../trades/trade_detail_controller.dart';

class TradeDetailScreen extends ConsumerStatefulWidget {
  const TradeDetailScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<TradeDetailScreen> createState() => _TradeDetailScreenState();
}

class _TradeDetailScreenState extends ConsumerState<TradeDetailScreen> {
  final _messageController = TextEditingController();
  int _ratingStars = 5;
  final _reviewController = TextEditingController();

  @override
  void dispose() {
    _messageController.dispose();
    _reviewController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final proposalAsync = ref.watch(tradeDetailControllerProvider(widget.id));
    final sessionAsync = ref.watch(authControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Trade')),
      body: proposalAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load trade: $error')),
        data: (proposal) {
          final me = sessionAsync.value?.id;
          final isOwner = me == proposal.ownerId;
          final otherUserId = isOwner ? proposal.proposerId : proposal.ownerId;
          final otherUserName = isOwner ? proposal.proposerName : proposal.ownerName;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(proposal.listing.title, style: Theme.of(context).textTheme.titleLarge),
                Text('With $otherUserName'),
                const SizedBox(height: 8),
                Text('Status: ${proposal.status.name}'),
                const SizedBox(height: 16),
                Text('Offered items', style: Theme.of(context).textTheme.titleMedium),
                for (final item in proposal.items) Text('- ${item.listing.title}'),
                const SizedBox(height: 16),
                _buildActions(context, proposal, isOwner),
                const SizedBox(height: 16),
                _buildRating(context, proposal, me),
                const SizedBox(height: 16),
                _buildBlockButton(context, otherUserId),
                TextButton(
                  key: const Key('report_button'),
                  onPressed: () => _showReportDialog(context, otherUserId),
                  child: const Text('Report this trader'),
                ),
                const Divider(height: 32),
                Text('Messages', style: Theme.of(context).textTheme.titleMedium),
                _buildMessages(),
                _buildComposer(),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildActions(BuildContext context, Proposal proposal, bool isOwner) {
    final notifier = ref.read(tradeDetailControllerProvider(widget.id).notifier);
    final buttons = <Widget>[];

    if (proposal.status == ProposalStatus.proposed && isOwner) {
      buttons.add(
        ElevatedButton(
          key: const Key('accept_button'),
          onPressed: () => notifier.accept(),
          child: const Text('Accept'),
        ),
      );
      buttons.add(
        OutlinedButton(
          key: const Key('decline_button'),
          onPressed: () => notifier.decline(),
          child: const Text('Decline'),
        ),
      );
    }
    if (proposal.status == ProposalStatus.proposed) {
      buttons.add(
        OutlinedButton(
          key: const Key('counter_button'),
          onPressed: () => context.push('/trades/${widget.id}/counter'),
          child: const Text('Counter'),
        ),
      );
      buttons.add(
        TextButton(
          key: const Key('cancel_button'),
          onPressed: () => notifier.cancel(),
          child: const Text('Cancel'),
        ),
      );
    }
    if (proposal.status == ProposalStatus.accepted) {
      buttons.add(
        ElevatedButton(
          key: const Key('confirm_button'),
          onPressed: () => notifier.confirm(),
          child: const Text('Confirm trade complete'),
        ),
      );
      buttons.add(
        TextButton(
          key: const Key('cancel_button'),
          onPressed: () => notifier.cancel(),
          child: const Text('Cancel'),
        ),
      );
    }

    if (buttons.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 8, children: buttons);
  }

  Widget _buildRating(BuildContext context, Proposal proposal, String? me) {
    if (proposal.status != ProposalStatus.completed) return const SizedBox.shrink();
    final alreadyRated = proposal.ratings.any((r) => r.raterId == me);
    if (alreadyRated) return const Text('You rated this trade.');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Rate this trade', style: Theme.of(context).textTheme.titleMedium),
        Row(
          children: List.generate(5, (i) {
            final starValue = i + 1;
            return IconButton(
              key: Key('star_$starValue'),
              icon: Icon(
                starValue <= _ratingStars ? Icons.star : Icons.star_border,
              ),
              onPressed: () => setState(() => _ratingStars = starValue),
            );
          }),
        ),
        TextField(
          controller: _reviewController,
          decoration: const InputDecoration(labelText: 'Review (optional)'),
        ),
        ElevatedButton(
          key: const Key('submit_rating_button'),
          onPressed: () {
            ref.read(tradeDetailControllerProvider(widget.id).notifier).rate(
              _ratingStars,
              _reviewController.text.trim().isEmpty ? null : _reviewController.text.trim(),
            );
          },
          child: const Text('Submit rating'),
        ),
      ],
    );
  }

  Widget _buildBlockButton(BuildContext context, String otherUserId) {
    final blockedAsync = ref.watch(blockStatusProvider(otherUserId));
    return blockedAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (blocked) => OutlinedButton(
        key: const Key('block_button'),
        onPressed: () {
          if (blocked) {
            ref.read(blocksControllerProvider.notifier).unblock(otherUserId);
          } else {
            ref.read(blocksControllerProvider.notifier).block(otherUserId, null);
          }
        },
        child: Text(blocked ? 'Unblock trader' : 'Block trader'),
      ),
    );
  }

  Widget _buildMessages() {
    final messagesAsync = ref.watch(messagesControllerProvider(widget.id));
    return messagesAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(8),
        child: CircularProgressIndicator(),
      ),
      error: (error, _) => Text('Could not load messages: $error'),
      data: (messages) => Column(
        children: [
          for (final message in messages)
            ListTile(
              key: Key('message_${message.id}'),
              title: Text(message.body),
              subtitle: Text(message.senderName),
            ),
        ],
      ),
    );
  }

  Widget _buildComposer() {
    return Row(
      children: [
        Expanded(
          child: TextField(
            key: const Key('message_input'),
            controller: _messageController,
            decoration: const InputDecoration(hintText: 'Write a message'),
          ),
        ),
        IconButton(
          key: const Key('send_button'),
          icon: const Icon(Icons.send),
          onPressed: () async {
            final body = _messageController.text.trim();
            if (body.isEmpty) return;
            try {
              await ref.read(messagesControllerProvider(widget.id).notifier).send(body);
              _messageController.clear();
            } catch (_) {
              // Send failed — AsyncError is already visible via the
              // messagesControllerProvider watch above; keep the draft in
              // the input so the user doesn't lose what they typed.
            }
          },
        ),
      ],
    );
  }

  void _showReportDialog(BuildContext context, String targetUserId) {
    final reasonController = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Report trader'),
        content: TextField(
          key: const Key('report_reason_input'),
          controller: reasonController,
          decoration: const InputDecoration(hintText: 'Describe the issue'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            key: const Key('submit_report_button'),
            onPressed: () async {
              final reason = reasonController.text.trim();
              if (reason.isEmpty) return;
              // ConsumerState's `ref` is a WidgetRef, not assignable to the
              // plain Ref that requireAccessToken(Ref) expects — use the
              // TokenStorage-based helper instead (same fix as
              // listing_form_screen.dart's _submit).
              final token = await requireAccessTokenFrom(ref.read(tokenStorageProvider));
              await ref
                  .read(reportsRepositoryProvider)
                  .report('USER', targetUserId, reason, token);
              if (dialogContext.mounted) Navigator.of(dialogContext).pop();
            },
            child: const Text('Submit'),
          ),
        ],
      ),
    ).then((_) => reasonController.dispose());
  }
}
