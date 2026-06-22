'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { trpc } from '../../../../../lib/trpc';

type Proposal = Awaited<ReturnType<typeof trpc.trades.byId.query>>;
type Message = Awaited<ReturnType<typeof trpc.trades.messages.query>>[number];

export function TradeThread({ id }: { id: string }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [me, setMe] = useState('');
  const [body, setBody] = useState('');
  const [stars, setStars] = useState(5);
  const [review, setReview] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, m, profile] = await Promise.all([
        trpc.trades.byId.query({ id }),
        trpc.trades.messages.query({ proposalId: id }),
        trpc.auth.me.query(),
      ]);
      setProposal(p);
      setMessages(m);
      setMe(profile.id);
      const other = p.proposerId === profile.id ? p.ownerId : p.proposerId;
      setBlocked((await trpc.blocks.status.query({ userId: other })).blocked);
    } catch {
      setError('Trade not found');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await trpc.trades.sendMessage.mutate({ proposalId: id, body });
    setBody('');
    setMessages(await trpc.trades.messages.query({ proposalId: id }));
  }

  async function confirm() {
    await trpc.trades.confirm.mutate({ id });
    await load();
  }

  async function submitRating(e: React.FormEvent) {
    e.preventDefault();
    await trpc.trades.rate.mutate({ id, stars, review: review || undefined });
    setReview('');
    await load();
  }

  async function reportUser() {
    if (!proposal) return;
    const other = proposal.proposerId === me ? proposal.ownerId : proposal.proposerId;
    const reason = window.prompt('Reason for report?');
    if (!reason) return;
    await trpc.trades.report.mutate({ targetType: 'USER', targetId: other, reason });
    window.alert('Reported. Thank you.');
  }

  async function toggleBlock() {
    if (!proposal) return;
    const other = proposal.proposerId === me ? proposal.ownerId : proposal.proposerId;
    if (blocked) {
      await trpc.blocks.unblock.mutate({ userId: other });
    } else {
      const reason = window.prompt('Reason for blocking? (optional)') ?? undefined;
      await trpc.blocks.block.mutate({ userId: other, reason: reason || undefined });
    }
    await load();
  }

  if (error) return <p className="text-gray-600">{error}</p>;
  if (!proposal) return <p className="text-gray-600">Loading…</p>;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/app/trades" className="text-sm text-gray-500 hover:underline">
          ← Trades
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{proposal.listing.title}</h1>
        <p className="text-sm text-gray-500">
          {proposal.status} · offered: {proposal.items.map((i) => i.listing.title).join(', ')}
        </p>
      </div>

      {proposal.status === 'ACCEPTED' && (
        <div className="rounded border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Confirmations: {proposal.confirmations.length}/2</p>
          {proposal.confirmations.some((c) => c.userId === me) ? (
            <p className="text-sm text-green-700">✓ You confirmed. Waiting for the other trader.</p>
          ) : (
            <button
              onClick={confirm}
              className="mt-1 rounded bg-gray-900 px-3 py-2 text-sm text-white"
            >
              Confirm trade
            </button>
          )}
        </div>
      )}

      {proposal.status === 'COMPLETED' &&
        (proposal.ratings.some((r) => r.raterId === me) ? (
          <p className="text-sm text-green-700">✓ Trade completed — you rated this trade.</p>
        ) : (
          <form onSubmit={submitRating} className="space-y-2 rounded border border-gray-200 p-4">
            <p className="font-medium">Rate this trade</p>
            <label className="block text-sm">
              <span className="mr-2">Stars</span>
              <select
                value={stars}
                onChange={(e) => setStars(Number(e.target.value))}
                className="rounded border border-gray-300 px-2 py-1"
              >
                {[5, 4, 3, 2, 1].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Review (optional)"
              maxLength={1000}
              rows={2}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
            <button type="submit" className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
              Submit rating
            </button>
          </form>
        ))}

      <div className="space-y-2 rounded border border-gray-200 p-4">
        {messages.length === 0 && <p className="text-sm text-gray-400">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={m.senderId === me ? 'text-right' : ''}>
            <span className="inline-block rounded bg-gray-100 px-3 py-1 text-sm">
              <span className="font-medium">{m.sender.displayName}: </span>
              {m.body}
            </span>
          </div>
        ))}
      </div>

      {blocked ? (
        <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
          You&apos;ve blocked this trader (or they blocked you). Messaging is disabled.
        </p>
      ) : (
        <form onSubmit={send} className="flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message…"
            maxLength={2000}
            className="flex-1 rounded border border-gray-300 px-3 py-2"
          />
          <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-white">
            Send
          </button>
        </form>
      )}

      <div className="flex gap-4">
        <button onClick={reportUser} className="text-sm text-red-600 hover:underline">
          Report other trader
        </button>
        <button onClick={toggleBlock} className="text-sm text-gray-600 hover:underline">
          {blocked ? 'Unblock trader' : 'Block trader'}
        </button>
      </div>
    </div>
  );
}
