// Server-side principal resolver for RSC/layouts. Mirrors how the CSV export route
// authenticates: build the tRPC context from the request headers and read the
// principal off it. Used to drive cosmetic role-based UI (the API still enforces
// every tier with requireTier — UI hiding is convenience, not a security boundary).

import { headers } from 'next/headers';
import { createContext, type AuthPrincipal } from '@garage-sale/api';

export async function getPrincipal(): Promise<AuthPrincipal | null> {
  const h = await headers();
  const ctx = await createContext({ headers: h as unknown as Headers });
  return ctx.principal;
}
