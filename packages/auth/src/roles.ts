// Shared role model. Traders use the User table; staff use AdminUser.
// The session carries the role so middleware can route + guard.

export type TraderRole = 'TRADER';
export type AdminRole = 'SUPER' | 'OPERATIONS' | 'SUPPORT';
export type Role = TraderRole | AdminRole;

export const ADMIN_ROLES: readonly AdminRole[] = ['SUPER', 'OPERATIONS', 'SUPPORT'];

export function isAdminRole(role: Role): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

export type OAuthProvider = 'GOOGLE' | 'APPLE' | 'FACEBOOK';
