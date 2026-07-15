import type { Metadata } from 'next';
import { DashboardClient } from './DashboardClient';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <section className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">Your dashboard</h1>
      <DashboardClient />
    </section>
  );
}
