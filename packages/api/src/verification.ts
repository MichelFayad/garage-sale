// Issue + consume single-use verification tokens (email verification, password
// reset). Only the SHA-256 hash is stored; the raw token travels in the email link.

import { hashOpaqueToken, randomToken } from '@garage-sale/auth';
import type { PrismaClient, VerificationTokenType } from '@garage-sale/db';

const TTL_SECONDS: Record<VerificationTokenType, number> = {
  EMAIL_VERIFICATION: 24 * 60 * 60, // 24h
  PASSWORD_RESET: 60 * 60, // 1h
};

/** Create a token for a user, persist its hash, and return the raw token for the link. */
export async function issueVerificationToken(
  prisma: PrismaClient,
  userId: string,
  type: VerificationTokenType,
): Promise<string> {
  const token = randomToken();
  await prisma.verificationToken.create({
    data: {
      userId,
      type,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + TTL_SECONDS[type] * 1000),
    },
  });
  return token;
}

/** Validate and atomically consume a token. Returns the userId, or null if invalid. */
export async function consumeVerificationToken(
  prisma: PrismaClient,
  token: string,
  type: VerificationTokenType,
): Promise<{ userId: string } | null> {
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
  });
  if (!record || record.type !== type || record.consumedAt || record.expiresAt < new Date()) {
    return null;
  }
  // Guard against double-use: only consume if still unconsumed.
  const consumed = await prisma.verificationToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) return null;
  return { userId: record.userId };
}
