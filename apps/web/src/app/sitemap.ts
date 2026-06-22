import type { MetadataRoute } from 'next';
import { serverApi } from '../lib/server';

// Public marketing routes only — the trader (/app) and admin (/admin) portals are
// auth-gated and excluded (see robots.ts). Published CMS pages are appended from
// the content router so legal/marketing pages stay indexed automatically.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const lastModified = new Date();
  const staticRoutes = ['', '/how-it-works', '/pricing', '/login', '/register'].map((route) => ({
    url: `${base}${route}`,
    lastModified,
  }));

  const api = await serverApi();
  const pages = await api.content.published();
  const cmsRoutes = pages.map((p) => ({
    url: `${base}/${p.slug}`,
    lastModified: p.updatedAt,
  }));

  return [...staticRoutes, ...cmsRoutes];
}
