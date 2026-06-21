import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Fee · Admin' };

export default function AdminFeePage() {
  return (
    <section className="py-8">
      <h1 className="text-2xl font-semibold">Service fee</h1>
      <p className="mt-2 text-gray-600">
        Set the flat per-post fee with append-only version history. Lands P9.
      </p>
    </section>
  );
}
