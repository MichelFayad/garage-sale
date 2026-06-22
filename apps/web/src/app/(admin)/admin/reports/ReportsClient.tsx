'use client';

// Report queue: open reports with resolve/dismiss. Resolving records the handling
// admin (API) and drops the row from the OPEN view.

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../../../../lib/trpc';

type Report = Awaited<ReturnType<typeof trpc.admin.reports.list.query>>[number];
const TABS = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;

export function ReportsClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('OPEN');
  const [rows, setRows] = useState<Report[]>([]);

  const load = useCallback(async () => {
    setRows(await trpc.admin.reports.list.query({ status: tab }));
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string, status: 'RESOLVED' | 'DISMISSED') {
    const reason = window.prompt(`Note for ${status.toLowerCase()} (optional)?`) ?? undefined;
    await trpc.admin.reports.resolve.mutate({ id, status, reason });
    await load();
  }

  return (
    <section className="py-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
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
        {rows.map((r) => (
          <li key={r.id} className="rounded border border-gray-200 p-3 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">
                {r.targetType} Â· {r.targetId}
              </span>
              <span className="text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="mt-1 text-gray-700">{r.reason}</p>
            <p className="mt-1 text-gray-500">by {r.reporter.displayName}</p>
            {tab === 'OPEN' && (
              <div className="mt-2 space-x-3">
                <button
                  onClick={() => resolve(r.id, 'RESOLVED')}
                  className="text-xs text-green-700 hover:underline"
                >
                  Resolve
                </button>
                <button
                  onClick={() => resolve(r.id, 'DISMISSED')}
                  className="text-xs text-gray-600 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-6 text-center text-gray-500">No {tab.toLowerCase()} reports.</li>
        )}
      </ul>
    </section>
  );
}
