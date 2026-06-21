// tRPC initialisation — the typed contract shared by web (User Portal) and
// mobile. Context carries the Prisma client and the authenticated principal,
// resolved from a JWT: a bearer header (mobile) or the session cookie (web).

import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { prisma } from '@garage-sale/db';
import { type AccountStatus, type Role, SESSION_COOKIE, verifyToken } from '@garage-sale/auth';

export interface AuthPrincipal {
  userId: string;
  role: Role;
  accountStatus: AccountStatus;
}

export interface Context {
  prisma: typeof prisma;
  /** Null when the request is unauthenticated. */
  principal: AuthPrincipal | null;
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Resolve the access token from an Authorization bearer or session cookie. */
function accessTokenFromHeaders(headers: Headers): string | null {
  const auth = headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return parseCookie(headers.get('cookie'), SESSION_COOKIE);
}

/** Build a request context from incoming headers (web route / mobile fetch). */
export async function createContext(opts?: { headers?: Headers }): Promise<Context> {
  let principal: AuthPrincipal | null = null;
  const token = opts?.headers ? accessTokenFromHeaders(opts.headers) : null;
  if (token) {
    try {
      const claims = await verifyToken(token, 'access');
      principal = {
        userId: claims.sub,
        role: claims.role,
        accountStatus: claims.accountStatus,
      };
    } catch {
      // invalid/expired token → unauthenticated
    }
  }
  return { prisma, principal };
}

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

/** Requires an authenticated, non-suspended principal. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.principal) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  if (ctx.principal.accountStatus !== 'ACTIVE') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Account is not active' });
  }
  return next({ ctx: { ...ctx, principal: ctx.principal } });
});

/** Requires an admin-role principal. */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.principal.role === 'TRADER') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
  }
  return next({ ctx });
});
