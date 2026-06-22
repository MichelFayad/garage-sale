import type { MetadataRoute } from 'next';
import { SITE } from '../lib/site';

// PWA web manifest (served at /manifest.webmanifest). Mostly informational for
// the marketing site; the installable mobile experience is the Expo app (P12).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#111827',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
