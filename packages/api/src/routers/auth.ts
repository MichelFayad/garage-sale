// Auth router — credentials path (register/login/refresh/me) issuing JWT pairs
// for both web (session cookie) and mobile (bearer). OAuth (Google/Apple/
// Facebook) + email verification land in P2 slice B.

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { User } from '@garage-sale/db';
import {
  createTokenPair,
  hashPassword,
  type TokenClaims,
  verifyPassword,
  verifyToken,
} from '@garage-sale/auth';
import { protectedProcedure, publicProcedure, router } from '../trpc.js';

const credentials = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(200),
});

export const authRouter = router({
  register: publicProcedure
    .input(credentials.extend({ displayName: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' });
      }
      const user = await ctx.prisma.user.create({
        data: {
          email: input.email,
          passwordHash: await hashPassword(input.password),
          displayName: input.displayName,
          // TODO(P2-B): send verification email; gate login on emailVerifiedAt.
        },
      });
      const claims: TokenClaims = {
        sub: user.id,
        role: 'TRADER',
        accountStatus: user.accountStatus,
      };
      return { user: publicUser(user), tokens: await createTokenPair(claims) };
    }),

  login: publicProcedure.input(credentials).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
    }
    if (user.accountStatus === 'BANNED') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Account banned' });
    }
    const claims: TokenClaims = {
      sub: user.id,
      role: 'TRADER',
      accountStatus: user.accountStatus,
    };
    return { user: publicUser(user), tokens: await createTokenPair(claims) };
  }),

  adminLogin: publicProcedure.input(credentials).mutation(async ({ ctx, input }) => {
    const admin = await ctx.prisma.adminUser.findUnique({ where: { email: input.email } });
    if (!admin || !(await verifyPassword(input.password, admin.passwordHash))) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
    }
    if (admin.accountStatus !== 'ACTIVE') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Account is not active' });
    }
    const claims: TokenClaims = {
      sub: admin.id,
      role: admin.role,
      accountStatus: admin.accountStatus,
    };
    return {
      admin: { id: admin.id, email: admin.email, displayName: admin.displayName, role: admin.role },
      tokens: await createTokenPair(claims),
    };
  }),

  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let sub: string;
      let role: TokenClaims['role'];
      try {
        const claims = await verifyToken(input.refreshToken, 'refresh');
        sub = claims.sub;
        role = claims.role;
      } catch {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid refresh token' });
      }
      // Re-load current status so a ban/suspend takes effect on refresh.
      if (role === 'TRADER') {
        const user = await ctx.prisma.user.findUnique({ where: { id: sub } });
        if (!user || user.accountStatus === 'BANNED') {
          throw new TRPCError({ code: 'UNAUTHORIZED' });
        }
        return {
          tokens: await createTokenPair({ sub, role, accountStatus: user.accountStatus }),
        };
      }
      const admin = await ctx.prisma.adminUser.findUnique({ where: { id: sub } });
      if (!admin || admin.accountStatus !== 'ACTIVE') {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      return { tokens: await createTokenPair({ sub, role, accountStatus: admin.accountStatus }) };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.principal.role !== 'TRADER') {
      const admin = await ctx.prisma.adminUser.findUnique({ where: { id: ctx.principal.userId } });
      if (!admin) throw new TRPCError({ code: 'NOT_FOUND' });
      return {
        kind: 'admin' as const,
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
        role: admin.role,
      };
    }
    const user = await ctx.prisma.user.findUnique({ where: { id: ctx.principal.userId } });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
    return { kind: 'trader' as const, ...publicUser(user) };
  }),
});

/** Public-safe projection of a trader (no hashes / Stripe ids). */
function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    city: user.city,
    trustStatus: user.trustStatus,
    accountStatus: user.accountStatus,
    paymentValid: user.paymentValid,
    emailVerified: user.emailVerifiedAt !== null,
  };
}
