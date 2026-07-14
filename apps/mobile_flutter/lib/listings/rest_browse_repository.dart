import '../core/api_client.dart';
import 'browse_repository.dart';
import 'models/listing.dart';

class RestBrowseRepository implements BrowseRepository {
  RestBrowseRepository(this._client);
  final ApiClient _client;

  @override
  Future<List<Listing>> search(
    String accessToken, {
    String? keyword,
    String? categoryId,
    Condition? condition,
    ListingType? type,
  }) async {
    final query = <String, String>{
      if (keyword != null && keyword.isNotEmpty) 'keyword': keyword,
      if (categoryId != null) 'categoryId': categoryId,
      if (condition != null) 'condition': condition.toApi(),
      if (type != null) 'type': type.toApi(),
    };
    final path = Uri(
      path: '/mobile/browse',
      queryParameters: query.isEmpty ? null : query,
    ).toString();
    final json = await _client.getList(path, accessToken: accessToken);
    return json.map((e) => Listing.fromJson(e as Map<String, dynamic>)).toList();
  }
}
