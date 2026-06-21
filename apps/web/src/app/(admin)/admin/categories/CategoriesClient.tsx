'use client';

// Category management: create, rename, reorder (sortOrder), enable/disable, and
// edit prohibited keywords (comma-separated). Disabled categories are hidden from
// traders and block new listings (enforced in the listings router).

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../../../../lib/trpc';

type Category = Awaited<ReturnType<typeof trpc.admin.categories.list.query>>[number];

export function CategoriesClient() {
  const [rows, setRows] = useState<Category[]>([]);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    setRows(await trpc.admin.categories.list.query());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await trpc.admin.categories.create.mutate({ name: name.trim(), sortOrder: rows.length });
    setName('');
    await load();
  }

  async function update(
    id: string,
    data: Partial<Pick<Category, 'name' | 'sortOrder' | 'enabled' | 'prohibitedKeywords'>>,
  ) {
    await trpc.admin.categories.update.mutate({ id, ...data });
    await load();
  }

  return (
    <section className="py-6">
      <h1 className="text-2xl font-semibold">Categories</h1>

      <form onSubmit={create} className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name…"
          className="flex-1 rounded border border-gray-300 px-3 py-2"
        />
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
          Add
        </button>
      </form>

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-2">Order</th>
            <th>Name</th>
            <th>Enabled</th>
            <th>Prohibited keywords</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-gray-100 align-top">
              <td className="py-2">
                <input
                  type="number"
                  defaultValue={c.sortOrder}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== c.sortOrder) void update(c.id, { sortOrder: v });
                  }}
                  className="w-16 rounded border border-gray-200 px-2 py-1"
                />
              </td>
              <td className="py-2">
                <input
                  defaultValue={c.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== c.name)
                      void update(c.id, { name: e.target.value.trim() });
                  }}
                  className="rounded border border-gray-200 px-2 py-1"
                />
              </td>
              <td className="py-2">
                <button
                  onClick={() => update(c.id, { enabled: !c.enabled })}
                  className={`text-xs ${c.enabled ? 'text-green-700' : 'text-gray-400'} hover:underline`}
                >
                  {c.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </td>
              <td className="py-2">
                <input
                  defaultValue={c.prohibitedKeywords.join(', ')}
                  placeholder="comma,separated"
                  onBlur={(e) => {
                    const next = e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    if (next.join(',') !== c.prohibitedKeywords.join(','))
                      void update(c.id, { prohibitedKeywords: next });
                  }}
                  className="w-full rounded border border-gray-200 px-2 py-1"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
