'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '../../../lib/trpc';

type Me = Awaited<ReturnType<typeof trpc.auth.me.query>>;
type Listing = Awaited<ReturnType<typeof trpc.listings.mine.query>>[number];
type Proposal = Awaited<ReturnType<typeof trpc.trades.mine.query>>[number];

const TRADE_STATUS_STYLE: Record<string, string> = {
  PROPOSED: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  DECLINED: 'bg-red-100 text-red-700',
  COUNTERED: 'bg-gray-100 text-gray-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  COMPLETED: 'bg-purple-100 text-purple-800',
};

const OPEN_TRADE_STATUSES = new Set(['PROPOSED', 'ACCEPTED']);

interface DashboardData {
  me: Me;
  listings: Listing[];
  trades: Proposal[];
  unreadCount: number;
}

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [me, listings, trades, unread] = await Promise.all([
          trpc.auth.me.query(),
          trpc.listings.mine.query(),
          trpc.trades.mine.query(),
          trpc.trades.unreadMessageCount.query(),
        ]);
        if (!cancelled) {
          setData({ me, listings, trades, unreadCount: unread.count });
        }
      } catch {
        if (!cancelled) setError('Could not load your dashboard.');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-gray-600">Loading…</p>;

  const { me, listings, trades, unreadCount } = data;
  const isUntrusted = me.kind === 'trader' && me.trustStatus === 'UNTRUSTED';
  const noPaymentMethod = me.kind === 'trader' && !me.paymentValid;

  const activeListings = listings.filter((l) => l.status === 'ACTIVE');
  const draftListings = listings.filter((l) => l.status === 'DRAFT');
  const recentActiveListings = [...activeListings]
    .sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime())
    .slice(0, 5);

  const openTrades = trades.filter((t) => OPEN_TRADE_STATUSES.has(t.status));
  const incomingCount = openTrades.filter((t) => t.ownerId === me.id).length;
  const outgoingCount = openTrades.filter((t) => t.proposerId === me.id).length;
  const recentOpenTrades = openTrades.slice(0, 5);

  return (
    <div className="space-y-8">
      {isUntrusted && (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          Your account is currently flagged as untrusted. This can affect how other traders see you
          — it's usually caused by missing a trade-confirmation window.
        </p>
      )}
      {noPaymentMethod && (
        <p
          role="status"
          className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          You don't have a payment method on file yet.{' '}
          <Link href="/app/billing" className="font-medium underline">
            Add one
          </Link>{' '}
          before publishing a listing.
        </p>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">Listings</h2>
        {recentActiveListings.length === 0 && (
          <p className="text-sm text-gray-600">No active listings yet.</p>
        )}
        <div className="space-y-2">
          {recentActiveListings.map((l) => (
            <Link
              key={l.id}
              href={`/app/listings/${l.id}`}
              className="block rounded border border-gray-200 p-3 hover:border-gray-400"
            >
              <span className="font-medium">{l.title}</span>{' '}
              <span className="text-sm text-gray-500">
                {l.type} · {l.category.name}
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {activeListings.length} active · {draftListings.length} draft
        </p>
        <Link href="/app/listings" className="text-sm text-gray-600 hover:underline">
          View all listings →
        </Link>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Trades</h2>
        {recentOpenTrades.length === 0 && <p className="text-sm text-gray-600">No open trades.</p>}
        <div className="space-y-2">
          {recentOpenTrades.map((t) => (
            <Link
              key={t.id}
              href={`/app/trades/${t.id}`}
              className="block rounded border border-gray-200 p-3 hover:border-gray-400"
            >
              <span className="font-medium">{t.listing.title}</span>{' '}
              <span className={`rounded px-2 py-0.5 text-xs ${TRADE_STATUS_STYLE[t.status] ?? ''}`}>
                {t.status}
              </span>{' '}
              <span className="text-xs text-gray-500">
                {t.ownerId === me.id ? 'incoming' : 'outgoing'}
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {incomingCount} incoming · {outgoingCount} outgoing
        </p>
        <Link href="/app/trades" className="text-sm text-gray-600 hover:underline">
          View all trades →
        </Link>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Messages</h2>
        <Link href="/app/trades" className="text-sm text-gray-600 hover:underline">
          {unreadCount > 0 ? `${unreadCount} unread messages` : 'No unread messages'}
        </Link>
      </div>
    </div>
  );
}
