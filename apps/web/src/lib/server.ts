// Server-side tRPC callers for React Server Components. Browser code uses the
// HTTP client in trpc.ts.
//
// - serverApi(): reads request headers to resolve the principal, so the same
//   access rules apply. Reading headers() opts the route into dynamic render —
//   use it only where a per-request principal is actually needed.
// - publicServerApi(): no headers, no principal. For public, cacheable data
//   (e.g. the public `content` router) so the route can be statically rendered
//   / ISR-cached instead of forced dynamic.

import { cache } from 'react';
import { headers } from 'next/headers';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

export async function serverApi() {
  const h = await headers();
  const ctx = await createContext({ headers: h as unknown as Headers });
  return appRouter.createCaller(ctx);
}

export async function publicServerApi() {
  const ctx = await createContext();
  return appRouter.createCaller(ctx);
}

/** Published CMS pages (footer nav + sitemap). `cache()` dedupes within a render. */
export const getPublishedPages = cache(async () => {
  const api = await publicServerApi();
  return api.content.published();
});

/** A single published CMS page by slug, or null if missing/draft. Cached per render. */
export const getPublishedPage = cache(async (slug: string) => {
  const api = await publicServerApi();
  try {
    return await api.content.bySlug({ slug });
  } catch (err) {
    // bySlug throws NOT_FOUND for unknown/draft slugs — callers treat null as
    // 404. Any other error is real and must surface, not masquerade as a 404.
    if (err instanceof TRPCError && err.code === 'NOT_FOUND') return null;
    throw err;
  }
});
