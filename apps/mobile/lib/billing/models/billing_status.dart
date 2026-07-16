class BillingStatus {
  const BillingStatus({
    required this.paymentValid,
    required this.hasCard,
    required this.feeCents,
  });

  final bool paymentValid;
  final bool hasCard;
  final int feeCents;

  factory BillingStatus.fromJson(Map<String, dynamic> json) => BillingStatus(
        paymentValid: json['paymentValid'] as bool,
        hasCard: json['hasCard'] as bool,
        feeCents: json['feeCents'] as int,
      );
}
