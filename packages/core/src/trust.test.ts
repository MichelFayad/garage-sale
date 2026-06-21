import { describe, expect, it } from 'vitest';
import { confirmationDeadline, shouldFlagUntrusted } from './trust.js';

describe('confirmationDeadline', () => {
  it('adds the default 7-day window', () => {
    const start = new Date('2026-06-01T00:00:00Z');
    expect(confirmationDeadline(start).toISOString()).toBe('2026-06-08T00:00:00.000Z');
  });

  it('honours a custom window', () => {
    const start = new Date('2026-06-01T00:00:00Z');
    expect(confirmationDeadline(start, 3).toISOString()).toBe('2026-06-04T00:00:00.000Z');
  });
});

describe('shouldFlagUntrusted', () => {
  const firstConfirmedAt = new Date('2026-06-01T00:00:00Z');

  it('flags when one confirmed and the window has passed', () => {
    expect(
      shouldFlagUntrusted({
        confirmationCount: 1,
        firstConfirmedAt,
        now: new Date('2026-06-09T00:00:00Z'),
      }),
    ).toBe(true);
  });

  it('does not flag inside the window', () => {
    expect(
      shouldFlagUntrusted({
        confirmationCount: 1,
        firstConfirmedAt,
        now: new Date('2026-06-05T00:00:00Z'),
      }),
    ).toBe(false);
  });

  it('does not flag when both confirmed', () => {
    expect(
      shouldFlagUntrusted({
        confirmationCount: 2,
        firstConfirmedAt,
        now: new Date('2026-07-01T00:00:00Z'),
      }),
    ).toBe(false);
  });
});
