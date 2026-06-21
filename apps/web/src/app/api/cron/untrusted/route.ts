// Cron endpoint for the untrusted-flag sweep. Protected by a shared secret in the
// Authorization header (set CRON_SECRET; configure your scheduler to send it).
// Node runtime: uses Prisma.

import { NextResponse, type NextRequest } from 'next/server';
import { sweepUntrustedFlags } from '@garage-sale/api';
import { prisma } from '@garage-sale/db';

export const runtime = 'nodejs';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return new NextResponse('Unauthorized', { status: 401 });
  const result = await sweepUntrustedFlags(prisma);
  return NextResponse.json(result);
}
