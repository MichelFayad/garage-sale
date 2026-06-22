// Auth router guard + rate-limit tests. These exercise the procedures through
// the tRPC caller with a mocked Prisma client, asserting the branches that
// short-circuit *before* any password hashing or token signing (so no crypto
// secrets / DB are required).

import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { appRouter } from '../root.js';
import type { Context } from '../trpc.js';

/** Minimal Prisma stub: supply only the methods a given test reaches. */
function caller(prisma: Record<string, unknown>, ip: string | null = null) {
  const ctx = { prisma, principal: null, ip } as unknown as Context;
  return appRouter.createCaller(ctx);
}

/** Run `fn` and return the thrown TRPCError code (or throw if it didn't throw). */
async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof TRPCError) return err.code;
    throw err;
  }
  throw new Error('expected the call to throw');
}

describe('auth.register', () => {
  it('rejects an already-registered email with CONFLICT', async () => {
    const api = caller({ user: { findUnique: async () => ({ id: 'u1' }) } });
    const code = await codeOf(() =>
      api.auth.register({ email: 'taken@example.com', password: 'password123', displayName: 'A' }),
    );
    expect(code).toBe('CONFLICT');
  });
});

describe('auth.login', () => {
  it('rejects an unknown email with UNAUTHORIZED', async () => {
    const api = caller({ user: { findUnique: async () => null } });
    const code = await codeOf(() =>
      api.auth.login({ email: 'nobody@example.com', password: 'password123' }),
    );
    expect(code).toBe('UNAUTHORIZED');
  });
});

describe('rate limiting', () => {
  it('throws TOO_MANY_REQUESTS after the login limit for one IP', async () => {
    // Unique IP so the per-process limiter state can't be tripped by other tests.
    const ip = '203.0.113.77';
    const api = caller({ user: { findUnique: async () => null } }, ip);

    // The login preset allows 10 / window; the first 10 fail auth, the 11th is
    // rejected by the limiter before touching the DB.
    const codes: string[] = [];
    for (let i = 0; i < 11; i++) {
      codes.push(
        await codeOf(() => api.auth.login({ email: 'x@example.com', password: 'pw123456' })),
      );
    }
    expect(codes.slice(0, 10).every((c) => c === 'UNAUTHORIZED')).toBe(true);
    expect(codes[10]).toBe('TOO_MANY_REQUESTS');
  });
});
