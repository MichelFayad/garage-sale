// Server-side tRPC callers for React Server Components. Browser code uses the
// HTTP client in trpc.ts.
//
// - serverApi(): reads request headers to resolve the principal, so the same
//   access rules apply. Reading headers() opts the route into dynamic render —
//   use it only where a per-request principal is actually needed.
// - publicServerApi(): no headers, no principal. For public, cacheable data
//   (e.g. the public `content` router) so the route can be statically rendered
//   / ISR-cached instead of forced dynamic.

import { unstable_cache } from 'next/cache';
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

// Tag scheme: every cache entry below carries the shared 'content' tag, so a
// single `revalidateTag('content')` (see admin/content/actions.ts) purges the
// published-pages list *and* every per-slug page in one call — admin edits can
// change both the list (publish/unpublish/delete) and the page body, and we'd
// rather over-purge than serve stale content. `getPublishedPage` additionally
// carries a `content:<slug>` tag for callers that want to scope a purge to one
// page without nuking the list cache. `revalidate: 3600` is kept as the
// time-based fallback matching the page-level ISR window (P11) — the tag purge
// is now the on-demand path, this is just the safety net if it's ever missed.

/** Published CMS pages (footer nav + sitemap). Tag-purged on admin content mutations. */
export const getPublishedPages = unstable_cache(
  async () => {
    const api = await publicServerApi();
    return api.content.published();
  },
  ['content-published-pages'],
  { tags: ['content'], revalidate: 3600 },
);

/** A single published CMS page by slug, or null if missing/draft. Tag-purged on edit. */
export async function getPublishedPage(slug: string) {
  return unstable_cache(
    async () => {
      const api = await publicServerApi();
      try {
        return await api.content.bySlug({ slug });
      } catch (err) {
        // bySlug throws NOT_FOUND for unknown/draft slugs — callers treat null
        // as 404. Any other error is real and must surface, not masquerade as
        // a 404.
        if (err instanceof TRPCError && err.code === 'NOT_FOUND') return null;
        throw err;
      }
    },
    ['content-page-by-slug', slug],
    { tags: ['content', `content:${slug}`], revalidate: 3600 },
  )();
}
