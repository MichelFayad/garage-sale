// Lazy Stripe client singleton. Server-only; never imported by mobile at runtime
// (the shared API exposes type-only router outputs, not Stripe values).

import Stripe from 'stripe';

let client: Stripe | null = null;

/** The shared Stripe client, built from STRIPE_SECRET_KEY on first use. */
export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    client = new Stripe(key);
  }
  return client;
}

/** Verify a webhook payload signature and return the typed event. */
export function constructStripeEvent(rawBody: string | Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}
