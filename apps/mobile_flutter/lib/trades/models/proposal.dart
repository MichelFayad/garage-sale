import '../../listings/models/listing.dart';
import 'proposal_item.dart';
import 'proposal_status.dart';
import 'trade_confirmation.dart';
import 'trade_rating.dart';

class Proposal {
  const Proposal({
    required this.id,
    required this.listingId,
    required this.listing,
    required this.proposerId,
    required this.proposerName,
    required this.ownerId,
    required this.ownerName,
    required this.status,
    required this.items,
    required this.confirmations,
    required this.ratings,
    required this.createdAt,
    this.parentProposalId,
    this.acceptedAt,
    this.completedAt,
    this.cancelledAt,
  });

  final String id;
  final String listingId;
  final Listing listing;
  final String proposerId;
  final String proposerName;
  final String ownerId;
  final String ownerName;
  final ProposalStatus status;
  final List<ProposalItem> items;
  final List<TradeConfirmation> confirmations;
  final List<TradeRating> ratings;
  final DateTime createdAt;
  final String? parentProposalId;
  final DateTime? acceptedAt;
  final DateTime? completedAt;
  final DateTime? cancelledAt;

  factory Proposal.fromJson(Map<String, dynamic> json) {
    final proposer = json['proposer'] as Map<String, dynamic>;
    final owner = json['owner'] as Map<String, dynamic>;
    return Proposal(
      id: json['id'] as String,
      listingId: json['listingId'] as String,
      listing: Listing.fromJson(json['listing'] as Map<String, dynamic>),
      proposerId: json['proposerId'] as String,
      proposerName: proposer['displayName'] as String,
      ownerId: json['ownerId'] as String,
      ownerName: owner['displayName'] as String,
      status: ProposalStatusJson.fromApi(json['status'] as String),
      items: (json['items'] as List<dynamic>? ?? [])
          .map((i) => ProposalItem.fromJson(i as Map<String, dynamic>))
          .toList(),
      confirmations: (json['confirmations'] as List<dynamic>? ?? [])
          .map((c) => TradeConfirmation.fromJson(c as Map<String, dynamic>))
          .toList(),
      ratings: (json['ratings'] as List<dynamic>? ?? [])
          .map((r) => TradeRating.fromJson(r as Map<String, dynamic>))
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      parentProposalId: json['parentProposalId'] as String?,
      acceptedAt: json['acceptedAt'] != null
          ? DateTime.parse(json['acceptedAt'] as String)
          : null,
      completedAt: json['completedAt'] != null
          ? DateTime.parse(json['completedAt'] as String)
          : null,
      cancelledAt: json['cancelledAt'] != null
          ? DateTime.parse(json['cancelledAt'] as String)
          : null,
    );
  }
}
