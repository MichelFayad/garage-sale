import 'package:garage_sale_mobile/listings/browse_repository.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';

class FakeBrowseRepository implements BrowseRepository {
  FakeBrowseRepository({List<Listing> results = const []}) : _results = results;
  final List<Listing> _results;
  String? lastKeyword;
  String? lastCategoryId;
  Condition? lastCondition;
  ListingType? lastType;

  @override
  Future<List<Listing>> search(
    String accessToken, {
    String? keyword,
    String? categoryId,
    Condition? condition,
    ListingType? type,
  }) async {
    lastKeyword = keyword;
    lastCategoryId = categoryId;
    lastCondition = condition;
    lastType = type;
    if (keyword == null || keyword.isEmpty) return _results;
    return _results.where((l) => l.title.contains(keyword)).toList();
  }
}
