// Trust logic — no fee involved (fee was already taken at post).
// Both confirm => COMPLETED. One confirms + the other misses the window =>
// non-confirmer flagged UNTRUSTED via cron sweep.

import { DEFAULT_CONFIRMATION_WINDOW_DAYS } from './constants.js';

/** Deadline by which the second party must confirm, given the first
 *  confirmation time. Past this with only one confirmation => flag. */
export function confirmationDeadline(
  firstConfirmedAt: Date,
  windowDays: number = DEFAULT_CONFIRMATION_WINDOW_DAYS,
): Date {
  return new Date(firstConfirmedAt.getTime() + windowDays * 24 * 60 * 60 * 1000);
}

/** Should the non-confirmer be flagged UNTRUSTED at sweep time `now`? */
export function shouldFlagUntrusted(args: {
  confirmationCount: number;
  firstConfirmedAt: Date | null;
  now: Date;
  windowDays?: number;
}): boolean {
  if (args.confirmationCount !== 1 || args.firstConfirmedAt === null) return false;
  return args.now > confirmationDeadline(args.firstConfirmedAt, args.windowDays);
}
