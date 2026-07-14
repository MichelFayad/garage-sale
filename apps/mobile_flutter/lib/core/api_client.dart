import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_exception.dart';
import 'env.dart';

class ApiClient {
  ApiClient({http.Client? httpClient, String? baseUrl})
      : _client = httpClient ?? http.Client(),
        _baseUrl = baseUrl ?? Env.apiBaseUrl;

  final http.Client _client;
  final String _baseUrl;

  Future<Map<String, dynamic>> get(String path, {String? accessToken}) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(accessToken, hasBody: false),
    );
    return _decodeObject(response);
  }

  Future<List<dynamic>> getList(String path, {String? accessToken}) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(accessToken, hasBody: false),
    );
    return _decodeList(response);
  }

  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    String? accessToken,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(accessToken, hasBody: true),
      body: jsonEncode(body),
    );
    return _decodeObject(response);
  }

  Future<Map<String, dynamic>> patch(
    String path,
    Map<String, dynamic> body, {
    String? accessToken,
  }) async {
    final response = await _client.patch(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(accessToken, hasBody: true),
      body: jsonEncode(body),
    );
    return _decodeObject(response);
  }

  Future<Map<String, dynamic>> delete(String path, {String? accessToken}) async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(accessToken, hasBody: false),
    );
    return _decodeObject(response);
  }

  Map<String, String> _headers(String? accessToken, {required bool hasBody}) {
    return {
      if (hasBody) 'Content-Type': 'application/json',
      if (accessToken != null) 'Authorization': 'Bearer $accessToken',
    };
  }

  dynamic _decodeRaw(http.Response response) {
    final body = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message =
          (body is Map<String, dynamic> ? body['error'] as String? : null) ??
              'Request failed';
      throw ApiException(response.statusCode, message);
    }
    return body;
  }

  Map<String, dynamic> _decodeObject(http.Response response) {
    final decoded = _decodeRaw(response);
    return (decoded as Map<String, dynamic>?) ?? <String, dynamic>{};
  }

  List<dynamic> _decodeList(http.Response response) {
    final decoded = _decodeRaw(response);
    return (decoded as List<dynamic>?) ?? <dynamic>[];
  }
}
