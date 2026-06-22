// Rate limiting — a pluggable limiter with an in-memory fixed-window default.
// The decision logic (consumeFixedWindow) is pure and unit-tested; the
// in-memory store just wraps it in a Map. The default limiter is per-process
// only, which is fine for a single instance / dev. For multi-instance prod
// (serverless), implement RateLimiter against a shared store (Redis) and swap
// it in — the consumers only depend on the interface.

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still permitted in the current window. */
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
  /** Ms until the caller may retry (0 when allowed). */
  retryAfterMs: number;
}

export interface RateLimitConfig {
  /** Max requests permitted per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
}

export interface RateLimiter {
  /** Record one hit for `key` and report whether it is permitted. */
  check(key: string): RateLimitResult;
}

export interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * Pure fixed-window decision. Returns the next state plus the result. A fresh
 * window starts when `now` is at/after the previous reset; the hit always
 * counts (so a blocked caller cannot keep the window alive by retrying — the
 * reset time is fixed at window start).
 */
export function consumeFixedWindow(
  state: WindowState | undefined,
  now: number,
  config: RateLimitConfig,
): { state: WindowState; result: RateLimitResult } {
  const active =
    state && now < state.resetAt ? state : { count: 0, resetAt: now + config.windowMs };
  const count = active.count + 1;
  const allowed = count <= config.limit;
  const next: WindowState = { count, resetAt: active.resetAt };
  return {
    state: next,
    result: {
      allowed,
      remaining: Math.max(0, config.limit - count),
      resetAt: active.resetAt,
      retryAfterMs: allowed ? 0 : active.resetAt - now,
    },
  };
}

/**
 * In-memory fixed-window limiter. Per-process state — see the file header for
 * the multi-instance caveat. Injectable clock for testing.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly store = new Map<string, WindowState>();

  constructor(
    private readonly config: RateLimitConfig,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const { state, result } = consumeFixedWindow(this.store.get(key), this.now(), this.config);
    this.store.set(key, state);
    // Keep the map bounded under churn of distinct keys (e.g. per-IP keys).
    if (this.store.size > 10_000) this.pruneExpired();
    return result;
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [k, v] of this.store) {
      if (now >= v.resetAt) this.store.delete(k);
    }
  }
}

const MINUTE = 60_000;

/** Named limiter presets for the auth-sensitive surfaces. Tune as needed. */
export const RATE_LIMITS = {
  /** Login attempts (credentials brute-force guard). */
  login: { limit: 10, windowMs: 15 * MINUTE },
  /** Account creation. */
  register: { limit: 5, windowMs: 60 * MINUTE },
  /** Email-bearing actions (reset/verification re-send) — abuse + spam guard. */
  emailLink: { limit: 5, windowMs: 60 * MINUTE },
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitName = keyof typeof RATE_LIMITS;
