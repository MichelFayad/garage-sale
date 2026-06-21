'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '../../../../../lib/trpc';
import { FormMessage } from '../../../../(marketing)/_components/fields';

// Offer one or more of your own ACTIVE listings for the target listing.
export function ProposeTrade({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [mine, setMine] = useState<{ id: string; title: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void trpc.listings.mine
      .query()
      .then((ls) =>
        setMine(ls.filter((l) => l.status === 'ACTIVE').map((l) => ({ id: l.id, title: l.title }))),
      );
  }, []);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function propose() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await trpc.trades.propose.mutate({ listingId, offeredListingIds: [...selected] });
      router.push('/app/trades');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not propose');
      setBusy(false);
    }
  }

  if (mine.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Publish an active listing of your own to propose a trade.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded border border-gray-200 p-4">
      <p className="font-medium">Propose a trade</p>
      <p className="text-sm text-gray-500">Offer one or more of your active listings (bundle):</p>
      {mine.map((l) => (
        <label key={l.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
          {l.title}
        </label>
      ))}
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <button
        onClick={propose}
        disabled={busy || selected.size === 0}
        className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Send proposal'}
      </button>
    </div>
  );
}
