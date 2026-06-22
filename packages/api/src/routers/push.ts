// Push router — register/unregister a device's Expo push token. Trader-scoped via
// the principal; the mobile app registers on login and unregisters on logout.

import { z } from 'zod';
import { protectedProcedure, router } from '../trpc.js';
import { registerPushToken, unregisterPushToken } from '../push.js';

export const pushRouter = router({
  register: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(255), platform: z.string().max(20).optional() }))
    .mutation(async ({ ctx, input }) => {
      await registerPushToken(ctx.prisma, ctx.principal.userId, input.token, input.platform);
      return { ok: true };
    }),

  unregister: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      await unregisterPushToken(ctx.prisma, input.token);
      return { ok: true };
    }),
});
