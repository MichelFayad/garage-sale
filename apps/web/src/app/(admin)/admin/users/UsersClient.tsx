'use client';

// Admin user management: search, then suspend/ban/reactivate or toggle trust.
// Status/trust mutations require OPERATIONS; the API enforces it (UI just calls).

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../../../../lib/trpc';
import { useCan } from '../../../../components/AdminRole';

type Page = Awaited<ReturnType<typeof trpc.admin.users.list.query>>;
type Row = Page['items'][number];

const STATUSES = ['ACTIVE', 'SUSPENDED', 'BANNED'] as const;

export function UsersClient() {
  const can = useCan();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await trpc.admin.users.list.query({ query: query || undefined });
      setRows(page.items);
    } catch {
      setError('Failed to load users');
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(userId: string, status: (typeof STATUSES)[number]) {
    const reason =
      status === 'ACTIVE'
        ? undefined
        : (window.prompt(`Reason for ${status.toLowerCase()}?`) ?? undefined);
    if (status !== 'ACTIVE' && !reason) return;
    await trpc.admin.users.setAccountStatus.mutate({ userId, status, reason });
    await load();
  }

  async function toggleTrust(row: Row) {
    const status = row.trustStatus === 'TRUSTED' ? 'UNTRUSTED' : 'TRUSTED';
    await trpc.admin.users.setTrustStatus.mutate({ userId: row.id, status });
    await load();
  }

  return (
    <section className="py-6">
      <h1 className="text-2xl font-semibold">Users</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email or name…"
          className="flex-1 rounded border border-gray-300 px-3 py-2"
        />
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
          Search
        </button>
      </form>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-2">User</th>
            <th>Status</th>
            <th>Trust</th>
            <th>Rating</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-gray-100">
              <td className="py-2">
                <div className="font-medium">{row.displayName}</div>
                <div className="text-gray-500">{row.email}</div>
              </td>
              <td>{row.accountStatus}</td>
              <td>{row.trustStatus}</td>
              <td>
                {Number(row.ratingAvg).toFixed(2)} ({row.ratingCount})
              </td>
              <td className="space-x-2 whitespace-nowrap">
                {can('OPERATIONS') ? (
                  <>
                    {STATUSES.filter((s) => s !== row.accountStatus).map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatus(row.id, s)}
                        className="text-xs text-blue-700 hover:underline"
                      >
                        {s === 'ACTIVE' ? 'Reactivate' : s.toLowerCase()}
                      </button>
                    ))}
                    <button
                      onClick={() => toggleTrust(row)}
                      className="text-xs text-amber-700 hover:underline"
                    >
                      {row.trustStatus === 'TRUSTED' ? 'flag untrusted' : 'clear trust'}
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-gray-400">view only</span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && !error && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-gray-400">
                No users.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
