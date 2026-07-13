import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import 'auth_repository.dart';
import 'rest_auth_repository.dart';
import 'token_storage.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => RestAuthRepository(ref.watch(apiClientProvider)),
);

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());
