'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '../../../../lib/trpc';

type Listing = Awaited<ReturnType<typeof trpc.listings.mine.query>>[number];

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_PAYMENT: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-green-100 text-green-800',
  LOCKED: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-purple-100 text-purple-800',
  REMOVED: 'bg-red-100 text-red-700',
};

export function MyListings() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setListings(await trpc.listings.mine.query());
    } catch {
      setError('Could not load listings');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, fn: (id: string) => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  const publish = (id: string) =>
    act(id, () => trpc.billing.publishListing.mutate({ listingId: id }));
  const markTraded = (id: string) => act(id, () => trpc.listings.markTraded.mutate({ id }));
  const remove = (id: string) => act(id, () => trpc.listings.remove.mutate({ id }));

  if (!listings) return <p className="text-gray-600">{error ?? 'Loading…'}</p>;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {listings.length === 0 && <p className="text-gray-600">No listings yet.</p>}
      {listings.map((l) => (
        <div key={l.id} className="flex items-start gap-4 rounded border border-gray-200 p-4">
          {l.photos[0] && (
            <img src={l.photos[0].url} alt="" className="h-16 w-16 rounded object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link href={`/app/listings/${l.id}`} className="font-medium hover:underline">
                {l.title}
              </Link>
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[l.status] ?? ''}`}>
                {l.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {l.type} · {l.category.name}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1 text-sm">
            {(l.status === 'DRAFT' || l.status === 'ACTIVE') && (
              <Link href={`/app/listings/${l.id}/edit`} className="text-gray-600 hover:underline">
                Edit
              </Link>
            )}
            {l.status === 'DRAFT' && (
              <button
                onClick={() => publish(l.id)}
                disabled={busyId === l.id}
                className="text-left font-medium text-gray-900 hover:underline disabled:opacity-50"
              >
                Publish (pay fee)
              </button>
            )}
            {l.status === 'ACTIVE' && (
              <button
                onClick={() => markTraded(l.id)}
                disabled={busyId === l.id}
                className="text-left text-gray-600 hover:underline disabled:opacity-50"
              >
                Mark traded
              </button>
            )}
            {l.status !== 'LOCKED' && l.status !== 'REMOVED' && (
              <button
                onClick={() => remove(l.id)}
                disabled={busyId === l.id}
                className="text-left text-red-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
