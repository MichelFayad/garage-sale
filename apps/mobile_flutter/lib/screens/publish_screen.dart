import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import '../billing/billing_controller.dart';
import '../billing/billing_repository.dart';
import '../billing/card_sheet.dart';
import '../billing/card_sheet.dart' as card_sheet_lib;
import '../billing/providers.dart';
import '../core/api_exception.dart';
import '../core/require_token.dart';
import '../listings/my_listings_controller.dart';

class PublishScreen extends ConsumerStatefulWidget {
  const PublishScreen({
    super.key,
    required this.listingId,
    this.presentCardSheet = card_sheet_lib.presentCardSheet,
  });

  final String listingId;

  /// Injected so widget tests can avoid touching the real Stripe SDK's
  /// platform channels. Defaults to the real implementation.
  final Future<CardSheetResult> Function(BillingRepository, String) presentCardSheet;

  @override
  ConsumerState<PublishScreen> createState() => _PublishScreenState();
}

class _PublishScreenState extends ConsumerState<PublishScreen> {
  bool _isSubmitting = false;
  String? _error;

  Future<void> _addCard() async {
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      final token = await requireAccessTokenFrom(ref.read(tokenStorageProvider));
      final result = await widget.presentCardSheet(ref.read(billingRepositoryProvider), token);
      if (!result.ok && !result.cancelled) {
        setState(() => _error = result.error ?? 'Could not add card');
        return;
      }
      if (result.ok) ref.invalidate(billingControllerProvider);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Could not add card');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  Future<void> _publish() async {
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      final token = await requireAccessTokenFrom(ref.read(tokenStorageProvider));
      await ref.read(billingRepositoryProvider).publish(widget.listingId, token);
      ref.invalidate(myListingsControllerProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Failed to publish listing. Please try again.');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusAsync = ref.watch(billingControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Publish listing')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: statusAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => const Center(child: Text('Failed to load billing status')),
          data: (status) {
            final fee = (status.feeCents / 100).toStringAsFixed(2);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'The fee is charged when your listing goes live and is '
                  'non-refundable. Editing a live listing is free.',
                ),
                const SizedBox(height: 16),
                if (status.paymentValid && status.hasCard) ...[
                  const Text('Card on file', key: Key('card_on_file_text')),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    key: const Key('publish_button'),
                    onPressed: _isSubmitting ? null : _publish,
                    child: _isSubmitting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text('Publish — \$$fee'),
                  ),
                ] else
                  ElevatedButton(
                    key: const Key('add_card_button'),
                    onPressed: _isSubmitting ? null : _addCard,
                    child: const Text('Add a card'),
                  ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(_error!, style: const TextStyle(color: Colors.red)),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
