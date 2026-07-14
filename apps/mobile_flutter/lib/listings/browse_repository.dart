import 'models/listing.dart';

abstract class BrowseRepository {
  Future<List<Listing>> search(
    String accessToken, {
    String? keyword,
    String? categoryId,
    Condition? condition,
    ListingType? type,
  });
}
