import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'rest_trades_repository.dart';
import 'trades_repository.dart';

final tradesRepositoryProvider = Provider<TradesRepository>(
  (ref) => RestTradesRepository(ref.watch(apiClientProvider)),
);
