// Opaque random tokens for email verification / password reset links.
// Kept out of jwt.ts so that module stays edge-runtime safe (jose only).

import { randomBytes } from 'node:crypto';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
