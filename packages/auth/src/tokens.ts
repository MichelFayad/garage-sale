// Opaque random tokens for email verification / password reset links.
// Kept out of jwt.ts so that module stays edge-runtime safe (jose only).

import { createHash, randomBytes } from 'node:crypto';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** SHA-256 of an opaque token — only the hash is persisted; the raw token is emailed. */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
