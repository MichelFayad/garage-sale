import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { refreshToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const result = await caller.auth.refresh({ refreshToken: String(body.refreshToken ?? '') });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === 'UNAUTHORIZED' ? 401 : 400 },
      );
    }
    return NextResponse.json({ error: 'Refresh failed' }, { status: 400 });
  }
}
