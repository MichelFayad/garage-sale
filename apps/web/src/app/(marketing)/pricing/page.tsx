import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Garage Sale charges one small flat fee per published listing. Trading is free.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return (
    <section className="py-12">
      <h1 className="text-3xl font-bold">Simple, per-post pricing</h1>
      <p className="mt-4 max-w-prose text-lg text-gray-600">
        Garage Sale charges a single flat fee each time you publish a listing. There&apos;s no fee
        for browsing, proposing trades, messaging, or completing a swap.
      </p>
      <ul className="mt-8 space-y-2 text-gray-700">
        <li>• One flat fee per published listing (a valid card on file is required to publish).</li>
        <li>• Editing a live listing is free; relisting a removed or traded item is a new post.</li>
        <li>• The post fee is non-refundable once a listing goes live.</li>
      </ul>
      <p className="mt-6 text-sm text-gray-500">
        The current fee is shown at checkout before you publish. Final amount set in P4/admin.
      </p>
    </section>
  );
}
