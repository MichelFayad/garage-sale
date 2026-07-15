// Redis-backed RateLimiter — an opt-in alternative to InMemoryRateLimiter for
// multi-instance/serverless deploys, where per-process state in ratelimit.ts
// doesn't share a limit across instances. Not wired in anywhere by default;
// packages/api/src/ratelimit.ts still uses InMemoryRateLimiter. To adopt this
// at deploy time, construct a RedisRateLimiter per preset against a real
// client (see RedisLikeClient below) and swap it into that file's `limiters`
// map — no other call site changes, since it implements the same
// synchronous RateLimiter interface.
//
// Client shape & why incr/pexpire/pttl instead of EVAL:
// RedisLikeClient models the three primitives (INCR/PEXPIRE/PTTL) rather than
// requiring a Lua-scripting-capable client. Every Redis-compatible service
// (self-hosted, ioredis, node-redis, Upstash's REST client, etc.) supports
// these three commands, whereas EVAL support and calling conventions vary
// more across drivers/proxies. The cost is that the increment and the TTL
// assignment are two separate calls, not one atomic script.
//
// The race this creates: between `incr` (count becomes 1, opening a window)
// and the following `pexpire`, a crash or thrown error would leave a counter
// key with no expiry — silently locking that key at its last count forever
// instead of expiring normally. We accept this (the standard tradeoff for the
// incr+expire pattern, vs. the single-round-trip complexity of EVAL/Lua or a
// WATCH/MULTI transaction) and bound the damage: `check` treats *any* key
// that reports a missing TTL (`pttl < 0`, not just a fresh count of 1) as the
// start of a window and reissues `pexpire`. So a key stuck without a TTL
// self-heals on its very next hit rather than leaking forever.
//
// Sync vs. async: this mirrors the existing (synchronous) RateLimiter and
// consumeFixedWindow contract exactly, so RedisLikeClient's methods are
// modeled as synchronous return values — that's what makes this a true
// drop-in for InMemoryRateLimiter today, with zero call-site changes. Real
// Redis clients are promise-based, so wiring a live client in means adapting
// it to this synchronous shape isn't possible for a real network call;
// deploying against actual Redis means widening `RateLimiter.check` (and its
// one caller in packages/api/src/ratelimit.ts) to `Promise<RateLimitResult>`
// and awaiting it. That widening is intentionally out of scope here — this
// class defines the algorithm and interface shape now; making the call site
// async is the deploy-time follow-up.
//
// Window semantics vs. consumeFixedWindow: the decision *shape* (allowed /
// remaining / resetAt / retryAfterMs) and behavior (a hit always counts, even
// once blocked) match consumeFixedWindow exactly, so results are
// interchangeable with InMemoryRateLimiter's. The pure function itself isn't
// reused byte-for-byte, though: consumeFixedWindow models a window as
// explicit `{ count, resetAt }` state read-modify-written by the caller,
// while Redis's TTL *is* the window countdown — there's no separate resetAt
// to store or compare against "now" for expiry, PTTL already tells us the ms
// remaining. Re-deriving a resetAt timestamp from PTTL and calling
// consumeFixedWindow would mean parsing Redis's own countdown back into fake
// state just to recompute what PTTL already said, so the window arithmetic
// is inlined here instead.

import type { RateLimitConfig, RateLimitResult, RateLimiter } from './ratelimit.js';

/**
 * The minimal Redis primitives RedisRateLimiter needs. Adapt whatever client
 * the deploy environment provides (ioredis, node-redis, Upstash, ...) to this
 * shape — e.g. `incr: (key) => client.incr(key)` awaited at the call site
 * once the surrounding RateLimiter contract is made async (see file header).
 */
export interface RedisLikeClient {
  /** INCR: atomically increments the integer at `key` (creating it at 1 if absent) and returns the new value. */
  incr(key: string): number;
  /** PEXPIRE: sets a TTL of `ms` milliseconds on `key`. No-op if the key doesn't exist. */
  pexpire(key: string, ms: number): void;
  /** PTTL: ms remaining before `key` expires. -1 = exists with no TTL, -2 = key doesn't exist. */
  pttl(key: string): number;
}

/**
 * Redis-backed fixed-window limiter. See the file header for the client
 * shape, the incr/pexpire race this accepts (and self-heals), and why it's
 * synchronous today. Injectable clock for testing, matching
 * InMemoryRateLimiter.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly client: RedisLikeClient,
    private readonly config: RateLimitConfig,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const count = this.client.incr(key);
    let ttl = this.client.pttl(key);
    // A fresh key (count === 1) needs its window TTL set. So does any key
    // that reports no TTL at all (pttl < 0) — that's either a brand-new key
    // racing with a concurrent first hit, or the self-heal case described in
    // the file header (a prior process incremented but crashed before
    // calling pexpire). Either way, (re)issuing pexpire here bounds the
    // window to config.windowMs from *this* observation.
    if (count === 1 || ttl < 0) {
      this.client.pexpire(key, this.config.windowMs);
      ttl = this.config.windowMs;
    }
    const allowed = count <= this.config.limit;
    return {
      allowed,
      remaining: Math.max(0, this.config.limit - count),
      resetAt: this.now() + ttl,
      retryAfterMs: allowed ? 0 : ttl,
    };
  }
}
