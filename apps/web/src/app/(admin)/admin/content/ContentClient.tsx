'use client';

// CMS page management (P10): list all pages (draft + published), create a new
// page, edit an existing one (title/description/Markdown body), toggle publish
// state, and delete. Editing requires OPERATIONS; SUPPORT sees a read-only list.

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../../../../lib/trpc';
import { useCan } from '../../../../components/AdminRole';

type PageRow = Awaited<ReturnType<typeof trpc.admin.content.list.query>>[number];
type PageDetail = Awaited<ReturnType<typeof trpc.admin.content.byId.query>>;

const EMPTY = { slug: '', title: '', description: '', body: '' };

export function ContentClient() {
  const editable = useCan()('OPERATIONS');
  const [rows, setRows] = useState<PageRow[]>([]);
  const [draft, setDraft] = useState(EMPTY);
  const [selected, setSelected] = useState<PageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await trpc.admin.content.list.query());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!draft.slug.trim() || !draft.title.trim()) return;
    try {
      await trpc.admin.content.create.mutate({
        slug: draft.slug.trim(),
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        body: draft.body,
      });
      setDraft(EMPTY);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    }
  }

  async function edit(id: string) {
    setSelected(await trpc.admin.content.byId.query({ id }));
  }

  async function save() {
    if (!selected) return;
    await trpc.admin.content.update.mutate({
      id: selected.id,
      title: selected.title,
      description: selected.description ?? undefined,
      body: selected.body,
    });
    setSelected(null);
    await load();
  }

  async function togglePublish(row: PageRow) {
    await trpc.admin.content.update.mutate({
      id: row.id,
      status: row.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED',
    });
    await load();
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this page? This cannot be undone.')) return;
    await trpc.admin.content.delete.mutate({ id });
    if (selected?.id === id) setSelected(null);
    await load();
  }

  return (
    <section className="py-6">
      <h1 className="text-2xl font-semibold">Content pages</h1>
      {!editable && (
        <p className="mt-1 text-sm text-gray-500">View only â€” editing requires OPERATIONS.</p>
      )}

      {editable && (
        <form onSubmit={create} className="mt-4 grid gap-2 rounded border border-gray-200 p-4">
          <div className="font-medium">New page</div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <input
              value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              placeholder="slug (e.g. terms)"
              className="w-48 rounded border border-gray-300 px-3 py-2"
            />
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Title"
              className="flex-1 rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="SEO description (optional)"
            className="rounded border border-gray-300 px-3 py-2"
          />
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder="Markdown bodyâ€¦"
            rows={6}
            className="rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
          <button
            type="submit"
            className="justify-self-start rounded bg-slate-900 px-4 py-2 text-white"
          >
            Create draft
          </button>
        </form>
      )}

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-2">Title</th>
            <th>Slug</th>
            <th>Status</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-gray-100">
              <td className="py-2">{p.title}</td>
              <td className="py-2 font-mono text-xs text-gray-500">/{p.slug}</td>
              <td className="py-2">
                <button
                  onClick={() => togglePublish(p)}
                  disabled={!editable}
                  className={`text-xs ${p.status === 'PUBLISHED' ? 'text-green-700' : 'text-gray-500'} hover:underline disabled:no-underline disabled:cursor-default`}
                >
                  {p.status}
                </button>
              </td>
              <td className="py-2 text-gray-500">{new Date(p.updatedAt).toLocaleDateString()}</td>
              <td className="py-2 text-right">
                {editable && (
                  <span className="flex justify-end gap-3">
                    <button onClick={() => edit(p.id)} className="text-slate-700 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => remove(p.id)} className="text-red-600 hover:underline">
                      Delete
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-gray-500">
                No content pages yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {selected && editable && (
        <div className="mt-6 grid gap-2 rounded border border-slate-300 p-4">
          <div className="flex items-center justify-between">
            <div className="font-medium">
              Editing <span className="font-mono text-sm">/{selected.slug}</span>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-sm text-gray-500 hover:underline"
            >
              Close
            </button>
          </div>
          <input
            value={selected.title}
            onChange={(e) => setSelected({ ...selected, title: e.target.value })}
            placeholder="Title"
            className="rounded border border-gray-300 px-3 py-2"
          />
          <input
            value={selected.description ?? ''}
            onChange={(e) => setSelected({ ...selected, description: e.target.value })}
            placeholder="SEO description (optional)"
            className="rounded border border-gray-300 px-3 py-2"
          />
          <textarea
            value={selected.body}
            onChange={(e) => setSelected({ ...selected, body: e.target.value })}
            rows={14}
            className="rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
          <button
            onClick={save}
            className="justify-self-start rounded bg-slate-900 px-4 py-2 text-white"
          >
            Save
          </button>
        </div>
      )}
    </section>
  );
}
