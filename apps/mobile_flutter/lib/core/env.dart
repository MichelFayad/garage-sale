class Env {
  /// Override at build/run time: --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
  /// (10.0.2.2 is the Android emulator's alias for the host machine's localhost).
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api',
  );
}
