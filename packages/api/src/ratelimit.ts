// API-side rate limiting — holds the limiter singletons (one per named preset)
// and a helper that throws TOO_MANY_REQUESTS. Keyed by client IP so a single
// caller can't brute-force credentials or spam email links. The default store
// is in-memory (per-process); swap @garage-sale/core's RateLimiter for a
// shared-store implementation at deploy for cross-instance limits.

import { TRPCError } from '@trpc/server';
import { InMemoryRateLimiter, RATE_LIMITS, type RateLimitName } from '@garage-sale/core';

const limiters: Record<RateLimitName, InMemoryRateLimiter> = {
  login: new InMemoryRateLimiter(RATE_LIMITS.login),
  register: new InMemoryRateLimiter(RATE_LIMITS.register),
  emailLink: new InMemoryRateLimiter(RATE_LIMITS.emailLink),
};

/**
 * Enforce the named limit for `ip`. No-op throw-free pass when `ip` is null
 * (we can't key it) — the limiter is a guard, not the auth boundary.
 */
export function enforceRateLimit(name: RateLimitName, ip: string | null): void {
  if (!ip) return;
  const result = limiters[name].check(`${name}:${ip}`);
  if (!result.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Too many requests. Try again in ${Math.ceil(result.retryAfterMs / 1000)}s.`,
    });
  }
}
