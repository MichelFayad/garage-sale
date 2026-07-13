import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const me = await caller.auth.me();
    if (me.kind !== 'trader') {
      return NextResponse.json({ error: 'Not a trader session' }, { status: 403 });
    }
    return NextResponse.json(me);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHORIZED' ? 401 : 400 });
    }
    return NextResponse.json({ error: 'Failed to load session' }, { status: 400 });
  }
}
