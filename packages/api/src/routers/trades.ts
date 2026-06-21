// Trades router — propose (single + bundle), accept/decline/counter/cancel, with
// listing locking on accept. Plus the proposal-scoped messaging thread and
// report. Confirmation/ratings (no fee) land in P7.

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  ListingStatus,
  ProposalStatus,
  ReportTargetType,
  type PrismaClient,
} from '@garage-sale/db';
import { protectedProcedure, router } from '../trpc.js';

function traderOnly(role: string) {
  if (role !== 'TRADER') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Trader account required' });
  }
}

const proposalInclude = {
  listing: { include: { photos: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
  items: { include: { listing: true } },
  proposer: { select: { id: true, displayName: true } },
  owner: { select: { id: true, displayName: true } },
  confirmations: true,
  ratings: true,
} as const;

/** Load a proposal the caller participates in, or throw. */
async function participantProposal(prisma: PrismaClient, proposalId: string, userId: string) {
  const proposal = await prisma.tradeProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new TRPCError({ code: 'NOT_FOUND' });
  if (proposal.proposerId !== userId && proposal.ownerId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return proposal;
}

/** Validate offered listings belong to the offerer and are ACTIVE; return their ids. */
async function validateOfferedItems(
  prisma: PrismaClient,
  offererId: string,
  listingIds: string[],
): Promise<string[]> {
  const unique = [...new Set(listingIds)];
  const owned = await prisma.listing.findMany({
    where: { id: { in: unique }, ownerId: offererId, status: ListingStatus.ACTIVE },
    select: { id: true },
  });
  if (owned.length !== unique.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Offered items must be your active listings',
    });
  }
  return unique;
}

export const tradesRouter = router({
  /** Proposals the caller is involved in (as proposer or owner), newest first. */
  mine: protectedProcedure.query(({ ctx }) => {
    traderOnly(ctx.principal.role);
    return ctx.prisma.tradeProposal.findMany({
      where: {
        OR: [{ proposerId: ctx.principal.userId }, { ownerId: ctx.principal.userId }],
      },
      include: proposalInclude,
      orderBy: { createdAt: 'desc' },
    });
  }),

  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    await participantProposal(ctx.prisma, input.id, ctx.principal.userId);
    return ctx.prisma.tradeProposal.findUniqueOrThrow({
      where: { id: input.id },
      include: proposalInclude,
    });
  }),

  /** Propose a trade for a target ACTIVE listing, offering ≥1 of your active listings. */
  propose: protectedProcedure
    .input(
      z.object({ listingId: z.string(), offeredListingIds: z.array(z.string()).min(1).max(10) }),
    )
    .mutation(async ({ ctx, input }) => {
      traderOnly(ctx.principal.role);
      const target = await ctx.prisma.listing.findUnique({ where: { id: input.listingId } });
      if (!target || target.status !== ListingStatus.ACTIVE) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Listing unavailable' });
      }
      if (target.ownerId === ctx.principal.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot propose on your own listing' });
      }
      const items = await validateOfferedItems(
        ctx.prisma,
        ctx.principal.userId,
        input.offeredListingIds,
      );
      return ctx.prisma.tradeProposal.create({
        data: {
          listingId: target.id,
          proposerId: ctx.principal.userId,
          ownerId: target.ownerId,
          status: ProposalStatus.PROPOSED,
          items: { create: items.map((listingId) => ({ listingId })) },
        },
        include: proposalInclude,
      });
    }),

  /** Owner accepts → locks the target + all offered listings. */
  accept: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await participantProposal(ctx.prisma, input.id, ctx.principal.userId);
      if (proposal.ownerId !== ctx.principal.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the owner can accept' });
      }
      if (proposal.status !== ProposalStatus.PROPOSED) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Proposal is not open' });
      }
      const items = await ctx.prisma.proposalItem.findMany({ where: { proposalId: proposal.id } });
      const lockIds = [proposal.listingId, ...items.map((i) => i.listingId)];
      return ctx.prisma.$transaction(async (tx) => {
        // Re-check inside the tx: every listing must still be ACTIVE (none locked
        // by another accepted trade, removed, or already traded) before we lock.
        const lockable = await tx.listing.updateMany({
          where: { id: { in: lockIds }, status: ListingStatus.ACTIVE },
          data: { status: ListingStatus.LOCKED },
        });
        if (lockable.count !== lockIds.length) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'One or more listings are no longer available',
          });
        }
        return tx.tradeProposal.update({
          where: { id: proposal.id },
          data: { status: ProposalStatus.ACCEPTED, acceptedAt: new Date() },
          include: proposalInclude,
        });
      });
    }),

  /** Owner declines an open proposal. */
  decline: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await participantProposal(ctx.prisma, input.id, ctx.principal.userId);
      if (proposal.ownerId !== ctx.principal.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the owner can decline' });
      }
      if (proposal.status !== ProposalStatus.PROPOSED) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Proposal is not open' });
      }
      return ctx.prisma.tradeProposal.update({
        where: { id: proposal.id },
        data: { status: ProposalStatus.DECLINED },
        include: proposalInclude,
      });
    }),

  /** Either participant counters an open proposal with a new offer (their items). */
  counter: protectedProcedure
    .input(z.object({ id: z.string(), offeredListingIds: z.array(z.string()).min(1).max(10) }))
    .mutation(async ({ ctx, input }) => {
      const original = await participantProposal(ctx.prisma, input.id, ctx.principal.userId);
      if (original.status !== ProposalStatus.PROPOSED) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Proposal is not open' });
      }
      const otherParty =
        original.proposerId === ctx.principal.userId ? original.ownerId : original.proposerId;
      const items = await validateOfferedItems(
        ctx.prisma,
        ctx.principal.userId,
        input.offeredListingIds,
      );
      return ctx.prisma.$transaction(async (tx) => {
        await tx.tradeProposal.update({
          where: { id: original.id },
          data: { status: ProposalStatus.COUNTERED },
        });
        return tx.tradeProposal.create({
          data: {
            listingId: original.listingId,
            proposerId: ctx.principal.userId,
            ownerId: otherParty,
            parentProposalId: original.id,
            status: ProposalStatus.PROPOSED,
            items: { create: items.map((listingId) => ({ listingId })) },
          },
          include: proposalInclude,
        });
      });
    }),

  /** Cancel a proposal; unlocks listings if it had been accepted. */
  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await participantProposal(ctx.prisma, input.id, ctx.principal.userId);
      if (
        proposal.status !== ProposalStatus.PROPOSED &&
        proposal.status !== ProposalStatus.ACCEPTED
      ) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot cancel this proposal' });
      }
      const items = await ctx.prisma.proposalItem.findMany({ where: { proposalId: proposal.id } });
      const unlockIds = [proposal.listingId, ...items.map((i) => i.listingId)];
      return ctx.prisma.$transaction(async (tx) => {
        if (proposal.status === ProposalStatus.ACCEPTED) {
          // Return locked listings to ACTIVE so they can be traded again.
          await tx.listing.updateMany({
            where: { id: { in: unlockIds }, status: ListingStatus.LOCKED },
            data: { status: ListingStatus.ACTIVE },
          });
        }
        return tx.tradeProposal.update({
          where: { id: proposal.id },
          data: { status: ProposalStatus.CANCELLED, cancelledAt: new Date() },
          include: proposalInclude,
        });
      });
    }),

  // ─── Confirmation & ratings (no fee) ─────────────────────

  /** Confirm a trade. Two confirmations ⇒ proposal + listings COMPLETED. */
  confirm: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await participantProposal(ctx.prisma, input.id, ctx.principal.userId);
      if (proposal.status !== ProposalStatus.ACCEPTED) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Trade is not accepted' });
      }
      // Idempotent: unique (proposalId, userId).
      await ctx.prisma.tradeConfirmation.upsert({
        where: { proposalId_userId: { proposalId: proposal.id, userId: ctx.principal.userId } },
        create: { proposalId: proposal.id, userId: ctx.principal.userId },
        update: {},
      });
      const count = await ctx.prisma.tradeConfirmation.count({
        where: { proposalId: proposal.id },
      });
      if (count >= 2) {
        const items = await ctx.prisma.proposalItem.findMany({
          where: { proposalId: proposal.id },
        });
        const ids = [proposal.listingId, ...items.map((i) => i.listingId)];
        await ctx.prisma.$transaction([
          ctx.prisma.listing.updateMany({
            where: { id: { in: ids } },
            data: { status: ListingStatus.COMPLETED },
          }),
          ctx.prisma.tradeProposal.update({
            where: { id: proposal.id },
            data: { status: ProposalStatus.COMPLETED, completedAt: new Date() },
          }),
        ]);
      }
      return ctx.prisma.tradeProposal.findUniqueOrThrow({
        where: { id: proposal.id },
        include: proposalInclude,
      });
    }),

  /** Rate the counterparty on a COMPLETED trade; recomputes their average. */
  rate: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        stars: z.number().int().min(1).max(5),
        review: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await participantProposal(ctx.prisma, input.id, ctx.principal.userId);
      if (proposal.status !== ProposalStatus.COMPLETED) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Trade is not completed' });
      }
      const rateeId =
        proposal.proposerId === ctx.principal.userId ? proposal.ownerId : proposal.proposerId;
      await ctx.prisma.rating.upsert({
        where: { proposalId_raterId: { proposalId: proposal.id, raterId: ctx.principal.userId } },
        create: {
          proposalId: proposal.id,
          raterId: ctx.principal.userId,
          rateeId,
          stars: input.stars,
          review: input.review,
        },
        update: { stars: input.stars, review: input.review },
      });
      // Recompute the ratee's aggregate from all ratings they've received.
      const agg = await ctx.prisma.rating.aggregate({
        where: { rateeId },
        _avg: { stars: true },
        _count: true,
      });
      await ctx.prisma.user.update({
        where: { id: rateeId },
        data: {
          ratingAvg: agg._avg.stars ?? 0,
          ratingCount: agg._count,
        },
      });
      return { ok: true };
    }),

  // ─── Messaging (proposal-scoped) ─────────────────────────

  messages: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .query(async ({ ctx, input }) => {
      await participantProposal(ctx.prisma, input.proposalId, ctx.principal.userId);
      return ctx.prisma.message.findMany({
        where: { proposalId: input.proposalId },
        include: { sender: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: 'asc' },
      });
    }),

  sendMessage: protectedProcedure
    .input(z.object({ proposalId: z.string(), body: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      await participantProposal(ctx.prisma, input.proposalId, ctx.principal.userId);
      return ctx.prisma.message.create({
        data: {
          proposalId: input.proposalId,
          senderId: ctx.principal.userId,
          body: input.body,
        },
        include: { sender: { select: { id: true, displayName: true } } },
      });
    }),

  // ─── Reporting ───────────────────────────────────────────

  report: protectedProcedure
    .input(
      z.object({
        targetType: z.nativeEnum(ReportTargetType),
        targetId: z.string(),
        reason: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      traderOnly(ctx.principal.role);
      await ctx.prisma.report.create({
        data: {
          reporterId: ctx.principal.userId,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
        },
      });
      return { ok: true };
    }),
});
