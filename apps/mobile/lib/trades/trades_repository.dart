import 'models/proposal.dart';

abstract class TradesRepository {
  Future<List<Proposal>> mine(String accessToken);
  Future<Proposal> byId(String id, String accessToken);
  Future<Proposal> propose(String listingId, List<String> offeredListingIds, String accessToken);
  Future<Proposal> accept(String id, String accessToken);
  Future<Proposal> decline(String id, String accessToken);
  Future<Proposal> counter(String id, List<String> offeredListingIds, String accessToken);
  Future<Proposal> cancel(String id, String accessToken);
  Future<Proposal> confirm(String id, String accessToken);
  Future<void> rate(String id, int stars, String? review, String accessToken);
}
