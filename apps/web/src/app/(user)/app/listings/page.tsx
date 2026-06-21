import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'My listings' };

export default function ListingsPage() {
  return (
    <section className="py-8">
      <h1 className="text-2xl font-semibold">My listings</h1>
      <p className="mt-2 text-gray-600">
        Create and manage your Have/Want listings here. Lands P5; publish charge P4.
      </p>
    </section>
  );
}
