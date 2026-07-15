import 'package:flutter_test/flutter_test.dart';
import 'package:garage_sale_mobile/trades/models/proposal.dart';
import 'package:garage_sale_mobile/trades/models/proposal_status.dart';

void main() {
  test('Proposal.fromJson decodes a full proposal payload', () {
    final json = {
      'id': 'p1',
      'listingId': 'l1',
      'listing': {
        'id': 'l1',
        'ownerId': 'owner1',
        'type': 'HAVE',
        'title': 'Bike',
        'description': 'Road bike',
        'condition': 'GOOD',
        'categoryId': 'cat1',
        'status': 'LOCKED',
        'photos': [],
      },
      'proposerId': 'u1',
      'proposer': {'id': 'u1', 'displayName': 'Alice'},
      'ownerId': 'u2',
      'owner': {'id': 'u2', 'displayName': 'Bob'},
      'status': 'ACCEPTED',
      'parentProposalId': null,
      'acceptedAt': '2026-07-15T10:00:00.000Z',
      'completedAt': null,
      'cancelledAt': null,
      'createdAt': '2026-07-14T10:00:00.000Z',
      'items': [
        {
          'id': 'pi1',
          'listing': {
            'id': 'l2',
            'ownerId': 'u1',
            'type': 'HAVE',
            'title': 'Skates',
            'description': 'Roller skates',
            'condition': 'FAIR',
            'categoryId': 'cat2',
            'status': 'LOCKED',
            'photos': [],
          },
        },
      ],
      'confirmations': [
        {'id': 'c1', 'userId': 'u1', 'confirmedAt': '2026-07-15T11:00:00.000Z'},
      ],
      'ratings': [],
    };

    final proposal = Proposal.fromJson(json);

    expect(proposal.id, 'p1');
    expect(proposal.status, ProposalStatus.accepted);
    expect(proposal.proposerName, 'Alice');
    expect(proposal.ownerName, 'Bob');
    expect(proposal.listing.title, 'Bike');
    expect(proposal.items, hasLength(1));
    expect(proposal.items.first.listing.title, 'Skates');
    expect(proposal.confirmations, hasLength(1));
    expect(proposal.confirmations.first.userId, 'u1');
    expect(proposal.ratings, isEmpty);
    expect(proposal.acceptedAt, DateTime.parse('2026-07-15T10:00:00.000Z'));
    expect(proposal.completedAt, isNull);
  });
}
