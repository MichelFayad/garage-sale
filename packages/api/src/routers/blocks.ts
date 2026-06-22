// Blocks router — a trader blocks/unblocks another trader. The record is directional
// (blocker → blocked); enforcement is mutual and lives in ../blocks.ts, wired into
// the trade/messaging paths. Listing visibility is intentionally unaffected.

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc.js';
import { isBlockedBetween } from '../blocks.js';

function traderOnly(role: string) {
  if (role !== 'TRADER') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Trader account required' });
  }
}

export const blocksRouter = router({
  /** Traders the caller has blocked, newest first. */
  list: protectedProcedure.query(({ ctx }) => {
    traderOnly(ctx.principal.role);
    return ctx.prisma.block.findMany({
      where: { blockerId: ctx.principal.userId },
      select: {
        id: true,
        reason: true,
        createdAt: true,
        blocked: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }),

  /** Whether the caller and the given user are blocked (either direction). */
  status: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      traderOnly(ctx.principal.role);
      return { blocked: await isBlockedBetween(ctx.prisma, ctx.principal.userId, input.userId) };
    }),

  /** Block a trader. Idempotent on the (blocker, blocked) pair. */
  block: protectedProcedure
    .input(z.object({ userId: z.string(), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      traderOnly(ctx.principal.role);
      if (input.userId === ctx.principal.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot block yourself' });
      }
      await ctx.prisma.block.upsert({
        where: {
          blockerId_blockedId: { blockerId: ctx.principal.userId, blockedId: input.userId },
        },
        create: { blockerId: ctx.principal.userId, blockedId: input.userId, reason: input.reason },
        update: { reason: input.reason },
      });
      return { ok: true };
    }),

  /** Remove the caller's block on a trader (no-op if none exists). */
  unblock: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      traderOnly(ctx.principal.role);
      await ctx.prisma.block.deleteMany({
        where: { blockerId: ctx.principal.userId, blockedId: input.userId },
      });
      return { ok: true };
    }),
});
