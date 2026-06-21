'use client';

// Admin trade oversight: filter proposals by status; expand a row to see items,
// confirmations, ratings, and the message thread. Read-only.

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../../../../lib/trpc';

type Page = Awaited<ReturnType<typeof trpc.admin.trades.list.query>>;
type Row = Page['items'][number];
type Detail = Awaited<ReturnType<typeof trpc.admin.trades.byId.query>>;

const STATUSES = [
  'PROPOSED',
  'ACCEPTED',
  'DECLINED',
  'COUNTERED',
  'CANCELLED',
  'COMPLETED',
] as const;

export function TradesClient() {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);

  const load = useCallback(async () => {
    const page = await trpc.admin.trades.list.query({
      status: (status || undefined) as Row['status'] | undefined,
    });
    setRows(page.items);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string) {
    setDetail(await trpc.admin.trades.byId.query({ id }));
  }

  return (
    <section className="py-6">
      <h1 className="text-2xl font-semibold">Trades</h1>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="mt-4 rounded border border-gray-300 px-3 py-2"
      >
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-2">Listing</th>
            <th>Proposer → Owner</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-gray-100">
              <td className="py-2">{r.listing.title}</td>
              <td>
                {r.proposer.displayName} → {r.owner.displayName}
              </td>
              <td>{r.status}</td>
              <td>
                <button
                  onClick={() => open(r.id)}
                  className="text-xs text-blue-700 hover:underline"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-gray-400">
                No trades.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {detail && (
        <div className="mt-6 rounded border border-gray-200 p-4 text-sm">
          <div className="flex justify-between">
            <h2 className="font-medium">{detail.listing.title}</h2>
            <button onClick={() => setDetail(null)} className="text-gray-400 hover:underline">
              Close
            </button>
          </div>
          <p className="mt-1 text-gray-500">
            {detail.status} · offered: {detail.items.map((i) => i.listing.title).join(', ') || '—'}
          </p>
          <p className="mt-1 text-gray-500">
            Confirmations: {detail.confirmations.length}/2 · Ratings: {detail.ratings.length}
          </p>
          <div className="mt-3 space-y-1">
            {detail.messages.map((m) => (
              <p key={m.id}>
                <span className="font-medium">{m.sender.displayName}: </span>
                {m.body}
              </p>
            ))}
            {detail.messages.length === 0 && <p className="text-gray-400">No messages.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
