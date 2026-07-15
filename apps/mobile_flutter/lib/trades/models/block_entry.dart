class BlockEntry {
  const BlockEntry({
    required this.id,
    required this.blockedUserId,
    required this.blockedUserName,
    required this.createdAt,
    this.reason,
  });

  final String id;
  final String blockedUserId;
  final String blockedUserName;
  final DateTime createdAt;
  final String? reason;

  factory BlockEntry.fromJson(Map<String, dynamic> json) {
    final blocked = json['blocked'] as Map<String, dynamic>;
    return BlockEntry(
      id: json['id'] as String,
      blockedUserId: blocked['id'] as String,
      blockedUserName: blocked['displayName'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      reason: json['reason'] as String?,
    );
  }
}
