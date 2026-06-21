import { describe, expect, it } from 'vitest';
import { refundOnRemoval, shouldChargeOnPublish } from './fee.js';

describe('shouldChargeOnPublish', () => {
  it('charges a fresh draft that was never charged', () => {
    expect(shouldChargeOnPublish({ alreadyChargedSucceeded: false, fromStatus: 'DRAFT' })).toBe(
      true,
    );
  });

  it('does not re-charge editing a live ACTIVE listing', () => {
    expect(shouldChargeOnPublish({ alreadyChargedSucceeded: true, fromStatus: 'ACTIVE' })).toBe(
      false,
    );
  });

  it('charges relisting a REMOVED listing', () => {
    expect(shouldChargeOnPublish({ alreadyChargedSucceeded: false, fromStatus: 'REMOVED' })).toBe(
      true,
    );
  });
});

describe('refundOnRemoval', () => {
  it('refunds nothing (non-refundable)', () => {
    expect(refundOnRemoval()).toEqual({ refundCents: 0 });
  });
});
