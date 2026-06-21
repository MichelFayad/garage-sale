'use client';

import { useCallback, useEffect, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { getStripe } from '../../../../lib/stripe';
import { trpc } from '../../../../lib/trpc';
import { FormMessage, SubmitButton } from '../../../(marketing)/_components/fields';

interface Status {
  paymentValid: boolean;
  hasCard: boolean;
  feeCents: number;
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Inner form rendered inside <Elements>: collects the card and confirms the
// SetupIntent. On success the setup_intent.succeeded webhook flips paymentValid.
function CardForm({ onSaved }: { onSaved: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: confirmError } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    });
    if (confirmError) {
      setError(confirmError.message ?? 'Could not save card');
      setBusy(false);
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <SubmitButton disabled={busy || !stripe}>{busy ? 'Saving…' : 'Save card'}</SubmitButton>
    </form>
  );
}

export function PaymentMethodForm() {
  const [status, setStatus] = useState<Status | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await trpc.billing.status.query());
    } catch {
      setError('Could not load billing status');
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const { clientSecret: secret } = await trpc.billing.createSetupIntent.mutate();
      setClientSecret(secret);
    } catch {
      setError('Could not start card setup');
    } finally {
      setBusy(false);
    }
  }

  async function onSaved() {
    setClientSecret(null);
    // The webhook flips paymentValid asynchronously; re-poll status shortly.
    await loadStatus();
  }

  async function onRemove() {
    setBusy(true);
    try {
      await trpc.billing.removeCard.mutate();
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <p className="text-gray-600">{error ?? 'Loading…'}</p>;
  }

  return (
    <div className="max-w-md space-y-4">
      <p className="text-gray-700">
        Per-post fee: <strong>{dollars(status.feeCents)}</strong> per published listing
        (non-refundable).
      </p>

      <div className="rounded border border-gray-200 p-4">
        {status.paymentValid ? (
          <p className="text-green-700">✓ Card on file — you can publish listings.</p>
        ) : status.hasCard ? (
          <p className="text-gray-600">Card saved — confirming with Stripe…</p>
        ) : (
          <p className="text-gray-600">No card on file. Add one to publish listings.</p>
        )}
      </div>

      {clientSecret ? (
        <Elements stripe={getStripe()} options={{ clientSecret }}>
          <CardForm onSaved={onSaved} />
        </Elements>
      ) : (
        <div className="space-y-2">
          <button
            onClick={startSetup}
            disabled={busy}
            className="w-full rounded bg-gray-900 px-3 py-2 font-medium text-white disabled:opacity-50"
          >
            {status.hasCard ? 'Replace card' : 'Add card'}
          </button>
          {status.hasCard && (
            <button
              onClick={onRemove}
              disabled={busy}
              className="w-full rounded border border-gray-300 px-3 py-2 font-medium text-gray-700 disabled:opacity-50"
            >
              Remove card
            </button>
          )}
        </div>
      )}

      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}
