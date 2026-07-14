import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/providers.dart';
import '../auth/token_storage.dart';
import 'api_exception.dart';

/// Reads the stored access token, throwing a 401 [ApiException] if the caller
/// is not authenticated. Every listings/browse/watchlist controller reads its
/// token this way instead of duplicating the null-check inline.
Future<String> requireAccessToken(Ref ref) =>
    requireAccessTokenFrom(ref.read(tokenStorageProvider));

/// Same check as [requireAccessToken], but takes a [TokenStorage] directly.
/// Use this from ConsumerState widgets, whose `ref` is a WidgetRef and isn't
/// assignable to [Ref].
Future<String> requireAccessTokenFrom(TokenStorage storage) async {
  final token = await storage.getAccessToken();
  if (token == null) {
    throw const ApiException(401, 'Not authenticated');
  }
  return token;
}
