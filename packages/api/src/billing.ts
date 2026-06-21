// Per-post billing: card-on-file (SetupIntent) + the publish charge (off_session
// PaymentIntent). Listing state transitions are driven by Stripe webhooks so the
// charge result is the single source of truth — see handleStripeEvent.

import { TRPCError } from '@trpc/server';
import { EmailType, FeeChargeStatus, ListingStatus, type PrismaClient } from '@garage-sale/db';
import { DEFAULT_POST_FEE_CENTS, shouldChargeOnPublish } from '@garage-sale/core';
import type Stripe from 'stripe';
import { stripe } from './stripe.js';
import { sendEmail } from './email.js';

/** Current flat per-post fee (latest ServiceFeeConfig), in USD cents. */
export async function getServiceFeeCents(prisma: PrismaClient): Promise<number> {
  const config = await prisma.serviceFeeConfig.findFirst({ orderBy: { effectiveFrom: 'desc' } });
  return config?.amountCents ?? DEFAULT_POST_FEE_CENTS;
}

/** Get or create the trader's Stripe customer, persisting the id. */
async function ensureStripeCustomer(
  prisma: PrismaClient,
  user: { id: string; email: string; displayName: string; stripeCustomerId: string | null },
): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: user.email,
    name: user.displayName,
    metadata: { userId: user.id },
  });
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/** Start card-on-file collection: returns a SetupIntent client secret for the client. */
export async function createSetupIntent(
  prisma: PrismaClient,
  userId: string,
): Promise<{ clientSecret: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
  const customerId = await ensureStripeCustomer(prisma, user);
  const intent = await stripe().setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
    metadata: { userId },
  });
  if (!intent.client_secret) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No client secret' });
  }
  return { clientSecret: intent.client_secret };
}

/** Card-on-file + current fee, for gating the publish UI. */
export async function getBillingStatus(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
  return {
    paymentValid: user.paymentValid,
    hasCard: user.stripePaymentMethodId !== null,
    feeCents: await getServiceFeeCents(prisma),
  };
}

/** Detach the saved card and clear payment validity (webhook also covers this). */
export async function removeCard(prisma: PrismaClient, userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.stripePaymentMethodId) return;
  try {
    await stripe().paymentMethods.detach(user.stripePaymentMethodId);
  } catch {
    // already detached upstream — fall through to local clear
  }
  await prisma.user.update({
    where: { id: userId },
    data: { stripePaymentMethodId: null, paymentValid: false },
  });
}

/** Publish a DRAFT listing: charge the per-post fee off_session. The listing only
 *  becomes ACTIVE when the payment_intent.succeeded webhook lands. */
export async function publishListing(prisma: PrismaClient, userId: string, listingId: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Listing not found' });
  if (listing.ownerId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });

  const alreadyChargedSucceeded =
    (await prisma.feeCharge.count({
      where: { listingId, status: FeeChargeStatus.SUCCEEDED },
    })) > 0;
  if (!shouldChargeOnPublish({ alreadyChargedSucceeded, fromStatus: listing.status })) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Listing does not require a charge' });
  }
  if (listing.status !== ListingStatus.DRAFT) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only draft listings can be published' });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.stripeCustomerId || !user.stripePaymentMethodId || !user.paymentValid) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'A valid payment method is required' });
  }

  const amountCents = await getServiceFeeCents(prisma);
  const charge = await prisma.feeCharge.create({
    data: { listingId, userId, amountCents, status: FeeChargeStatus.PENDING },
  });
  // Hold the listing in PENDING_PAYMENT until the webhook resolves.
  await prisma.listing.update({
    where: { id: listingId },
    data: { status: ListingStatus.PENDING_PAYMENT },
  });

  try {
    const intent = await stripe().paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: user.stripeCustomerId,
      payment_method: user.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      metadata: { feeChargeId: charge.id, listingId, userId },
    });
    await prisma.feeCharge.update({
      where: { id: charge.id },
      data: { stripePaymentIntentId: intent.id },
    });
  } catch (err) {
    // Card declined / auth required: roll the listing back so the user can retry.
    await prisma.feeCharge.update({
      where: { id: charge.id },
      data: { status: FeeChargeStatus.FAILED },
    });
    await prisma.listing.update({
      where: { id: listingId },
      data: { status: ListingStatus.DRAFT },
    });
    const message = err instanceof Error ? err.message : 'Payment failed';
    throw new TRPCError({ code: 'PAYMENT_REQUIRED', message });
  }

  return { listingId, feeChargeId: charge.id, status: 'PENDING' as const };
}

