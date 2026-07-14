import 'listing.dart';

class WatchlistEntry {
  const WatchlistEntry({required this.id, required this.listing});

  final String id;
  final Listing listing;

  factory WatchlistEntry.fromJson(Map<String, dynamic> json) {
    return WatchlistEntry(
      id: json['id'] as String,
      listing: Listing.fromJson(json['listing'] as Map<String, dynamic>),
    );
  }
}
