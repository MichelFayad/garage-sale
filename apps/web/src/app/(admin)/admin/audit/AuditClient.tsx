'use client';

// Audit log viewer (OPERATIONS+). Read-only stream of staff actions, newest first,
// optionally filtered by entity type. Cursor-paged via "Load more".

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../../../../lib/trpc';

type Page = Awaited<ReturnType<typeof trpc.admin.audit.list.query>>;
type Row = Page['items'][number];

export function AuditClient() {
  const [entityType, setEntityType] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      const page = await trpc.admin.audit.list.query({
        entityType: entityType || undefined,
        cursor: reset ? undefined : (cursor ?? undefined),
      });
      setRows((prev) => (reset ? page.items : [...prev, ...page.items]));
      setCursor(page.nextCursor);
    },
    [entityType, cursor],
  );

  useEffect(() => {
    void load(true);
    // Reset-load is keyed on the filter; cursor paging is driven by "Load more".
  }, [entityType]);

  return (
    <section className="py-6">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <div className="mt-4">
        <input
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder="Filter by entity type (User, Listing, …)"
          className="w-80 rounded border border-gray-300 px-3 py-2"
        />
      </div>

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-2">When</th>
            <th>Admin</th>
            <th>Entity</th>
            <th>Action</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-gray-100">
              <td className="py-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
              <td>
                {r.admin.displayName} <span className="text-gray-400">({r.admin.role})</span>
              </td>
              <td className="font-mono">
                {r.entityType}:{r.entityId.slice(0, 8)}
              </td>
              <td>{r.action}</td>
              <td className="text-gray-500">{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {cursor && (
        <button
          onClick={() => void load(false)}
          className="mt-4 rounded bg-gray-100 px-4 py-2 text-sm"
        >
          Load more
        </button>
      )}
    </section>
  );
}
