import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/require_token.dart';
import 'models/listing.dart';
import 'providers.dart';

final listingByIdProvider = FutureProvider.family<Listing, String>((
  ref,
  id,
) async {
  final token = await requireAccessToken(ref);
  return ref.watch(listingsRepositoryProvider).byId(id, token);
});
