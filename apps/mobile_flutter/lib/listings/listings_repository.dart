import 'models/category.dart';
import 'models/listing.dart';

abstract class ListingsRepository {
  Future<List<Category>> categories();

  Future<List<Listing>> mine(String accessToken);

  Future<Listing> byId(String id, String accessToken);

  Future<Listing> create(ListingInput input, String accessToken);

  Future<Listing> update(String id, ListingInput input, String accessToken);

  Future<Listing> markTraded(String id, String accessToken);

  Future<void> remove(String id, String accessToken);
}
