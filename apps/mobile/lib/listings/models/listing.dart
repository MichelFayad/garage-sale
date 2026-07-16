enum ListingType { have, want }

extension ListingTypeJson on ListingType {
  static const _toApi = {ListingType.have: 'HAVE', ListingType.want: 'WANT'};
  static const _fromApi = {'HAVE': ListingType.have, 'WANT': ListingType.want};

  String toApi() => _toApi[this]!;

  static ListingType fromApi(String value) => _fromApi[value]!;
}

enum Condition { newItem, likeNew, good, fair, poor }

extension ConditionJson on Condition {
  static const _toApi = {
    Condition.newItem: 'NEW',
    Condition.likeNew: 'LIKE_NEW',
    Condition.good: 'GOOD',
    Condition.fair: 'FAIR',
    Condition.poor: 'POOR',
  };
  static const _fromApi = {
    'NEW': Condition.newItem,
    'LIKE_NEW': Condition.likeNew,
    'GOOD': Condition.good,
    'FAIR': Condition.fair,
    'POOR': Condition.poor,
  };

  String toApi() => _toApi[this]!;

  static Condition fromApi(String value) => _fromApi[value]!;
}

enum ListingStatus { draft, pendingPayment, active, locked, completed, removed }

extension ListingStatusJson on ListingStatus {
  static const _fromApi = {
    'DRAFT': ListingStatus.draft,
    'PENDING_PAYMENT': ListingStatus.pendingPayment,
    'ACTIVE': ListingStatus.active,
    'LOCKED': ListingStatus.locked,
    'COMPLETED': ListingStatus.completed,
    'REMOVED': ListingStatus.removed,
  };

  static ListingStatus fromApi(String value) => _fromApi[value]!;
}

class ListingPhoto {
  const ListingPhoto({required this.id, required this.url, required this.sortOrder});

  final String id;
  final String url;
  final int sortOrder;

  factory ListingPhoto.fromJson(Map<String, dynamic> json) {
    return ListingPhoto(
      id: json['id'] as String,
      url: json['url'] as String,
      sortOrder: json['sortOrder'] as int,
    );
  }
}

class Listing {
  const Listing({
    required this.id,
    required this.ownerId,
    required this.type,
    required this.title,
    required this.description,
    required this.condition,
    required this.categoryId,
    required this.status,
    required this.photos,
    this.city,
    this.neighbourhood,
    this.wantedDescription,
    this.wantedCategoryId,
    this.categoryName,
  });

  final String id;
  final String ownerId;
  final ListingType type;
  final String title;
  final String description;
  final Condition condition;
  final String categoryId;
  final ListingStatus status;
  final List<ListingPhoto> photos;
  final String? city;
  final String? neighbourhood;
  final String? wantedDescription;
  final String? wantedCategoryId;
  final String? categoryName;

  factory Listing.fromJson(Map<String, dynamic> json) {
    final category = json['category'] as Map<String, dynamic>?;
    return Listing(
      id: json['id'] as String,
      ownerId: json['ownerId'] as String,
      type: ListingTypeJson.fromApi(json['type'] as String),
      title: json['title'] as String,
      description: json['description'] as String,
      condition: ConditionJson.fromApi(json['condition'] as String),
      categoryId: json['categoryId'] as String,
      status: ListingStatusJson.fromApi(json['status'] as String),
      photos: (json['photos'] as List<dynamic>? ?? [])
          .map((p) => ListingPhoto.fromJson(p as Map<String, dynamic>))
          .toList(),
      city: json['city'] as String?,
      neighbourhood: json['neighbourhood'] as String?,
      wantedDescription: json['wantedDescription'] as String?,
      wantedCategoryId: json['wantedCategoryId'] as String?,
      categoryName: category?['name'] as String?,
    );
  }

  Listing copyWith({ListingStatus? status}) {
    return Listing(
      id: id,
      ownerId: ownerId,
      type: type,
      title: title,
      description: description,
      condition: condition,
      categoryId: categoryId,
      status: status ?? this.status,
      photos: photos,
      city: city,
      neighbourhood: neighbourhood,
      wantedDescription: wantedDescription,
      wantedCategoryId: wantedCategoryId,
      categoryName: categoryName,
    );
  }
}

class ListingInput {
  const ListingInput({
    required this.type,
    required this.title,
    required this.description,
    required this.condition,
    required this.categoryId,
    this.city,
    this.neighbourhood,
    this.wantedDescription,
    this.wantedCategoryId,
    this.photos = const [],
  });

  final ListingType type;
  final String title;
  final String description;
  final Condition condition;
  final String categoryId;
  final String? city;
  final String? neighbourhood;
  final String? wantedDescription;
  final String? wantedCategoryId;
  final List<String> photos;

  Map<String, dynamic> toJson() {
    return {
      'type': type.toApi(),
      'title': title,
      'description': description,
      'condition': condition.toApi(),
      'categoryId': categoryId,
      if (city != null) 'city': city,
      if (neighbourhood != null) 'neighbourhood': neighbourhood,
      if (wantedDescription != null) 'wantedDescription': wantedDescription,
      if (wantedCategoryId != null) 'wantedCategoryId': wantedCategoryId,
      'photos': photos,
    };
  }
}
