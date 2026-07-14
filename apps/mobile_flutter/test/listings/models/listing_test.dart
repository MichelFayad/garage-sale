import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/listings/models/listing.dart';

void main() {
  group('Listing', () {
    test('fromJson parses core fields, enums, photos, and nested category', () {
      final listing = Listing.fromJson({
        'id': 'l1',
        'ownerId': 'u1',
        'type': 'HAVE',
        'title': 'Bike',
        'description': 'Red bike',
        'condition': 'GOOD',
        'categoryId': 'c1',
        'status': 'ACTIVE',
        'city': 'Austin',
        'photos': [
          {'id': 'p1', 'url': 'https://example.com/a.jpg', 'sortOrder': 0},
        ],
        'category': {'id': 'c1', 'name': 'Bikes', 'sortOrder': 0},
      });

      expect(listing.id, 'l1');
      expect(listing.type, ListingType.have);
      expect(listing.condition, Condition.good);
      expect(listing.status, ListingStatus.active);
      expect(listing.city, 'Austin');
      expect(listing.photos, hasLength(1));
      expect(listing.photos.first.url, 'https://example.com/a.jpg');
      expect(listing.categoryName, 'Bikes');
    });

    test('fromJson handles a listing with no photos or category', () {
      final listing = Listing.fromJson({
        'id': 'l1',
        'ownerId': 'u1',
        'type': 'WANT',
        'title': 'Bike',
        'description': 'Looking for a bike',
        'condition': 'FAIR',
        'categoryId': 'c1',
        'status': 'DRAFT',
      });

      expect(listing.photos, isEmpty);
      expect(listing.categoryName, isNull);
      expect(listing.city, isNull);
    });

    test('copyWith replaces only the given field', () {
      final listing = Listing.fromJson({
        'id': 'l1',
        'ownerId': 'u1',
        'type': 'HAVE',
        'title': 'Bike',
        'description': 'Red bike',
        'condition': 'GOOD',
        'categoryId': 'c1',
        'status': 'ACTIVE',
      });

      final updated = listing.copyWith(status: ListingStatus.completed);

      expect(updated.status, ListingStatus.completed);
      expect(updated.id, listing.id);
      expect(updated.title, listing.title);
    });
  });

  group('ListingInput', () {
    test('toJson serializes enums back to API string values', () {
      const input = ListingInput(
        type: ListingType.have,
        title: 'Bike',
        description: 'Red bike',
        condition: Condition.likeNew,
        categoryId: 'c1',
        photos: ['https://example.com/a.jpg'],
      );

      expect(input.toJson(), {
        'type': 'HAVE',
        'title': 'Bike',
        'description': 'Red bike',
        'condition': 'LIKE_NEW',
        'categoryId': 'c1',
        'photos': ['https://example.com/a.jpg'],
      });
    });

    test('toJson omits null optional fields', () {
      const input = ListingInput(
        type: ListingType.want,
        title: 'Chair',
        description: 'Any chair',
        condition: Condition.poor,
        categoryId: 'c2',
      );

      final json = input.toJson();

      expect(json.containsKey('city'), isFalse);
      expect(json.containsKey('neighbourhood'), isFalse);
      expect(json.containsKey('wantedDescription'), isFalse);
      expect(json.containsKey('wantedCategoryId'), isFalse);
    });
  });
}
