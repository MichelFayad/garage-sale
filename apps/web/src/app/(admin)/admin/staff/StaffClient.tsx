'use client';

// Admin account & role management (SUPER only — API enforced). Create staff with
// an email/password, change roles, and disable accounts. You can't disable yourself.

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../../../../lib/trpc';
import { useCan } from '../../../../components/AdminRole';

type Admin = Awaited<ReturnType<typeof trpc.admin.admins.list.query>>[number];
const ROLES = ['SUPER', 'OPERATIONS', 'SUPPORT'] as const;
const STATUSES = ['ACTIVE', 'SUSPENDED', 'BANNED'] as const;

export function StaffClient() {
  const isSuper = useCan()('SUPER');
  const [rows, setRows] = useState<Admin[]>([]);
  const [form, setForm] = useState({ email: '', displayName: '', role: 'SUPPORT', password: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await trpc.admin.admins.list.query());
    } catch {
      setError('Requires SUPER role');
    }
  }, []);

  useEffect(() => {
    if (isSuper) void load();
  }, [isSuper, load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await trpc.admin.admins.create.mutate({
        email: form.email,
        displayName: form.displayName,
        role: form.role as (typeof ROLES)[number],
        password: form.password,
      });
      setForm({ email: '', displayName: '', role: 'SUPPORT', password: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    }
  }

  async function update(id: string, data: { role?: string; accountStatus?: string }) {
    setError(null);
    try {
      await trpc.admin.admins.update.mutate({
        id,
        role: data.role as (typeof ROLES)[number] | undefined,
        accountStatus: data.accountStatus as (typeof STATUSES)[number] | undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  if (!isSuper) {
    return (
      <section className="py-6">
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="mt-2 text-gray-500">Requires SUPER role.</p>
      </section>
    );
  }

  return (
    <section className="py-6">
      <h1 className="text-2xl font-semibold">Staff</h1>
      {error && <p className="mt-2 text-red-600">{error}</p>}

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-2">Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t border-gray-100">
              <td className="py-2">{a.displayName}</td>
              <td>{a.email}</td>
              <td>
                <select
                  value={a.role}
                  onChange={(e) => update(a.id, { role: e.target.value })}
                  className="rounded border border-gray-200 px-2 py-1"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  value={a.accountStatus}
                  onChange={(e) => update(a.id, { accountStatus: e.target.value })}
                  className="rounded border border-gray-200 px-2 py-1"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-8 font-medium">Add staff</h2>
      <form onSubmit={create} className="mt-2 grid max-w-xl gap-2">
        <input
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          type="email"
          placeholder="email"
          required
          className="rounded border border-gray-300 px-3 py-2"
        />
        <input
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          placeholder="display name"
          required
          className="rounded border border-gray-300 px-3 py-2"
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          type="password"
          placeholder="temporary password (min 10 chars)"
          minLength={10}
          required
          className="rounded border border-gray-300 px-3 py-2"
        />
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
          Create staff account
        </button>
      </form>
    </section>
  );
}
