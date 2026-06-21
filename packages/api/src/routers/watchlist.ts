// Watchlist router — traders save ACTIVE listings to follow. Idempotent add via
// the composite (userId, listingId) unique.

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { ListingStatus } from '@garage-sale/db';
import { protectedProcedure, router } from '../trpc.js';

export const watchlistRouter = router({
  /** The caller's watched listings (with a cover photo), newest first. */
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.watchlist.findMany({
      where: { userId: ctx.principal.userId },
      include: {
        listing: {
          include: { photos: { orderBy: { sortOrder: 'asc' }, take: 1 }, category: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ),

  add: protectedProcedure
    .input(z.object({ listingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.prisma.listing.findUnique({ where: { id: input.listingId } });
      if (!listing || listing.status !== ListingStatus.ACTIVE) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      await ctx.prisma.watchlist.upsert({
        where: { userId_listingId: { userId: ctx.principal.userId, listingId: input.listingId } },
        create: { userId: ctx.principal.userId, listingId: input.listingId },
        update: {},
      });
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ listingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.watchlist.deleteMany({
        where: { userId: ctx.principal.userId, listingId: input.listingId },
      });
      return { ok: true };
    }),
});
