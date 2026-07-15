enum ProposalStatus { proposed, accepted, declined, countered, cancelled, completed }

extension ProposalStatusJson on ProposalStatus {
  static const _fromApi = {
    'PROPOSED': ProposalStatus.proposed,
    'ACCEPTED': ProposalStatus.accepted,
    'DECLINED': ProposalStatus.declined,
    'COUNTERED': ProposalStatus.countered,
    'CANCELLED': ProposalStatus.cancelled,
    'COMPLETED': ProposalStatus.completed,
  };

  static ProposalStatus fromApi(String value) => _fromApi[value]!;
}
