import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Reports · Admin' };

export default function AdminReportsPage() {
  return (
    <section className="py-8">
      <h1 className="text-2xl font-semibold">Reports & flags</h1>
      <p className="mt-2 text-gray-600">
        Report queue, untrusted-flag review, and exports. Lands P9.
      </p>
    </section>
  );
}
