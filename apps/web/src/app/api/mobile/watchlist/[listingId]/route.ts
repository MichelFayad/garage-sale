import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ listingId: string }> },
): Promise<NextResponse> {
  const { listingId } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const result = await caller.watchlist.remove({ listingId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === 'UNAUTHORIZED' ? 401 : 400 },
      );
    }
    return NextResponse.json({ error: 'Failed to remove from watchlist' }, { status: 400 });
  }
}
