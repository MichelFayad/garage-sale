// Shared site metadata — the single source for SEO defaults, structured data,
// and the web manifest. Keep marketing copy here so titles/descriptions stay
// consistent across <head>, OpenGraph, Twitter cards, and JSON-LD.

export const SITE = {
  name: 'Garage Sale',
  // Short tagline used as the default OG/Twitter description.
  description: 'Swap what you have for what you want. A local, peer-to-peer item-swap marketplace.',
  // Canonical origin. metadataBase + sitemap/robots all derive from this.
  url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  locale: 'en_US',
  twitter: '@garagesale',
} as const;

export const siteUrl = (path = ''): string => `${SITE.url}${path}`;
