import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Trades' };

export default function TradesPage() {
  return (
    <section className="py-8">
      <h1 className="text-2xl font-semibold">Trades</h1>
      <p className="mt-2 text-gray-600">
        Trade proposals, messaging, and dual-confirm appear here. Lands P6–P7.
      </p>
    </section>
  );
}
