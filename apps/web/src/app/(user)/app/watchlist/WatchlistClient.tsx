'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '../../../../lib/trpc';

type Entry = Awaited<ReturnType<typeof trpc.watchlist.list.query>>[number];

export function WatchlistClient() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  const load = useCallback(async () => {
    setEntries(await trpc.watchlist.list.query());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unwatch(listingId: string) {
    await trpc.watchlist.remove.mutate({ listingId });
    await load();
  }

  if (!entries) return <p className="text-gray-600">Loading…</p>;
  if (entries.length === 0) return <p className="text-gray-600">Nothing watched yet.</p>;

  return (
    <div className="space-y-3">
      {entries.map((e) => (
        <div key={e.id} className="flex items-center gap-4 rounded border border-gray-200 p-3">
          {e.listing.photos[0] && (
            <img src={e.listing.photos[0].url} alt="" className="h-14 w-14 rounded object-cover" />
          )}
          <div className="flex-1">
            <Link href={`/app/listings/${e.listing.id}`} className="font-medium hover:underline">
              {e.listing.title}
            </Link>
            <p className="text-sm text-gray-500">{e.listing.category.name}</p>
          </div>
          <button
            onClick={() => unwatch(e.listingId)}
            className="text-sm text-gray-600 hover:underline"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
