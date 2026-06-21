// Platform-wide constants. Values that admins can change live (fee amount,
// confirmation window) are stored in the DB; these are defaults / hard limits.

/** Max photos per listing (app-enforced, see ListingPhoto). */
export const MAX_LISTING_PHOTOS = 10;

/** Default days after first one-sided confirmation before the non-confirmer
 *  is flagged UNTRUSTED. Overridable via PlatformSetting.confirmationWindowDays. */
export const DEFAULT_CONFIRMATION_WINDOW_DAYS = 7;

/** Placeholder default per-post fee (USD cents) until a real value is provided.
 *  Persisted/overridden by ServiceFeeConfig. */
export const DEFAULT_POST_FEE_CENTS = 199;
