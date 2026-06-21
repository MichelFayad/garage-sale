import type { User } from '@garage-sale/db';

/** Public-safe projection of a trader (no hashes / Stripe ids). */
export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    city: user.city,
    trustStatus: user.trustStatus,
    accountStatus: user.accountStatus,
    paymentValid: user.paymentValid,
    emailVerified: user.emailVerifiedAt !== null,
  };
}
