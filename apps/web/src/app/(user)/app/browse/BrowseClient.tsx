'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '../../../../lib/trpc';

type Result = Awaited<ReturnType<typeof trpc.browse.search.query>>[number];

const CONDITIONS = ['', 'NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR'] as const;

export function BrowseClient() {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void trpc.listings.categories.query().then(setCategories);
    void trpc.watchlist.list.query().then((w) => setWatched(new Set(w.map((x) => x.listingId))));
    void search();
  }, []);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      setResults(
        await trpc.browse.search.query({
          keyword: keyword || undefined,
          categoryId: categoryId || undefined,
          condition: (condition || undefined) as Result['condition'] | undefined,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleWatch(id: string) {
    const next = new Set(watched);
    if (next.has(id)) {
      next.delete(id);
      await trpc.watchlist.remove.mutate({ listingId: id });
    } else {
      next.add(id);
      await trpc.watchlist.add.mutate({ listingId: id });
    }
    setWatched(next);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={search} className="flex flex-wrap items-end gap-3">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search…"
          className="flex-1 rounded border border-gray-300 px-3 py-2"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c ? c.replace('_', ' ') : 'Any condition'}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {results.length === 0 ? (
        <p className="text-gray-600">No matching listings.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {results.map((l) => (
            <div key={l.id} className="rounded border border-gray-200 p-3">
              {l.photos[0] && (
                <img
                  src={l.photos[0].url}
                  alt=""
                  className="mb-2 h-32 w-full rounded object-cover"
                />
              )}
              <Link href={`/app/listings/${l.id}`} className="font-medium hover:underline">
                {l.title}
              </Link>
              <p className="text-sm text-gray-500">
                {l.category.name}
                {l.distanceKm != null ? ` · ${l.distanceKm.toFixed(1)} km` : ''}
              </p>
              <button
                onClick={() => toggleWatch(l.id)}
                className="mt-2 text-sm text-gray-600 hover:underline"
              >
                {watched.has(l.id) ? '★ Watching' : '☆ Watch'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
