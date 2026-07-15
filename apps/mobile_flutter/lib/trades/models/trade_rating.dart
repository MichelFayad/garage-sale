class TradeRating {
  const TradeRating({
    required this.id,
    required this.raterId,
    required this.rateeId,
    required this.stars,
    this.review,
  });

  final String id;
  final String raterId;
  final String rateeId;
  final int stars;
  final String? review;

  factory TradeRating.fromJson(Map<String, dynamic> json) {
    return TradeRating(
      id: json['id'] as String,
      raterId: json['raterId'] as String,
      rateeId: json['rateeId'] as String,
      stars: json['stars'] as int,
      review: json['review'] as String?,
    );
  }
}
