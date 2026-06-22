import { describe, expect, it } from 'vitest';
import { consumeFixedWindow, InMemoryRateLimiter, type WindowState } from './ratelimit.js';

const config = { limit: 3, windowMs: 1000 };

describe('consumeFixedWindow', () => {
  it('opens a fresh window on the first hit', () => {
    const { state, result } = consumeFixedWindow(undefined, 0, config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(state).toEqual({ count: 1, resetAt: 1000 });
  });

  it('allows up to the limit then blocks within the window', () => {
    let state: WindowState | undefined;
    const results = [];
    for (let i = 0; i < 4; i++) {
      const out = consumeFixedWindow(state, 100, config);
      state = out.state;
      results.push(out.result.allowed);
    }
    expect(results).toEqual([true, true, true, false]);
  });

  it('reports retryAfterMs from the fixed reset when blocked', () => {
    let state: WindowState | undefined;
    for (let i = 0; i < 3; i++) state = consumeFixedWindow(state, 0, config).state;
    const blocked = consumeFixedWindow(state, 400, config);
    expect(blocked.result.allowed).toBe(false);
    expect(blocked.result.retryAfterMs).toBe(600);
  });

  it('starts a new window once the previous one resets', () => {
    let state: WindowState | undefined;
    for (let i = 0; i < 3; i++) state = consumeFixedWindow(state, 0, config).state;
    const next = consumeFixedWindow(state, 1000, config);
    expect(next.result.allowed).toBe(true);
    expect(next.state.resetAt).toBe(2000);
  });
});

describe('InMemoryRateLimiter', () => {
  it('tracks keys independently', () => {
    let clock = 0;
    const limiter = new InMemoryRateLimiter(config, () => clock);
    for (let i = 0; i < 3; i++) limiter.check('a');
    expect(limiter.check('a').allowed).toBe(false);
    // Distinct key has its own budget.
    expect(limiter.check('b').allowed).toBe(true);
    // After the window elapses, 'a' is allowed again.
    clock = 1000;
    expect(limiter.check('a').allowed).toBe(true);
  });
});
