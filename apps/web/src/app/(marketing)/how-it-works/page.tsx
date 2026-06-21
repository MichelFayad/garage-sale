import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'List what you have, find what you want, and trade locally on Garage Sale.',
};

const STEPS = [
  [
    'List an item',
    'Post something you Have or describe what you Want. A small flat fee applies per published listing.',
  ],
  [
    'Find a match',
    'Browse and filter by category, condition, and distance to find a trade nearby.',
  ],
  [
    'Propose a trade',
    'Offer a single item or a bundle. Messaging opens once a proposal is accepted.',
  ],
  [
    'Confirm & rate',
    'Both traders confirm the swap is complete, then leave a rating. No fee on completion.',
  ],
] as const;

export default function HowItWorksPage() {
  return (
    <section className="py-12">
      <h1 className="text-3xl font-bold">How Garage Sale works</h1>
      <ol className="mt-8 space-y-6">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
              {i + 1}
            </span>
            <div>
              <h2 className="font-semibold">{title}</h2>
              <p className="text-gray-600">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
