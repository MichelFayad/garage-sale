// Auth router — credentials path (register/login/refresh/me) issuing JWT pairs
// for both web (session cookie) and mobile (bearer), plus email verification and
// password reset. OAuth (Google/Apple/Facebook) lands in apps/web (Auth.js).

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { EmailType, type PrismaClient } from '@garage-sale/db';
import {
  createTokenPair,
  hashPassword,
  type TokenClaims,
  verifyPassword,
  verifyToken,
} from '@garage-sale/auth';
import { protectedProcedure, publicProcedure, router } from '../trpc.js';
import { appBaseUrl, sendEmail } from '../email.js';
import { consumeVerificationToken, issueVerificationToken } from '../verification.js';
import { publicUser } from '../user.js';

/** Email a verification link to a freshly registered or re-requesting trader. */
async function sendVerificationEmail(
  prisma: PrismaClient,
  user: { id: string; email: string; displayName: string },
) {
  const token = await issueVerificationToken(prisma, user.id, 'EMAIL_VERIFICATION');
  const link = `${appBaseUrl()}/verify-email?token=${token}`;
  await sendEmail(prisma, {
    type: EmailType.EMAIL_VERIFICATION,
    toEmail: user.email,
    userId: user.id,
    subject: 'Verify your Garage Sale email',
    body: `Hi ${user.displayName}, confirm your email to start trading: ${link}`,
  });
}

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
        },
      });
      await sendVerificationEmail(ctx.prisma, user);
      // No tokens yet — the trader must verify their email before logging in.
      return { user: publicUser(user), verificationRequired: true };
    }),

  /** Re-send the verification link. Silent on unknown/verified email (no enumeration). */
  resendVerification: publicProcedure
    .input(z.object({ email: z.string().email().toLowerCase() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({ where: { email: input.email } });
      if (user && !user.emailVerifiedAt && user.accountStatus !== 'BANNED') {
        await sendVerificationEmail(ctx.prisma, user);
      }
      return { ok: true };
    }),

  /** Consume a verification token and mark the trader's email verified. */
  verifyEmail: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const consumed = await consumeVerificationToken(
        ctx.prisma,
        input.token,
        'EMAIL_VERIFICATION',
      );
      if (!consumed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid or expired link' });
      }
      await ctx.prisma.user.update({
        where: { id: consumed.userId },
        data: { emailVerifiedAt: new Date() },
      });
      return { ok: true };
    }),

  /** Start a password reset. Silent on unknown/OAuth-only email (no enumeration). */
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email().toLowerCase() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({ where: { email: input.email } });
      if (user && user.passwordHash && user.accountStatus !== 'BANNED') {
        const token = await issueVerificationToken(ctx.prisma, user.id, 'PASSWORD_RESET');
        const link = `${appBaseUrl()}/reset-password?token=${token}`;
        await sendEmail(ctx.prisma, {
          type: EmailType.PASSWORD_RESET,
          toEmail: user.email,
          userId: user.id,
          subject: 'Reset your Garage Sale password',
          body: `Reset your password (link valid 1 hour): ${link}`,
        });
      }
      return { ok: true };
    }),

  /** Consume a reset token and set a new password. */
  resetPassword: publicProcedure
    .input(z.object({ token: z.string().min(1), password: z.string().min(8).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const consumed = await consumeVerificationToken(ctx.prisma, input.token, 'PASSWORD_RESET');
      if (!consumed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid or expired link' });
      }
      await ctx.prisma.user.update({
        where: { id: consumed.userId },
        data: { passwordHash: await hashPassword(input.password) },
      });
      return { ok: true };
    }),

  login: publicProcedure.input(credentials).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
    }
    if (user.accountStatus === 'BANNED') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Account banned' });
    }
    if (!user.emailVerifiedAt) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Email not verified' });
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
