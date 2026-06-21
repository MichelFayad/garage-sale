'use client';

import { useEffect, useState } from 'react';
import { trpc } from '../../../../../../lib/trpc';
import { ListingForm, type ListingFormValues } from '../../ListingForm';

export function EditListing({ id }: { id: string }) {
  const [initial, setInitial] = useState<ListingFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void trpc.listings.byId
      .query({ id })
      .then((l) =>
        setInitial({
          id: l.id,
          type: l.type,
          title: l.title,
          description: l.description,
          condition: l.condition,
          categoryId: l.categoryId,
          city: l.city ?? '',
          neighbourhood: l.neighbourhood ?? '',
          wantedDescription: l.wantedDescription ?? '',
          photos: l.photos.map((p) => p.url),
        }),
      )
      .catch(() => setError('Listing not found'));
  }, [id]);

  if (error) return <p className="text-gray-600">{error}</p>;
  if (!initial) return <p className="text-gray-600">Loading…</p>;
  return <ListingForm initial={initial} />;
}
