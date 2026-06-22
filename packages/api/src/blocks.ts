// Block service: the mutual-enforcement check shared by the trade/messaging paths.
// A Block row is directional (blocker → blocked), but interaction is barred both
// ways — if either user blocked the other, neither can propose or message.

import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@garage-sale/db';

/** True when a block exists in either direction between two users. */
export async function isBlockedBetween(
  prisma: PrismaClient,
  a: string,
  b: string,
): Promise<boolean> {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return block !== null;
}

/** Throw FORBIDDEN if either user has blocked the other. */
export async function assertNotBlocked(prisma: PrismaClient, a: string, b: string): Promise<void> {
  if (await isBlockedBetween(prisma, a, b)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: "You can't interact with this trader." });
  }
}
