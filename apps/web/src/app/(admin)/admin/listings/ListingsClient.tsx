'use client';

// Admin listing moderation: filter by status / title, force-remove with a reason.

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../../../../lib/trpc';
import { useCan } from '../../../../components/AdminRole';

type Page = Awaited<ReturnType<typeof trpc.admin.listings.list.query>>;
type Row = Page['items'][number];

const STATUSES = ['DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'LOCKED', 'COMPLETED', 'REMOVED'] as const;

export function ListingsClient() {
  const can = useCan();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('');
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const page = await trpc.admin.listings.list.query({
      query: query || undefined,
      status: (status || undefined) as Row['status'] | undefined,
    });
    setRows(page.items);
  }, [query, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    const reason = window.prompt('Reason for removal?');
    if (!reason) return;
    await trpc.admin.listings.remove.mutate({ id, reason });
    await load();
  }

  return (
    <section className="py-6">
      <h1 className="text-2xl font-semibold">Listings</h1>
      <div className="mt-4 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titleâ€¦"
          className="flex-1 rounded border border-gray-300 px-3 py-2"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button onClick={() => void load()} className="rounded bg-slate-900 px-4 py-2 text-white">
          Filter
        </button>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-2">Title</th>
            <th>Owner</th>
            <th>Category</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-gray-100">
              <td className="py-2 font-medium">{row.title}</td>
              <td>{row.owner.displayName}</td>
              <td>{row.category.name}</td>
              <td>{row.status}</td>
              <td>
                {can('OPERATIONS') && row.status !== 'REMOVED' && (
                  <button
                    onClick={() => remove(row.id)}
                    className="text-xs text-red-700 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-gray-500">
                No listings.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
