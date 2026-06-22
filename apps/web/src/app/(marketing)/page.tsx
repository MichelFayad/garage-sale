import type { Metadata } from 'next';
import { SITE, siteUrl } from '../../lib/site';

export const metadata: Metadata = {
  // Home owns the bare brand title (no template suffix) + canonical root.
  title: SITE.name,
  description: SITE.description,
  alternates: { canonical: '/' },
};

// Organization + WebSite JSON-LD so search engines can surface the brand and a
// sitelinks search box. Rendered as a single graph in one ld+json script.
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': siteUrl('/#organization'),
      name: SITE.name,
      url: SITE.url,
      description: SITE.description,
    },
    {
      '@type': 'WebSite',
      '@id': siteUrl('/#website'),
      url: SITE.url,
      name: SITE.name,
      publisher: { '@id': siteUrl('/#organization') },
    },
  ],
};

export default function HomePage() {
  return (
    <section className="py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <h1 className="text-4xl font-bold">Swap what you have for what you want.</h1>
      <p className="mt-4 max-w-prose text-lg text-gray-600">
        Garage Sale is a local, peer-to-peer item-swap marketplace. List what you have, find what
        you want, and trade with neighbours. A small flat fee applies per published listing.
      </p>
    </section>
  );
}
