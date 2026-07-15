import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400 };

export async function POST(req: NextRequest): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (json === null || typeof json !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { targetType, targetId, reason } = json as {
    targetType?: unknown;
    targetId?: unknown;
    reason?: unknown;
  };

  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));
  try {
    const result = await caller.trades.report({
      targetType: targetType as 'LISTING' | 'USER',
      targetId: String(targetId ?? ''),
      reason: String(reason ?? ''),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 400 });
  }
}
