'use client';

// Service-fee config: current flat per-post fee + append-only version history.
// Setting a new fee creates a new ServiceFeeConfig row (SUPER only — API enforced).

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../../../../lib/trpc';

type History = Awaited<ReturnType<typeof trpc.admin.fee.history.query>>;

export function FeeClient() {
  const [current, setCurrent] = useState<number | null>(null);
  const [history, setHistory] = useState<History>([]);
  const [dollars, setDollars] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [cur, hist] = await Promise.all([
      trpc.admin.fee.current.query(),
      trpc.admin.fee.history.query(),
    ]);
    setCurrent(cur.amountCents);
    setHistory(hist);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountCents = Math.round(Number(dollars) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      setError('Enter a valid amount');
      return;
    }
    try {
      await trpc.admin.fee.set.mutate({ amountCents });
      setDollars('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set fee');
    }
  }

  return (
    <section className="py-6">
      <h1 className="text-2xl font-semibold">Service fee</h1>
      <p className="mt-2 text-gray-600">
        Current per-post fee:{' '}
        <strong>{current === null ? '—' : `$${(current / 100).toFixed(2)}`}</strong>
      </p>

      <form onSubmit={save} className="mt-4 flex items-center gap-2">
        <span>$</span>
        <input
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          type="number"
          step="0.01"
          min="0"
          placeholder="2.00"
          className="w-32 rounded border border-gray-300 px-3 py-2"
        />
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
          Set fee
        </button>
      </form>
      {error && <p className="mt-2 text-red-600">{error}</p>}

      <h2 className="mt-8 font-medium">History</h2>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-2">Amount</th>
            <th>Effective from</th>
            <th>Changed by</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id} className="border-t border-gray-100">
              <td className="py-2">${(h.amountCents / 100).toFixed(2)}</td>
              <td>{new Date(h.effectiveFrom).toLocaleString()}</td>
              <td>{h.changedByAdmin.displayName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