// ─── Webhook event handling ─────────────────────────────────

async function onSetupIntentSucceeded(prisma: PrismaClient, si: Stripe.SetupIntent): Promise<void> {
  const userId = si.metadata?.userId;
  const paymentMethodId = typeof si.payment_method === 'string' ? si.payment_method : null;
  if (!userId || !paymentMethodId) return;
  await prisma.user.update({
    where: { id: userId },
    data: { stripePaymentMethodId: paymentMethodId, paymentValid: true },
  });
  // Make it the customer's default so off_session charges pick it up.
  if (typeof si.customer === 'string') {
    await stripe().customers.update(si.customer, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  }
}

async function onPaymentSucceeded(prisma: PrismaClient, pi: Stripe.PaymentIntent): Promise<void> {
  const feeChargeId = pi.metadata?.feeChargeId;
  if (!feeChargeId) return;
  const charge = await prisma.feeCharge.findUnique({ where: { id: feeChargeId } });
  if (!charge || charge.status === FeeChargeStatus.SUCCEEDED) return; // idempotent
  await prisma.feeCharge.update({
    where: { id: feeChargeId },
    data: { status: FeeChargeStatus.SUCCEEDED },
  });
  const listing = await prisma.listing.update({
    where: { id: charge.listingId },
    data: { status: ListingStatus.ACTIVE, publishedAt: new Date() },
  });
  const user = await prisma.user.findUnique({ where: { id: charge.userId } });
  if (user) {
    await sendEmail(prisma, {
      type: EmailType.POST_FEE_RECEIPT,
      toEmail: user.email,
      userId: user.id,
      subject: 'Your Garage Sale listing is live — receipt',
      body: `"${listing.title}" is now live. You were charged $${(charge.amountCents / 100).toFixed(2)} (non-refundable).`,
    });
  }
}

async function onPaymentFailed(prisma: PrismaClient, pi: Stripe.PaymentIntent): Promise<void> {
  const feeChargeId = pi.metadata?.feeChargeId;
  if (!feeChargeId) return;
  const charge = await prisma.feeCharge.findUnique({ where: { id: feeChargeId } });
  if (!charge || charge.status !== FeeChargeStatus.PENDING) return;
  await prisma.feeCharge.update({
    where: { id: feeChargeId },
    data: { status: FeeChargeStatus.FAILED },
  });
  await prisma.listing.update({
    where: { id: charge.listingId },
    data: { status: ListingStatus.DRAFT },
  });
}

async function onPaymentMethodDetached(
  prisma: PrismaClient,
  pm: Stripe.PaymentMethod,
): Promise<void> {
  const user = await prisma.user.findFirst({ where: { stripePaymentMethodId: pm.id } });
  if (!user) return;
  await prisma.user.update({
    where: { id: user.id },
    data: { stripePaymentMethodId: null, paymentValid: false },
  });
}

/** Dispatch a verified Stripe webhook event to the matching handler. */
export async function handleStripeEvent(prisma: PrismaClient, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'setup_intent.succeeded':
      return onSetupIntentSucceeded(prisma, event.data.object);
    case 'payment_intent.succeeded':
      return onPaymentSucceeded(prisma, event.data.object);
    case 'payment_intent.payment_failed':
      return onPaymentFailed(prisma, event.data.object);
    case 'payment_method.detached':
      return onPaymentMethodDetached(prisma, event.data.object);
    default:
      return; // unhandled event types are ignored
  }
}
