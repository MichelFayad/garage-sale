import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404 };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const entries = await caller.watchlist.list();
    return NextResponse.json(entries);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load watchlist' }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { listingId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const result = await caller.watchlist.add({ listingId: String(body.listingId ?? '') });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to add to watchlist' }, { status: 400 });
  }
}
