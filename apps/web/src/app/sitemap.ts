import type { MetadataRoute } from 'next';

// Public marketing routes only — the trader (/app) and admin (/admin) portals are
// auth-gated and excluded (see robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const routes = ['', '/how-it-works', '/pricing', '/login', '/register'];
  const lastModified = new Date();
  return routes.map((route) => ({ url: `${base}${route}`, lastModified }));
}
