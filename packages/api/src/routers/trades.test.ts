// trades.unreadMessageCount guard + query-shape tests. Mocked Prisma client,
// no DB — mirrors the pattern in routers/auth.test.ts.

import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { appRouter } from '../root.js';
import type { Context } from '../trpc.js';

function caller(
  prisma: Record<string, unknown>,
  principal: { userId: string; role: 'TRADER' | 'ADMIN'; accountStatus: 'ACTIVE' } | null,
) {
  const ctx = { prisma, principal, ip: null } as unknown as Context;
  return appRouter.createCaller(ctx);
}

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof TRPCError) return err.code;
    throw err;
  }
  throw new Error('expected the call to throw');
}

describe('trades.unreadMessageCount', () => {
  it('rejects a non-trader principal with FORBIDDEN', async () => {
    const api = caller(
      { message: { count: async () => 0 } },
      { userId: 'admin1', role: 'ADMIN', accountStatus: 'ACTIVE' },
    );
    const code = await codeOf(() => api.trades.unreadMessageCount());
    expect(code).toBe('FORBIDDEN');
  });

  it('returns the count from prisma.message.count', async () => {
    const api = caller(
      { message: { count: async () => 3 } },
      { userId: 'u1', role: 'TRADER', accountStatus: 'ACTIVE' },
    );
    const result = await api.trades.unreadMessageCount();
    expect(result).toEqual({ count: 3 });
  });

  it("scopes the count to unread messages from other participants in the caller's proposals", async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    const api = caller(
      {
        message: {
          count: async (args: { where: Record<string, unknown> }) => {
            capturedWhere = args.where;
            return 0;
          },
        },
      },
      { userId: 'u1', role: 'TRADER', accountStatus: 'ACTIVE' },
    );

    await api.trades.unreadMessageCount();

    expect(capturedWhere).toEqual({
      readAt: null,
      senderId: { not: 'u1' },
      proposal: { OR: [{ proposerId: 'u1' }, { ownerId: 'u1' }] },
    });
  });
});
