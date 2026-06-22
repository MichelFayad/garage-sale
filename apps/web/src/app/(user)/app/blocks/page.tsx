import type { Metadata } from 'next';
import { BlocksClient } from './BlocksClient';

export const metadata: Metadata = { title: 'Blocked traders' };

export default function BlocksPage() {
  return (
    <section className="py-8">
      <h1 className="mb-2 text-2xl font-semibold">Blocked traders</h1>
      <p className="mb-6 text-sm text-gray-500">
        Blocked traders can&apos;t propose trades to you or message you, and you can&apos;t reach
        them. Block someone from a trade thread.
      </p>
      <BlocksClient />
    </section>
  );
}
