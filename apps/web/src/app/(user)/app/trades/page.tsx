import type { Metadata } from 'next';
import { TradesClient } from './TradesClient';

export const metadata: Metadata = { title: 'Trades' };

export default function TradesPage() {
  return (
    <section className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">Trades</h1>
      <TradesClient />
    </section>
  );
}
