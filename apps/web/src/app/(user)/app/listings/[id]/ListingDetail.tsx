'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '../../../../../lib/trpc';

type Listing = Awaited<ReturnType<typeof trpc.listings.byId.query>>;

export function ListingDetail({ id }: { id: string }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [l, profile] = await Promise.all([
          trpc.listings.byId.query({ id }),
          trpc.auth.me.query(),
        ]);
        setListing(l);
        setMe(profile.id);
      } catch {
        setError('Listing not found');
      }
    })();
  }, [id]);

  if (error) return <p className="text-gray-600">{error}</p>;
  if (!listing) return <p className="text-gray-600">Loading…</p>;

  const isOwner = me === listing.ownerId;

  return (
    <article className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{listing.title}</h1>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
          {listing.status.replace('_', ' ')}
        </span>
      </div>
      <p className="text-sm text-gray-500">
        {listing.type} · {listing.category.name} · {listing.condition.replace('_', ' ')}
        {listing.city ? ` · ${listing.city}` : ''}
      </p>

      {listing.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {listing.photos.map((p) => (
            <img key={p.id} src={p.url} alt="" className="h-40 w-40 rounded object-cover" />
          ))}
        </div>
      )}

      <p className="whitespace-pre-wrap text-gray-800">{listing.description}</p>

      {listing.wantedDescription && (
        <p className="text-gray-700">
          <span className="font-medium">Wants in return:</span> {listing.wantedDescription}
        </p>
      )}

      {isOwner && (listing.status === 'DRAFT' || listing.status === 'ACTIVE') && (
        <Link
          href={`/app/listings/${listing.id}/edit`}
          className="inline-block rounded border border-gray-300 px-3 py-2 text-sm"
        >
          Edit listing
        </Link>
      )}
    </article>
  );
}
