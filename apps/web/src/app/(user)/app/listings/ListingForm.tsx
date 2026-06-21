'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '../../../../lib/trpc';
import { Field, FormMessage, SubmitButton } from '../../../(marketing)/_components/fields';

const TYPES = [
  { value: 'HAVE', label: 'Have (offering)' },
  { value: 'WANT', label: 'Want (looking for)' },
] as const;

const CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR'] as const;

export interface ListingFormValues {
  id?: string;
  type: string;
  title: string;
  description: string;
  condition: string;
  categoryId: string;
  city: string;
  neighbourhood: string;
  wantedDescription: string;
  photos: string[];
}

const EMPTY: ListingFormValues = {
  type: 'HAVE',
  title: '',
  description: '',
  condition: 'GOOD',
  categoryId: '',
  city: '',
  neighbourhood: '',
  wantedDescription: '',
  photos: [],
};

export function ListingForm({ initial }: { initial?: ListingFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState<ListingFormValues>(initial ?? EMPTY);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void trpc.listings.categories.query().then((cats) => {
      setCategories(cats);
      setValues((v) => (v.categoryId ? v : { ...v, categoryId: cats[0]?.id ?? '' }));
    });
  }, []);

  function set<K extends keyof ListingFormValues>(key: K, val: ListingFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function setPhoto(i: number, url: string) {
    setValues((v) => ({ ...v, photos: v.photos.map((p, idx) => (idx === i ? url : p)) }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      type: values.type as 'HAVE' | 'WANT',
      title: values.title,
      description: values.description,
      condition: values.condition as (typeof CONDITIONS)[number],
      categoryId: values.categoryId,
      city: values.city || undefined,
      neighbourhood: values.neighbourhood || undefined,
      wantedDescription: values.wantedDescription || undefined,
      photos: values.photos.map((p) => p.trim()).filter(Boolean),
    };
    try {
      if (values.id) {
        await trpc.listings.update.mutate({ id: values.id, ...payload });
      } else {
        await trpc.listings.create.mutate(payload);
      }
      router.push('/app/listings');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save listing');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-700">Type</span>
        <select
          value={values.type}
          onChange={(e) => set('type', e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2"
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <Field
        label="Title"
        value={values.title}
        onChange={(e) => set('title', e.target.value)}
        maxLength={120}
        required
      />

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-700">Description</span>
        <textarea
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          maxLength={2000}
          rows={4}
          required
          className="w-full rounded border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Condition</span>
          <select
            value={values.condition}
            onChange={(e) => set('condition', e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Category</span>
          <select
            value={values.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="City" value={values.city} onChange={(e) => set('city', e.target.value)} />
        <Field
          label="Neighbourhood"
          value={values.neighbourhood}
          onChange={(e) => set('neighbourhood', e.target.value)}
        />
      </div>

      {values.type === 'HAVE' && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">What you want in return</span>
          <textarea
            value={values.wantedDescription}
            onChange={(e) => set('wantedDescription', e.target.value)}
            maxLength={2000}
            rows={2}
            className="w-full rounded border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
          />
        </label>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">Photo URLs (max 10)</legend>
        {values.photos.map((url, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setPhoto(i, e.target.value)}
              placeholder="https://…"
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
            <button
              type="button"
              onClick={() =>
                set(
                  'photos',
                  values.photos.filter((_, idx) => idx !== i),
                )
              }
              className="rounded border border-gray-300 px-3 text-gray-500"
            >
              ✕
            </button>
          </div>
        ))}
        {values.photos.length < 10 && (
          <button
            type="button"
            onClick={() => set('photos', [...values.photos, ''])}
            className="text-sm text-gray-600 hover:underline"
          >
            + Add photo
          </button>
        )}
      </fieldset>

      {error && <FormMessage tone="error">{error}</FormMessage>}
      <SubmitButton disabled={busy}>
        {busy ? 'Saving…' : values.id ? 'Save changes' : 'Create draft'}
      </SubmitButton>
    </form>
  );
}
