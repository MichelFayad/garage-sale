class PublishResult {
  const PublishResult({
    required this.listingId,
    required this.feeChargeId,
    required this.status,
  });

  final String listingId;
  final String feeChargeId;
  final String status;

  factory PublishResult.fromJson(Map<String, dynamic> json) => PublishResult(
        listingId: json['listingId'] as String,
        feeChargeId: json['feeChargeId'] as String,
        status: json['status'] as String,
      );
}
