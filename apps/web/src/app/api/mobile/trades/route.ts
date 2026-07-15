import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const proposals = await caller.trades.mine();
    return NextResponse.json(proposals);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load trades' }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (body === null || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { listingId, offeredListingIds } = body as {
    listingId?: unknown;
    offeredListingIds?: unknown;
  };

  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const proposal = await caller.trades.propose({
      listingId: String(listingId ?? ''),
      offeredListingIds: Array.isArray(offeredListingIds) ? offeredListingIds.map(String) : [],
    });
    return NextResponse.json(proposal);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to propose trade' }, { status: 400 });
  }
}
