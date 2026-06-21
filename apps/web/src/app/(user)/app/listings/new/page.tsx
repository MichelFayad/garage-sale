import type { Metadata } from 'next';
import { ListingForm } from '../ListingForm';

export const metadata: Metadata = { title: 'New listing' };

export default function NewListingPage() {
  return (
    <section className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">New listing</h1>
      <ListingForm />
    </section>
  );
}
