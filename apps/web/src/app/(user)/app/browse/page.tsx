import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Browse' };

export default function BrowsePage() {
  return (
    <section className="py-8">
      <h1 className="text-2xl font-semibold">Browse</h1>
      <p className="mt-2 text-gray-600">
        Search and filter listings by category, condition, and distance. Lands P5.
      </p>
    </section>
  );
}
