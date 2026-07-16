import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'billing_repository.dart';
import 'models/billing_status.dart';
import 'providers.dart';

class BillingController extends AsyncNotifier<BillingStatus> {
  BillingRepository get _repo => ref.read(billingRepositoryProvider);

  @override
  Future<BillingStatus> build() => _load();

  Future<BillingStatus> _load() async {
    final token = await requireAccessToken(ref);
    return _repo.status(token);
  }

  Future<void> refresh() async {
    await future;
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  Future<void> removeCard() async {
    await future;
    final token = await requireAccessToken(ref);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await _repo.removeCard(token);
      return _load();
    });
  }
}

final billingControllerProvider =
    AsyncNotifierProvider<BillingController, BillingStatus>(BillingController.new);
