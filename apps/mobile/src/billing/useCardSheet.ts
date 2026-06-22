// Card-on-file collection via the Stripe PaymentSheet. Creates a SetupIntent on
// the shared API, presents the native sheet, and reports the outcome. The webhook
// (apps/web) flips paymentValid once Stripe confirms the saved card.

import { PaymentSheetError, useStripe } from '@stripe/stripe-react-native';
import { trpc } from '../api/client';

export type CardSheetResult = { ok: boolean; cancelled?: boolean; error?: string };

export function useCardSheet(): () => Promise<CardSheetResult> {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  return async function addCard() {
    try {
      const { clientSecret } = await trpc.billing.createSetupIntent.mutate();
      const init = await initPaymentSheet({
        setupIntentClientSecret: clientSecret,
        merchantDisplayName: 'Garage Sale',
      });
      if (init.error) return { ok: false, error: init.error.message };
      const present = await presentPaymentSheet();
      if (present.error) {
        if (present.error.code === PaymentSheetError.Canceled)
          return { ok: false, cancelled: true };
        return { ok: false, error: present.error.message };
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not start card setup',
      };
    }
  };
}
