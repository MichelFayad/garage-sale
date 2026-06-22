'use client';

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../../../../lib/trpc';

type Block = Awaited<ReturnType<typeof trpc.blocks.list.query>>[number];

export function BlocksClient() {
  const [blocks, setBlocks] = useState<Block[] | null>(null);

  const load = useCallback(async () => {
    setBlocks(await trpc.blocks.list.query());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unblock(userId: string) {
    await trpc.blocks.unblock.mutate({ userId });
    await load();
  }

  if (!blocks) return <p className="text-gray-600">Loading…</p>;
  if (blocks.length === 0) return <p className="text-gray-600">You haven&apos;t blocked anyone.</p>;

  return (
    <div className="space-y-3">
      {blocks.map((b) => (
        <div key={b.id} className="flex items-center gap-4 rounded border border-gray-200 p-3">
          <div className="flex-1">
            <div className="font-medium">{b.blocked.displayName}</div>
            {b.reason && <p className="text-sm text-gray-500">{b.reason}</p>}
          </div>
          <button
            onClick={() => unblock(b.blocked.id)}
            className="text-sm text-gray-600 hover:underline"
          >
            Unblock
          </button>
        </div>
      ))}
    </div>
  );
}
