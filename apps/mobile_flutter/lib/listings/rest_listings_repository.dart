import '../core/api_client.dart';
import 'listings_repository.dart';
import 'models/category.dart';
import 'models/listing.dart';

class RestListingsRepository implements ListingsRepository {
  RestListingsRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<Category>> categories() async {
    final json = await _client.getList('/mobile/listings/categories');
    return json.map((e) => Category.fromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Future<List<Listing>> mine(String accessToken) async {
    final json = await _client.getList('/mobile/listings/mine', accessToken: accessToken);
    return json.map((e) => Listing.fromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Future<Listing> byId(String id, String accessToken) async {
    final json = await _client.get('/mobile/listings/$id', accessToken: accessToken);
    return Listing.fromJson(json);
  }

  @override
  Future<Listing> create(ListingInput input, String accessToken) async {
    final json = await _client.post(
      '/mobile/listings',
      input.toJson(),
      accessToken: accessToken,
    );
    return Listing.fromJson(json);
  }

  @override
  Future<Listing> update(String id, ListingInput input, String accessToken) async {
    final json = await _client.patch(
      '/mobile/listings/$id',
      input.toJson(),
      accessToken: accessToken,
    );
    return Listing.fromJson(json);
  }

  @override
  Future<Listing> markTraded(String id, String accessToken) async {
    final json = await _client.post(
      '/mobile/listings/$id/mark-traded',
      const {},
      accessToken: accessToken,
    );
    return Listing.fromJson(json);
  }

  @override
  Future<void> remove(String id, String accessToken) async {
    await _client.delete('/mobile/listings/$id', accessToken: accessToken);
  }
}
