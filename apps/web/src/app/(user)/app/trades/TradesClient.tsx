'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '../../../../lib/trpc';

type Proposal = Awaited<ReturnType<typeof trpc.trades.mine.query>>[number];

const STATUS_STYLE: Record<string, string> = {
  PROPOSED: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  DECLINED: 'bg-red-100 text-red-700',
  COUNTERED: 'bg-gray-100 text-gray-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  COMPLETED: 'bg-purple-100 text-purple-800',
};

export function TradesClient() {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [me, setMe] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProposals(await trpc.trades.mine.query());
    } catch {
      setError('Could not load trades');
    }
  }, []);

  useEffect(() => {
    void trpc.auth.me.query().then((p) => setMe(p.id));
    void load();
  }, [load]);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!proposals) return <p className="text-gray-600">{error ?? 'Loading…'}</p>;
  if (proposals.length === 0) return <p className="text-gray-600">No trades yet.</p>;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {proposals.map((p) => {
        const isOwner = p.ownerId === me;
        const open = p.status === 'PROPOSED';
        return (
          <div key={p.id} className="rounded border border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <Link href={`/app/trades/${p.id}`} className="font-medium hover:underline">
                {p.listing.title}
              </Link>
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[p.status] ?? ''}`}>
                {p.status}
              </span>
              <span className="text-xs text-gray-400">{isOwner ? 'incoming' : 'outgoing'}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Offered: {p.items.map((i) => i.listing.title).join(', ')}
            </p>
            <div className="mt-2 flex gap-3 text-sm">
              {isOwner && open && (
                <>
                  <button
                    onClick={() => act(p.id, () => trpc.trades.accept.mutate({ id: p.id }))}
                    disabled={busyId === p.id}
                    className="font-medium text-green-700 hover:underline disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => act(p.id, () => trpc.trades.decline.mutate({ id: p.id }))}
                    disabled={busyId === p.id}
                    className="text-red-600 hover:underline disabled:opacity-50"
                  >
                    Decline
                  </button>
                </>
              )}
              {(open || p.status === 'ACCEPTED') && (
                <button
                  onClick={() => act(p.id, () => trpc.trades.cancel.mutate({ id: p.id }))}
                  disabled={busyId === p.id}
                  className="text-gray-600 hover:underline disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              <Link href={`/app/trades/${p.id}`} className="text-gray-600 hover:underline">
                Open thread
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
