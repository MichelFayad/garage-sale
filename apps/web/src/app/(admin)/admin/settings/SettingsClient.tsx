'use client';

// Platform settings (key → JSON value). e.g. confirmationWindowDays. Values are
// edited as raw JSON; set upserts and records the editing admin (SUPER only).

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../../../../lib/trpc';

type Setting = Awaited<ReturnType<typeof trpc.admin.settings.list.query>>[number];

export function SettingsClient() {
  const [rows, setRows] = useState<Setting[]>([]);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await trpc.admin.settings.list.query());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(rawKey: string, rawValue: string) {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      setError(`Invalid JSON for "${rawKey}"`);
      return;
    }
    await trpc.admin.settings.set.mutate({ key: rawKey, value: parsed });
    setKey('');
    setValue('');
    await load();
  }

  return (
    <section className="py-6">
      <h1 className="text-2xl font-semibold">Platform settings</h1>
      {error && <p className="mt-2 text-red-600">{error}</p>}

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-2">Key</th>
            <th>Value (JSON)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-gray-100">
              <td className="py-2 font-mono">{s.key}</td>
              <td className="py-2">
                <input
                  defaultValue={JSON.stringify(s.value)}
                  id={`set-${s.id}`}
                  className="w-full rounded border border-gray-200 px-2 py-1 font-mono"
                />
              </td>
              <td>
                <button
                  onClick={() => {
                    const el = document.getElementById(`set-${s.id}`) as HTMLInputElement | null;
                    if (el) void save(s.key, el.value);
                  }}
                  className="text-xs text-blue-700 hover:underline"
                >
                  Save
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-8 font-medium">Add / overwrite</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) void save(key.trim(), value);
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="key"
          className="w-48 rounded border border-gray-300 px-3 py-2 font-mono"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="value as JSON e.g. 7"
          className="flex-1 rounded border border-gray-300 px-3 py-2 font-mono"
        />
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
          Set
        </button>
      </form>
    </section>
  );
}
