// Browser Stripe.js loader (publishable key). Memoised so Elements share one
// instance across the page.

import { loadStripe, type Stripe } from '@stripe/stripe-js';

let promise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!promise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
    promise = loadStripe(key);
  }
  return promise;
}
