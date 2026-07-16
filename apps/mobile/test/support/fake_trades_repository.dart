import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/trades_repository.dart';

class FakeTradesRepository implements TradesRepository {
  FakeTradesRepository({List<Proposal> proposals = const []})
    : _proposals = List.of(proposals);

  final List<Proposal> _proposals;
  int acceptCalls = 0;
  int declineCalls = 0;
  int cancelCalls = 0;
  int confirmCalls = 0;
  String? lastRateReview;
  int? lastRateStars;

  @override
  Future<List<Proposal>> mine(String accessToken) async => List.of(_proposals);

  @override
  Future<Proposal> byId(String id, String accessToken) async {
    return _proposals.firstWhere((p) => p.id == id);
  }

  @override
  Future<Proposal> propose(
    String listingId,
    List<String> offeredListingIds,
    String accessToken,
  ) async {
    final created = _proposals.first;
    return created;
  }

  @override
  Future<Proposal> accept(String id, String accessToken) async {
    acceptCalls++;
    return _proposals.firstWhere((p) => p.id == id);
  }

  @override
  Future<Proposal> decline(String id, String accessToken) async {
    declineCalls++;
    return _proposals.firstWhere((p) => p.id == id);
  }

  @override
  Future<Proposal> counter(
    String id,
    List<String> offeredListingIds,
    String accessToken,
  ) async {
    return _proposals.firstWhere((p) => p.id == id);
  }

  @override
  Future<Proposal> cancel(String id, String accessToken) async {
    cancelCalls++;
    return _proposals.firstWhere((p) => p.id == id);
  }

  @override
  Future<Proposal> confirm(String id, String accessToken) async {
    confirmCalls++;
    return _proposals.firstWhere((p) => p.id == id);
  }

  @override
  Future<void> rate(String id, int stars, String? review, String accessToken) async {
    lastRateStars = stars;
    lastRateReview = review;
  }
}
