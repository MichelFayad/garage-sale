import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'blocks_repository.dart';
import 'reports_repository.dart';
import 'rest_blocks_repository.dart';
import 'rest_reports_repository.dart';

final blocksRepositoryProvider = Provider<BlocksRepository>(
  (ref) => RestBlocksRepository(ref.watch(apiClientProvider)),
);

final reportsRepositoryProvider = Provider<ReportsRepository>(
  (ref) => RestReportsRepository(ref.watch(apiClientProvider)),
);
