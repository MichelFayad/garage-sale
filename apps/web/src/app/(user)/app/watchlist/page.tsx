import type { Metadata } from 'next';
import { WatchlistClient } from './WatchlistClient';

export const metadata: Metadata = { title: 'Watchlist' };

export default function WatchlistPage() {
  return (
    <section className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">Watchlist</h1>
      <WatchlistClient />
    </section>
  );
}
