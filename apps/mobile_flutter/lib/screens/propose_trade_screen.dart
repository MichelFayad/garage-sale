import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/api_exception.dart';
import '../listings/models/listing.dart';
import '../listings/my_listings_controller.dart';
import '../trades/trade_detail_controller.dart';
import '../trades/trades_controller.dart';

enum ProposeMode { propose, counter }

class ProposeTradeScreen extends ConsumerStatefulWidget {
  const ProposeTradeScreen({required this.mode, required this.targetId, super.key});

  /// For [ProposeMode.propose], the target listing id.
  /// For [ProposeMode.counter], the proposal id being countered.
  final ProposeMode mode;
  final String targetId;

  @override
  ConsumerState<ProposeTradeScreen> createState() => _ProposeTradeScreenState();
}

class _ProposeTradeScreenState extends ConsumerState<ProposeTradeScreen> {
  final Set<String> _selected = {};
  bool _isSubmitting = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final listingsAsync = ref.watch(myListingsControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.mode == ProposeMode.propose ? 'Propose trade' : 'Counter offer'),
      ),
      body: listingsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load your listings: $error')),
        data: (listings) {
          final active = listings.where((l) => l.status == ListingStatus.active).toList();
          if (active.isEmpty) {
            return const Center(child: Text('You have no active listings to offer.'));
          }
          return Column(
            children: [
              Expanded(
                child: ListView.builder(
                  itemCount: active.length,
                  itemBuilder: (context, index) {
                    final listing = active[index];
                    final checked = _selected.contains(listing.id);
                    return CheckboxListTile(
                      key: Key('offer_checkbox_${listing.id}'),
                      title: Text(listing.title),
                      value: checked,
                      onChanged: (value) {
                        setState(() {
                          if (value ?? false) {
                            _selected.add(listing.id);
                          } else {
                            _selected.remove(listing.id);
                          }
                        });
                      },
                    );
                  },
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(_error!, style: const TextStyle(color: Colors.red)),
                ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: ElevatedButton(
                  key: const Key('submit_offer_button'),
                  onPressed: _selected.isEmpty || _isSubmitting ? null : _submit,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(widget.mode == ProposeMode.propose ? 'Send proposal' : 'Send counter'),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _submit() async {
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      final offeredIds = _selected.toList();
      if (widget.mode == ProposeMode.propose) {
        final created = await ref
            .read(tradesControllerProvider.notifier)
            .propose(widget.targetId, offeredIds);
        if (mounted) context.pushReplacement('/trades/${created.id}');
      } else {
        final newId = await ref
            .read(tradeDetailControllerProvider(widget.targetId).notifier)
            .counter(offeredIds);
        if (mounted) context.pushReplacement('/trades/$newId');
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Failed to submit offer. Please try again.');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }
}
