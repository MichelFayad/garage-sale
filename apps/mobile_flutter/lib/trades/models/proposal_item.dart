import '../../listings/models/listing.dart';

class ProposalItem {
  const ProposalItem({required this.id, required this.listing});

  final String id;
  final Listing listing;

  factory ProposalItem.fromJson(Map<String, dynamic> json) {
    return ProposalItem(
      id: json['id'] as String,
      listing: Listing.fromJson(json['listing'] as Map<String, dynamic>),
    );
  }
}
