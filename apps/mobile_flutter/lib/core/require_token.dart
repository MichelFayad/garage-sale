import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import 'api_exception.dart';

/// Reads the stored access token, throwing a 401 [ApiException] if the caller
/// is not authenticated. Every listings/browse/watchlist controller reads its
/// token this way instead of duplicating the null-check inline.
Future<String> requireAccessToken(Ref ref) async {
  final token = await ref.read(tokenStorageProvider).getAccessToken();
  if (token == null) {
    throw const ApiException(401, 'Not authenticated');
  }
  return token;
}
