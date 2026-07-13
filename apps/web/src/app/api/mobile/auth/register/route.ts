import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';

const STATUS: Record<string, number> = { BAD_REQUEST: 400, CONFLICT: 409 };

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { email?: unknown; password?: unknown; displayName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const result = await caller.auth.register({
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      displayName: String(body.displayName ?? ''),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TRPCError) {
      return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
    }
    return NextResponse.json({ error: 'Registration failed' }, { status: 400 });
  }
}
