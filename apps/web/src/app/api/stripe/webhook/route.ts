// Stripe webhook — the authority on payment outcomes. Verifies the signature
// against the raw body, then hands the typed event to the shared handler which
// flips card validity and listing state. Node runtime: needs the raw bytes +
// Stripe's crypto.

import { NextResponse, type NextRequest } from 'next/server';
import { constructStripeEvent, handleStripeEvent } from '@garage-sale/api';
import { prisma } from '@garage-sale/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new NextResponse('Missing signature', { status: 400 });

  const rawBody = await req.text();
  let event;
  try {
    event = constructStripeEvent(rawBody, signature);
  } catch {
    return new NextResponse('Signature verification failed', { status: 400 });
  }

  try {
    await handleStripeEvent(prisma, event);
  } catch {
    // Return 500 so Stripe retries the delivery.
    return new NextResponse('Handler error', { status: 500 });
  }

  return NextResponse.json({ received: true });
}
