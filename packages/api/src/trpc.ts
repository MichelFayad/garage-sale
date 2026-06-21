// tRPC initialisation — the typed contract shared by web (User Portal) and
// mobile. Context carries the Prisma client and the authenticated principal
// (resolved from a cookie session on web or a JWT bearer on mobile).

import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { prisma } from '@garage-sale/db';

export interface AuthPrincipal {
  userId: string;
  role: 'TRADER' | 'SUPER' | 'OPERATIONS' | 'SUPPORT';
}

export interface Context {
  prisma: typeof prisma;
  /** Null when the request is unauthenticated. */
  principal: AuthPrincipal | null;
}

/** Build a request context. Auth wiring (cookie/JWT) is filled in P2. */
export function createContext(opts?: { principal?: AuthPrincipal | null }): Context {
  return { prisma, principal: opts?.principal ?? null };
}

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

/** Requires an authenticated principal; narrows ctx.principal to non-null. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.principal) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, principal: ctx.principal } });
});
