import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Listings · Admin' };

export default function AdminListingsPage() {
  return (
    <section className="py-8">
      <h1 className="text-2xl font-semibold">Listings</h1>
      <p className="mt-2 text-gray-600">
        Moderate listings and manage categories/prohibited keywords. Lands P9.
      </p>
    </section>
  );
}
