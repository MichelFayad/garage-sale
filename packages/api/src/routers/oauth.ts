// OAuth exchange — the shared endpoint web (arctic callback) and mobile
// (expo-auth-session) both hit: a verified provider token in, our JWT pair out.

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { OAuthError, oauthSignIn } from '../oauth.js';
import { publicProcedure, router } from '../trpc.js';
import { publicUser } from '../user.js';

export const oauthRouter = router({
  exchange: publicProcedure
    .input(
      z
        .object({
          provider: z.enum(['GOOGLE', 'APPLE', 'FACEBOOK']),
          idToken: z.string().optional(),
          accessToken: z.string().optional(),
        })
        .refine((v) => v.idToken || v.accessToken, {
          message: 'idToken or accessToken required',
        }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, tokens } = await oauthSignIn(ctx.prisma, input);
        return { user: publicUser(user), tokens };
      } catch (err) {
        if (err instanceof OAuthError) {
          throw new TRPCError({ code: err.code, message: err.message });
        }
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'OAuth sign-in failed' });
      }
    }),
});
