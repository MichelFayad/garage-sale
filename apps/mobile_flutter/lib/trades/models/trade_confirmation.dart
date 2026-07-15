class TradeConfirmation {
  const TradeConfirmation({required this.id, required this.userId, required this.confirmedAt});

  final String id;
  final String userId;
  final DateTime confirmedAt;

  factory TradeConfirmation.fromJson(Map<String, dynamic> json) {
    return TradeConfirmation(
      id: json['id'] as String,
      userId: json['userId'] as String,
      confirmedAt: DateTime.parse(json['confirmedAt'] as String),
    );
  }
}
