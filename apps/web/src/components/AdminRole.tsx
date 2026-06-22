'use client';

// Client-side admin role context. The server layout reads the principal and feeds
// the role in; client components call useCan() to hide controls above their tier.
// Purely cosmetic — the API enforces every tier server-side via requireTier.

import { createContext, useContext } from 'react';
import { type AdminTier, meetsTier } from '@garage-sale/core';

const RoleContext = createContext<string>('');

export function AdminRoleProvider({ role, children }: { role: string; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

/** The current admin's role (empty string if unknown). */
export function useAdminRole(): string {
  return useContext(RoleContext);
}

/** Returns a predicate: can(min) is true when the admin meets that tier. */
export function useCan(): (min: AdminTier) => boolean {
  const role = useContext(RoleContext);
  return (min) => meetsTier(role, min);
}
