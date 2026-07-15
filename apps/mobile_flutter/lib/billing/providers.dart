import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'billing_repository.dart';
import 'rest_billing_repository.dart';

final billingRepositoryProvider = Provider<BillingRepository>(
  (ref) => RestBillingRepository(ref.watch(apiClientProvider)),
);
