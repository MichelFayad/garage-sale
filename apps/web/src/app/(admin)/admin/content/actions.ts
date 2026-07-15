'use server';

// Server action bridging the client-side CMS admin (ContentClient.tsx) to
// Next's cache invalidation. `revalidateTag` is server-only, so a client
// component can't call it directly — this thin action is the hop.
//
// Tag scheme (see lib/server.ts): every public content cache carries the
// shared 'content' tag; `getPublishedPage` additionally carries a per-slug
// `content:<slug>` tag. We always purge 'content' — any admin mutation
// (create, edit, publish/unpublish, delete) can change what the public
// pages list/sitemap/footer nav show, not just the one page — and purge the
// slug tag too when known, for a tighter, more direct scope on that page.

import { revalidateTag } from 'next/cache';

export async function revalidateContentCache(slug?: string) {
  revalidateTag('content');
  if (slug) revalidateTag(`content:${slug}`);
}
