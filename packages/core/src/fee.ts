// Per-post fee logic. Fee is charged once, at listing publish — NOT on trade
// completion (supersedes scope doc v2.1). Editing a live listing is free;
// a fresh publish charges again.

/** Whether publishing this listing should trigger a new per-post charge.
 *  A listing that was already charged + is going live again from a non-removed
 *  state (e.g. edit of an ACTIVE listing) is free. */
export function shouldChargeOnPublish(args: {
  alreadyChargedSucceeded: boolean;
  fromStatus: 'DRAFT' | 'PENDING_PAYMENT' | 'ACTIVE' | 'LOCKED' | 'COMPLETED' | 'REMOVED';
}): boolean {
  if (args.fromStatus === 'ACTIVE' || args.fromStatus === 'LOCKED') return false;
  return !args.alreadyChargedSucceeded;
}

/** Fee is non-refundable on removal/expiry. */
export function refundOnRemoval(): { refundCents: number } {
  return { refundCents: 0 };
}
