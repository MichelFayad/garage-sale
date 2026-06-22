// Cron endpoint for the untrusted-flag sweep. Protected by a shared secret in the
// Authorization header (set CRON_SECRET; configure your scheduler to send it).
// Node runtime: uses Prisma.

import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { sweepUntrustedFlags } from '@garage-sale/api';
import { prisma } from '@garage-sale/db';

export const runtime = 'nodejs';

/** Constant-time string compare so a wrong secret can't be timing-probed. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

async function run(req: NextRequest) {
  if (!authorized(req)) return new NextResponse('Unauthorized', { status: 401 });
  const result = await sweepUntrustedFlags(prisma);
  return NextResponse.json(result);
}

// GET: Vercel Cron (it auto-sends `Authorization: Bearer ${CRON_SECRET}`).
// POST: GitHub Action fallback / manual invocation.
export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
