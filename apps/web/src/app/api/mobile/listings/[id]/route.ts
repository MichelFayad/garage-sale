import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import type { Condition, ListingType } from '@garage-sale/db';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const listing = await caller.listings.byId({ id });
    return NextResponse.json(listing);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to load listing' }, { status: 400 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const listing = await caller.listings.update({
      id,
      type: body.type as ListingType,
      title: String(body.title ?? ''),
      description: String(body.description ?? ''),
      condition: body.condition as Condition,
      categoryId: String(body.categoryId ?? ''),
      city: body.city !== undefined ? String(body.city) : undefined,
      neighbourhood: body.neighbourhood !== undefined ? String(body.neighbourhood) : undefined,
      wantedDescription:
        body.wantedDescription !== undefined ? String(body.wantedDescription) : undefined,
      wantedCategoryId:
        body.wantedCategoryId !== undefined ? String(body.wantedCategoryId) : undefined,
      photos: Array.isArray(body.photos) ? body.photos.map((p) => String(p)) : [],
    });
    return NextResponse.json(listing);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to update listing' }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const listing = await caller.listings.remove({ id });
    return NextResponse.json(listing);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to remove listing' }, { status: 400 });
  }
}
