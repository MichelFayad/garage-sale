class SessionUser {
  const SessionUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.emailVerified,
  });

  final String id;
  final String email;
  final String displayName;
  final bool emailVerified;

  factory SessionUser.fromJson(Map<String, dynamic> json) {
    return SessionUser(
      id: json['id'] as String,
      email: json['email'] as String,
      displayName: json['displayName'] as String,
      emailVerified: json['emailVerified'] as bool,
    );
  }
}
