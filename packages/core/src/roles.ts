// Admin capability tiers, shared by the API (server-side gate) and the web/mobile
// UI (cosmetic control hiding). Higher tiers inherit everything below them:
// SUPPORT (view + moderation queues) < OPERATIONS (users/listings/categories) <
// SUPER (fee, platform settings, admin accounts). Kept here in core so it stays
// browser-safe — the auth package pulls bcryptjs and can't ship to the bundle.

export const ADMIN_RANK = { SUPPORT: 1, OPERATIONS: 2, SUPER: 3 } as const;

export type AdminTier = keyof typeof ADMIN_RANK;

/** True when `role` meets or exceeds the minimum tier. Unknown roles never qualify. */
export function meetsTier(role: string, min: AdminTier): boolean {
  return (ADMIN_RANK[role as AdminTier] ?? 0) >= ADMIN_RANK[min];
}
