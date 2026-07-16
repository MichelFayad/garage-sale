import 'package:garage_sale_mobile/listings/listings_repository.dart';
import 'package:garage_sale_mobile/listings/models/category.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';

/// Test double. Seed `mine` in the constructor; `create`/`update` append/replace
/// in place so screen-level flows can be exercised without a real backend.
class FakeListingsRepository implements ListingsRepository {
  FakeListingsRepository({this._mine = const [], this._categories = const []});

  final List<Category> _categories;
  List<Listing> _mine;
  String? lastMarkTradedId;
  String? lastRemoveId;

  @override
  Future<List<Category>> categories() async => _categories;

  @override
  Future<List<Listing>> mine(String accessToken) async => _mine;

  @override
  Future<Listing> byId(String id, String accessToken) async =>
      _mine.firstWhere((l) => l.id == id);

  @override
  Future<Listing> create(ListingInput input, String accessToken) async {
    final listing = _fromInput('new-${_mine.length + 1}', input, ListingStatus.draft);
    _mine = [..._mine, listing];
    return listing;
  }

  @override
  Future<Listing> update(String id, ListingInput input, String accessToken) async {
    final listing = _fromInput(id, input, ListingStatus.draft);
    _mine = [for (final l in _mine) if (l.id == id) listing else l];
    return listing;
  }

  @override
  Future<Listing> markTraded(String id, String accessToken) async {
    lastMarkTradedId = id;
    _mine = [
      for (final l in _mine)
        if (l.id == id) l.copyWith(status: ListingStatus.completed) else l,
    ];
    return _mine.firstWhere((l) => l.id == id);
  }

  @override
  Future<void> remove(String id, String accessToken) async {
    lastRemoveId = id;
    _mine = _mine.where((l) => l.id != id).toList();
  }

  Listing _fromInput(String id, ListingInput input, ListingStatus status) {
    return Listing(
      id: id,
      ownerId: 'u1',
      type: input.type,
      title: input.title,
      description: input.description,
      condition: input.condition,
      categoryId: input.categoryId,
      status: status,
      photos: [
        for (final e in input.photos.asMap().entries)
          ListingPhoto(id: 'p${e.key}', url: e.value, sortOrder: e.key),
      ],
      city: input.city,
      neighbourhood: input.neighbourhood,
      wantedDescription: input.wantedDescription,
      wantedCategoryId: input.wantedCategoryId,
    );
  }
}
