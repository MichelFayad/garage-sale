class TradeMessage {
  const TradeMessage({
    required this.id,
    required this.proposalId,
    required this.senderId,
    required this.senderName,
    required this.body,
    required this.createdAt,
    this.readAt,
  });

  final String id;
  final String proposalId;
  final String senderId;
  final String senderName;
  final String body;
  final DateTime createdAt;
  final DateTime? readAt;

  factory TradeMessage.fromJson(Map<String, dynamic> json) {
    final sender = json['sender'] as Map<String, dynamic>;
    return TradeMessage(
      id: json['id'] as String,
      proposalId: json['proposalId'] as String,
      senderId: json['senderId'] as String,
      senderName: sender['displayName'] as String,
      body: json['body'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      readAt: json['readAt'] != null ? DateTime.parse(json['readAt'] as String) : null,
    );
  }
}
