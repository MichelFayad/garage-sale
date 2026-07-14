import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import type { Condition, ListingType } from '@garage-sale/db';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400 };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const listings = await caller.browse.search({
      keyword: sp.get('keyword') ?? undefined,
      categoryId: sp.get('categoryId') ?? undefined,
      condition: (sp.get('condition') ?? undefined) as Condition | undefined,
      type: (sp.get('type') ?? undefined) as ListingType | undefined,
    });
    return NextResponse.json(listings);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to search listings' }, { status: 400 });
  }
}
