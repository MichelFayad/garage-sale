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

  async function reportUser() {
    if (!proposal) return;
    const other = proposal.proposerId === me ? proposal.ownerId : proposal.proposerId;
    const reason = window.prompt('Reason for report?');
    if (!reason) return;
    await trpc.trades.report.mutate({ targetType: 'USER', targetId: other, reason });
    window.alert('Reported. Thank you.');
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

      <button onClick={reportUser} className="text-sm text-red-600 hover:underline">
        Report other trader
      </button>
    </div>
  );
}
