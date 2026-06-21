import type { Metadata } from 'next';
import { BrowseClient } from './BrowseClient';

export const metadata: Metadata = { title: 'Browse' };

export default function BrowsePage() {
  return (
    <section className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">Browse</h1>
      <BrowseClient />
    </section>
  );
}
