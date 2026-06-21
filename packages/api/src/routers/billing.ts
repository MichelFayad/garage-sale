// Billing router — card-on-file setup, status, and the publish charge. Trader-only
// (admins have no per-post billing). The Stripe webhook (apps/web) finalizes state.

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc.js';
import { createSetupIntent, getBillingStatus, publishListing, removeCard } from '../billing.js';

function traderOnly(role: string) {
  if (role !== 'TRADER') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Trader account required' });
  }
}

export const billingRouter = router({
  /** Create a SetupIntent for collecting a card on file. */
  createSetupIntent: protectedProcedure.mutation(async ({ ctx }) => {
    traderOnly(ctx.principal.role);
    return createSetupIntent(ctx.prisma, ctx.principal.userId);
  }),

  /** Card-on-file + current per-post fee, for the publish gate. */
  status: protectedProcedure.query(async ({ ctx }) => {
    traderOnly(ctx.principal.role);
    return getBillingStatus(ctx.prisma, ctx.principal.userId);
  }),

  /** Remove the saved card (clears paymentValid). */
  removeCard: protectedProcedure.mutation(async ({ ctx }) => {
    traderOnly(ctx.principal.role);
    await removeCard(ctx.prisma, ctx.principal.userId);
    return { ok: true };
  }),

  /** Publish a draft listing, charging the per-post fee off_session. */
  publishListing: protectedProcedure
    .input(z.object({ listingId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      traderOnly(ctx.principal.role);
      return publishListing(ctx.prisma, ctx.principal.userId, input.listingId);
    }),
});
