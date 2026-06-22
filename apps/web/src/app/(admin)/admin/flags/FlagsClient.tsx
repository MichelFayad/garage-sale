'use client';

// Untrusted-flag review. Clear (restores TRUSTED if it was the last active flag â€”
// handled API-side) or escalate. Mirrors the report queue layout.

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../../../../lib/trpc';

type Flag = Awaited<ReturnType<typeof trpc.admin.flags.list.query>>[number];
const TABS = ['ACTIVE', 'CLEARED', 'ESCALATED'] as const;

export function FlagsClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('ACTIVE');
  const [rows, setRows] = useState<Flag[]>([]);

  const load = useCallback(async () => {
    setRows(await trpc.admin.flags.list.query({ status: tab }));
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, status: 'CLEARED' | 'ESCALATED') {
    const reason = window.prompt(`Note for ${status.toLowerCase()} (optional)?`) ?? undefined;
    await trpc.admin.flags.review.mutate({ id, status, reason });
    await load();
  }

  return (
    <section className="py-6">
      <h1 className="text-2xl font-semibold">Untrusted flags</h1>
      <div className="mt-4 flex gap-2 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1 ${tab === t ? 'bg-slate-900 text-white' : 'bg-gray-100'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-3">
        {rows.map((f) => (
          <li key={f.id} className="rounded border border-gray-200 p-3 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">{f.user.displayName}</span>
              <span className="text-gray-500">{new Date(f.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="mt-1 text-gray-700">{f.reason}</p>
            <p className="mt-1 text-gray-500">trust: {f.user.trustStatus}</p>
            {tab === 'ACTIVE' && (
              <div className="mt-2 space-x-3">
                <button
                  onClick={() => review(f.id, 'CLEARED')}
                  className="text-xs text-green-700 hover:underline"
                >
                  Clear
                </button>
                <button
                  onClick={() => review(f.id, 'ESCALATED')}
                  className="text-xs text-red-700 hover:underline"
                >
                  Escalate
                </button>
              </div>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-6 text-center text-gray-500">No {tab.toLowerCase()} flags.</li>
        )}
      </ul>
    </section>
  );
}
