// publishListing guard tests. Every case here throws before the Stripe call,
// so no Stripe key is needed — they pin the money-path preconditions: ownership,
// charge eligibility, draft-only, and a valid card.

import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@garage-sale/db';
import { publishListing } from './billing.js';

function prismaStub(parts: Record<string, unknown>): PrismaClient {
  return parts as unknown as PrismaClient;
}

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof TRPCError) return err.code;
    throw err;
  }
  throw new Error('expected the call to throw');
}

describe('publishListing guards', () => {
  it('NOT_FOUND when the listing is missing', async () => {
    const prisma = prismaStub({ listing: { findUnique: async () => null } });
    expect(await codeOf(() => publishListing(prisma, 'u1', 'missing'))).toBe('NOT_FOUND');
  });

  it('FORBIDDEN when the caller is not the owner', async () => {
    const prisma = prismaStub({
      listing: { findUnique: async () => ({ id: 'l1', ownerId: 'other', status: 'DRAFT' }) },
    });
    expect(await codeOf(() => publishListing(prisma, 'u1', 'l1'))).toBe('FORBIDDEN');
  });

  it('BAD_REQUEST when the listing was already charged (no re-charge)', async () => {
    const prisma = prismaStub({
      listing: { findUnique: async () => ({ id: 'l1', ownerId: 'u1', status: 'ACTIVE' }) },
      feeCharge: { count: async () => 1 },
    });
    expect(await codeOf(() => publishListing(prisma, 'u1', 'l1'))).toBe('BAD_REQUEST');
  });

  it('BAD_REQUEST when a chargeable listing is not a DRAFT', async () => {
    // REMOVED + never charged → eligible to charge, but only DRAFT may publish.
    const prisma = prismaStub({
      listing: { findUnique: async () => ({ id: 'l1', ownerId: 'u1', status: 'REMOVED' }) },
      feeCharge: { count: async () => 0 },
    });
    expect(await codeOf(() => publishListing(prisma, 'u1', 'l1'))).toBe('BAD_REQUEST');
  });

  it('FORBIDDEN when the owner has no valid card', async () => {
    const prisma = prismaStub({
      listing: { findUnique: async () => ({ id: 'l1', ownerId: 'u1', status: 'DRAFT' }) },
      feeCharge: { count: async () => 0 },
      user: { findUnique: async () => ({ id: 'u1', stripeCustomerId: null, paymentValid: false }) },
    });
    expect(await codeOf(() => publishListing(prisma, 'u1', 'l1'))).toBe('FORBIDDEN');
  });
});
