import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import '../billing/billing_controller.dart';
import '../billing/billing_repository.dart';
import '../billing/card_sheet.dart';
import '../billing/card_sheet.dart' as card_sheet;
import '../billing/providers.dart';
import '../core/require_token.dart';

class PaymentMethodScreen extends ConsumerStatefulWidget {
  const PaymentMethodScreen({super.key, this.presentCardSheet = card_sheet.presentCardSheet});

  /// Injected so widget tests can avoid touching the real Stripe SDK's
  /// platform channels. Defaults to the real implementation.
  final Future<CardSheetResult> Function(BillingRepository, String) presentCardSheet;

  @override
  ConsumerState<PaymentMethodScreen> createState() => _PaymentMethodScreenState();
}

class _PaymentMethodScreenState extends ConsumerState<PaymentMethodScreen> {
  bool _isBusy = false;
  String? _error;

  Future<void> _addOrReplaceCard() async {
    setState(() {
      _isBusy = true;
      _error = null;
    });
    final token = await requireAccessTokenFrom(ref.read(tokenStorageProvider));
    final result = await widget.presentCardSheet(ref.read(billingRepositoryProvider), token);
    if (mounted) setState(() => _isBusy = false);
    if (!result.ok && !result.cancelled) {
      setState(() => _error = result.error ?? 'Could not add card');
      return;
    }
    if (result.ok) ref.invalidate(billingControllerProvider);
  }

  Future<void> _removeCard() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove card?'),
        content: const Text(
          'You will need to add a new card before publishing another listing.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            key: const Key('confirm_remove_card_button'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() {
      _isBusy = true;
      _error = null;
    });
    try {
      await ref.read(billingControllerProvider.notifier).removeCard();
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusAsync = ref.watch(billingControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Payment method')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: statusAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => const Center(child: Text('Failed to load billing status')),
          data: (status) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                status.hasCard && status.paymentValid ? 'Card on file' : 'No card on file',
                key: const Key('card_status_text'),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                key: const Key('add_replace_card_button'),
                onPressed: _isBusy ? null : _addOrReplaceCard,
                child: Text(status.hasCard ? 'Replace card' : 'Add card'),
              ),
              if (status.hasCard)
                TextButton(
                  key: const Key('remove_card_button'),
                  onPressed: _isBusy ? null : _removeCard,
                  child: const Text('Remove card'),
                ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(_error!, style: const TextStyle(color: Colors.red)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
