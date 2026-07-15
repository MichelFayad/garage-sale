import { describe, expect, it } from 'vitest';
import { RedisRateLimiter, type RedisLikeClient } from './ratelimit-redis.js';

const config = { limit: 3, windowMs: 1000 };

/**
 * Minimal in-memory fake of a Redis client exposing the incr/pexpire/pttl
 * primitives RedisRateLimiter needs. No real Redis required. Mirrors real
 * Redis semantics closely enough for the limiter's behavior: an expired key
 * is treated as gone, and pttl reports -1/-2 the same way Redis does.
 */
class FakeRedisClient implements RedisLikeClient {
  private readonly store = new Map<string, { value: number; expiresAt: number | null }>();

  constructor(private readonly now: () => number) {}

  incr(key: string): number {
    const entry = this.store.get(key);
    const live = entry && (entry.expiresAt === null || this.now() < entry.expiresAt);
    if (!live) {
      this.store.set(key, { value: 1, expiresAt: null });
      return 1;
    }
    entry.value += 1;
    return entry.value;
  }

  pexpire(key: string, ms: number): void {
    const entry = this.store.get(key);
    if (!entry) return;
    entry.expiresAt = this.now() + ms;
  }

  pttl(key: string): number {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    const remaining = entry.expiresAt - this.now();
    return remaining > 0 ? remaining : -2;
  }
}

describe('RedisRateLimiter', () => {
  it('allows the first request in a window', () => {
    const clock = 0;
    const limiter = new RedisRateLimiter(new FakeRedisClient(() => clock), config, () => clock);
    const result = limiter.check('a');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.resetAt).toBe(1000);
  });

  it('allows requests within the limit', () => {
    const clock = 0;
    const limiter = new RedisRateLimiter(new FakeRedisClient(() => clock), config, () => clock);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('denies requests once the limit is exceeded', () => {
    const clock = 0;
    const limiter = new RedisRateLimiter(new FakeRedisClient(() => clock), config, () => clock);
    for (let i = 0; i < 3; i++) limiter.check('a');
    const blocked = limiter.check('a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('starts a fresh window once the previous one expires', () => {
    let clock = 0;
    const limiter = new RedisRateLimiter(new FakeRedisClient(() => clock), config, () => clock);
    for (let i = 0; i < 3; i++) limiter.check('a');
    expect(limiter.check('a').allowed).toBe(false);
    clock = 1000; // window elapsed
    const next = limiter.check('a');
    expect(next.allowed).toBe(true);
    expect(next.remaining).toBe(2);
    expect(next.resetAt).toBe(2000);
  });

  it('tracks keys independently', () => {
    const clock = 0;
    const limiter = new RedisRateLimiter(new FakeRedisClient(() => clock), config, () => clock);
    for (let i = 0; i < 3; i++) limiter.check('a');
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b').allowed).toBe(true);
  });

  it('self-heals a key whose TTL was never set (e.g. a crash between incr and pexpire)', () => {
    const clock = 0;
    const client = new FakeRedisClient(() => clock);
    // Simulate the documented race directly against the fake: a raw incr
    // with no pexpire call, leaving the key permanently un-expiring.
    client.incr('a');
    const limiter = new RedisRateLimiter(client, config, () => clock);
    const result = limiter.check('a');
    // The limiter observes the missing TTL (pttl === -1) and reissues
    // pexpire itself, so the key doesn't stay stuck forever.
    expect(result.resetAt).toBe(1000);
  });
});
