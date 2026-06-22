import type { Metadata } from 'next';
import { SITE } from '../lib/site';
import { Analytics } from '../components/Analytics';
import './globals.css';

// Global SEO defaults. Per-page metadata (title/description) merges over these;
// the title template appends "· Garage Sale". OpenGraph/Twitter/robots cascade
// to every route unless a page overrides them.
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.name,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: ['item swap', 'barter', 'trade', 'local marketplace', 'peer-to-peer', 'garage sale'],
  authors: [{ name: SITE.name }],
  icons: { icon: '/icon.svg' },
  // Share images come from the opengraph-image.tsx file-convention, which Next
  // injects into both OG and Twitter — no explicit image URLs needed here.
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    title: SITE.name,
    description: SITE.description,
    url: SITE.url,
    locale: SITE.locale,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE.name,
    description: SITE.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
