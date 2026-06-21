import type { Metadata } from 'next';
import Link from 'next/link';
import { MyListings } from './MyListings';

export const metadata: Metadata = { title: 'My listings' };

export default function ListingsPage() {
  return (
    <section className="py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My listings</h1>
        <Link href="/app/listings/new" className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
          New listing
        </Link>
      </div>
      <MyListings />
    </section>
  );
}
