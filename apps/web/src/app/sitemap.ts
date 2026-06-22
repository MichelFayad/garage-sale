import type { MetadataRoute } from 'next';
import { getPublishedPages } from '../lib/server';

// Public marketing routes only — the trader (/app) and admin (/admin) portals are
// auth-gated and excluded (see robots.ts). Published CMS pages are appended from
// the content router so legal/marketing pages stay indexed automatically.
// ISR: regenerated hourly rather than on every crawl.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const lastModified = new Date();
  const staticRoutes = ['', '/how-it-works', '/pricing', '/login', '/register'].map((route) => ({
    url: `${base}${route}`,
    lastModified,
  }));

  const pages = await getPublishedPages();
  const cmsRoutes = pages.map((p) => ({
    url: `${base}/${p.slug}`,
    lastModified: p.updatedAt,
  }));

  return [...staticRoutes, ...cmsRoutes];
}
